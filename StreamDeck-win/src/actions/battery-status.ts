import streamDeck, { action, SingletonAction } from "@elgato/streamdeck";
import type {
	DidReceiveSettingsEvent,
	KeyAction,
	KeyDownEvent,
	SendToPluginEvent,
	TitleParametersDidChangeEvent,
	WillAppearEvent,
	WillDisappearEvent,
} from "@elgato/streamdeck";
import { discovery } from "../providers/discovery";
import type { BatteryReading, DeviceKind, DiscoveredDevice } from "../providers/types";
import type { BatteryStyle, FaceColors } from "../ui/battery-svg";
import { batteryKeyImage, DEFAULT_COLORS, LEGACY_CHARGING_COLOR } from "../ui/battery-svg";

/** What, if anything, the plugin writes into the key's title. */
export type TitleMode = "none" | "device" | "percent";

/** What the small text line under the meter shows. */
export type NameSource = "device" | "title" | "auto";

export type BatterySettings = {
	/** Stable key of a device found by discovery (see providers/discovery.ts). */
	deviceKey?: string;
	/** Last known label/kind, so a disconnected device still renders sensibly. */
	deviceLabel?: string;
	deviceKind?: DeviceKind;
	refreshSeconds?: number;

	// Appearance
	style?: BatteryStyle;
	showIcon?: boolean;
	showPercent?: boolean;
	showName?: boolean;
	/** Whether that line shows the device name, the user's own title, or the better of the two. */
	nameSource?: NameSource;
	titleMode?: TitleMode;
	lowThreshold?: number;
	mediumThreshold?: number;
	colorLow?: string;
	colorMedium?: string;
	colorHigh?: string;
	colorCharging?: string;
	colorBackground?: string;
	colorForeground?: string;
	/** Flash the key's alert icon below this percentage; 0 disables. */
	alertBelow?: number;

	/** Set once the defaults below have been written out, so the PI shows them. */
	configured?: boolean;
	/** Bumped when a default changes in a way existing keys should pick up. */
	settingsVersion?: number;
};

/**
 * Messages from the property inspector. `isRefresh` is set by sdpi-components'
 * built-in refresh button; "rescan" comes from our own button.
 */
type UiMessage = { event?: string; isRefresh?: boolean };

const MIN_REFRESH_SECONDS = 15;

/** v2: the charging colour moved from blue to green. */
const SETTINGS_VERSION = 2;

/** Charging pulse: 8 steps of 450ms, i.e. a slow ~3.6s breath. */
const PULSE_INTERVAL_MS = 450;
const PULSE_STEPS = 8;

const DEFAULTS = {
	refreshSeconds: 60,
	style: "bar" as BatteryStyle,
	showIcon: true,
	showPercent: true,
	showName: false,
	nameSource: "auto" as NameSource,
	titleMode: "none" as TitleMode,
	lowThreshold: 20,
	mediumThreshold: 50,
	colorLow: DEFAULT_COLORS.low,
	colorMedium: DEFAULT_COLORS.medium,
	colorHigh: DEFAULT_COLORS.high,
	colorCharging: DEFAULT_COLORS.charging,
	colorBackground: DEFAULT_COLORS.background,
	colorForeground: DEFAULT_COLORS.foreground,
	alertBelow: 0,
};

@action({ UUID: "com.emilberglund.batterymonitor.battery-status" })
export class BatteryStatusAction extends SingletonAction<BatterySettings> {
	private readonly timers = new Map<string, NodeJS.Timeout>();
	/** Last reading drawn per key, so appearance edits can repaint without any I/O. */
	private readonly lastReadings = new Map<string, { reading: BatteryReading; kind: DeviceKind }>();
	/** Last settings drawn with, so the charging pulse can repaint without a round-trip. */
	private readonly lastSettings = new Map<string, BatterySettings>();
	private readonly pulseTimers = new Map<string, NodeJS.Timeout>();
	private readonly pulsePhase = new Map<string, number>();
	/** The user's own title per key, and whether Stream Deck is drawing it itself. */
	private readonly titles = new Map<string, { title: string; showTitle: boolean }>();
	/** Device and interval last applied per key, to spot what actually changed. */
	private readonly appliedDevice = new Map<string, string | undefined>();
	private readonly appliedInterval = new Map<string, number>();

	override async onWillAppear(ev: WillAppearEvent<BatterySettings>): Promise<void> {
		if (!ev.action.isKey()) return; // this action only declares a Keypad controller
		const settings = await this.ensureDefaults(ev.action, ev.payload.settings);
		await this.refresh(ev.action, settings);
		this.schedule(ev.action, settings);
	}

	override onWillDisappear(ev: WillDisappearEvent<BatterySettings>): void {
		this.clearTimer(ev.action.id);
		this.stopPulse(ev.action.id);
		this.titles.delete(ev.action.id);
		this.lastReadings.delete(ev.action.id);
		this.lastSettings.delete(ev.action.id);
		this.appliedDevice.delete(ev.action.id);
		this.appliedInterval.delete(ev.action.id);
	}

	/**
	 * Tracks the user's own title so it can be drawn in the key's own style, and
	 * repaints when it changes.
	 */
	override async onTitleParametersDidChange(ev: TitleParametersDidChangeEvent<BatterySettings>): Promise<void> {
		if (!ev.action.isKey()) return;

		const next = { title: ev.payload.title ?? "", showTitle: ev.payload.titleParameters.showTitle };
		const previous = this.titles.get(ev.action.id);
		this.titles.set(ev.action.id, next);

		// Setting the title ourselves (titleMode) echoes back through this event;
		// only repaint on a real change so that can't turn into a loop.
		if (previous?.title === next.title && previous?.showTitle === next.showTitle) return;

		const cached = this.lastReadings.get(ev.action.id);
		if (cached) await this.render(ev.action, ev.payload.settings, cached.reading, cached.kind);
	}

	override async onKeyDown(ev: KeyDownEvent<BatterySettings>): Promise<void> {
		// A press means "tell me now", so bypass the discovery cache.
		await this.refresh(ev.action, ev.payload.settings, true);
	}

	/**
	 * Applies property inspector edits immediately.
	 *
	 * Appearance settings (colours, style, toggles, thresholds) are redrawn from
	 * the last reading with no device I/O at all, so dragging a colour or a slider
	 * repaints the key as you go. Only a device change costs a lookup, and even
	 * then it reuses the cached scan the property inspector just triggered rather
	 * than forcing a fresh ~3s one.
	 */
	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<BatterySettings>): Promise<void> {
		if (!ev.action.isKey()) return;
		const settings = ev.payload.settings;
		const id = ev.action.id;

		const deviceChanged = this.appliedDevice.get(id) !== settings.deviceKey;
		const cached = this.lastReadings.get(id);

		if (cached && !deviceChanged) {
			await this.render(ev.action, settings, cached.reading, cached.kind);
		} else {
			await this.refresh(ev.action, settings);
		}

		// Restarting the timer on every keystroke would keep pushing the next poll
		// out of reach, so only do it when the interval itself changed.
		const seconds = this.intervalOf(settings);
		if (this.appliedInterval.get(id) !== seconds) this.schedule(ev.action, settings);
	}

	/**
	 * Feeds the property inspector's device dropdown. The list is whatever the
	 * providers can see right now; the refresh button drops the cache first.
	 */
	override async onSendToPlugin(ev: SendToPluginEvent<UiMessage, BatterySettings>): Promise<void> {
		const event = ev.payload?.event;
		if (event !== "getDevices" && event !== "rescan") return;

		const force = event === "rescan" || ev.payload?.isRefresh === true;
		streamDeck.logger.info(`battery-status: property inspector requested devices (force=${force})`);

		const devices = await discovery.list(force);
		const settings = await ev.action.getSettings();
		const items = devices.map((d) => ({
			label: d.supportsBattery ? d.label : `${d.label} (no battery data)`,
			value: d.key,
		}));

		// Keep a previously chosen but currently absent device selectable, otherwise
		// the dropdown would silently clear the user's configuration.
		if (settings.deviceKey && !devices.some((d) => d.key === settings.deviceKey)) {
			items.push({
				label: `${settings.deviceLabel ?? settings.deviceKey} (not detected)`,
				value: settings.deviceKey,
			});
		}

		if (items.length === 0) {
			items.push({ label: "No devices detected — press Rescan", value: "" });
		}

		await streamDeck.ui.sendToPropertyInspector({ event: "getDevices", items });
	}

	/**
	 * Writes the appearance defaults into settings the first time a key is used,
	 * so the property inspector's controls start out matching what's drawn rather
	 * than showing empty inputs.
	 */
	private async ensureDefaults(
		action: KeyAction<BatterySettings>,
		settings: BatterySettings,
	): Promise<BatterySettings> {
		const version = settings.settingsVersion ?? (settings.configured ? 1 : 0);
		if (settings.configured && version >= SETTINGS_VERSION) return settings;

		const migrated: BatterySettings = { ...settings };

		// v1 -> v2: charging went from blue to green. Only move keys still on the
		// old default; a colour the user picked themselves is left alone.
		if (version < 2 && (migrated.colorCharging === undefined || migrated.colorCharging === LEGACY_CHARGING_COLOR)) {
			migrated.colorCharging = DEFAULTS.colorCharging;
		}

		const merged = { ...DEFAULTS, ...migrated, configured: true, settingsVersion: SETTINGS_VERSION };
		await action.setSettings(merged);
		return merged;
	}

	private intervalOf(settings: BatterySettings): number {
		return Math.max(MIN_REFRESH_SECONDS, settings.refreshSeconds ?? DEFAULTS.refreshSeconds);
	}

	private schedule(action: KeyAction<BatterySettings>, settings: BatterySettings): void {
		this.clearTimer(action.id);
		const seconds = this.intervalOf(settings);

		const timer = setInterval(() => {
			// Read the settings fresh on every tick. Closing over the settings from
			// when the timer was created would repaint the key with a stale
			// appearance, silently undoing any edit made since.
			action
				.getSettings()
				.then((current) => this.refresh(action, current))
				.catch((err) => streamDeck.logger.error("battery-status: scheduled refresh failed", err));
		}, seconds * 1000);

		this.timers.set(action.id, timer);
		this.appliedInterval.set(action.id, seconds);
	}

	private clearTimer(actionId: string): void {
		const timer = this.timers.get(actionId);
		if (timer) {
			clearInterval(timer);
			this.timers.delete(actionId);
		}
	}

	private async refresh(
		action: KeyAction<BatterySettings>,
		settings: BatterySettings,
		force = false,
	): Promise<void> {
		this.appliedDevice.set(action.id, settings.deviceKey);

		try {
			const device = await this.resolve(action, settings, force);
			if (!device) {
				await this.draw(
					action,
					settings,
					{
						deviceLabel: settings.deviceLabel ?? "No device",
						percent: null,
						status: "not-found",
						detail: settings.deviceKey
							? `${settings.deviceLabel ?? settings.deviceKey} not detected`
							: "No battery-capable device detected",
					},
					settings.deviceKind ?? "other",
				);
				return;
			}

			await this.remember(action, settings, device);

			// discover() already read the battery for most providers; only pay for a
			// second round-trip when the scan didn't produce one (or it's stale).
			const reading = !force && device.reading ? device.reading : await this.readDevice(device);

			await this.draw(action, settings, reading, device.kind);
			if (reading.status === "error") {
				streamDeck.logger.warn(`battery-status: ${device.key} error: ${reading.detail}`);
			}

			// Alerting belongs to a real reading, not to a repaint — otherwise
			// dragging the "alert below" slider would flash the key continuously.
			const alertBelow = settings.alertBelow ?? DEFAULTS.alertBelow;
			if (alertBelow > 0 && reading.percent !== null && reading.percent < alertBelow) {
				await action.showAlert();
			}
		} catch (err) {
			streamDeck.logger.error("battery-status: refresh threw", err);
			await this.draw(
				action,
				settings,
				{ deviceLabel: settings.deviceLabel ?? "Error", percent: null, status: "error" },
				settings.deviceKind ?? "other",
			);
			await action.showAlert();
		}
	}

	/** Renders and remembers the reading, so later edits can repaint it for free. */
	private async draw(
		action: KeyAction<BatterySettings>,
		settings: BatterySettings,
		reading: BatteryReading,
		kind: DeviceKind,
	): Promise<void> {
		this.lastReadings.set(action.id, { reading, kind });
		this.lastSettings.set(action.id, settings);

		if (reading.status === "charging") this.startPulse(action);
		else this.stopPulse(action.id);

		await this.render(action, settings, reading, kind);
	}

	/**
	 * Drives the charging animation. Stream Deck rasterises the SVG once per
	 * setImage, so animation means re-sending the image; each frame is a pure
	 * re-render off the cached reading, with no device I/O.
	 */
	private startPulse(action: KeyAction<BatterySettings>): void {
		if (this.pulseTimers.has(action.id)) return;

		const timer = setInterval(() => {
			const cached = this.lastReadings.get(action.id);
			const settings = this.lastSettings.get(action.id);
			if (!cached || !settings || cached.reading.status !== "charging") {
				this.stopPulse(action.id);
				return;
			}

			const phase = ((this.pulsePhase.get(action.id) ?? 0) + 1) % PULSE_STEPS;
			this.pulsePhase.set(action.id, phase);

			this.render(action, settings, cached.reading, cached.kind, phase).catch((err) =>
				streamDeck.logger.error("battery-status: pulse frame failed", err),
			);
		}, PULSE_INTERVAL_MS);

		this.pulseTimers.set(action.id, timer);
	}

	private stopPulse(actionId: string): void {
		const timer = this.pulseTimers.get(actionId);
		if (timer) {
			clearInterval(timer);
			this.pulseTimers.delete(actionId);
		}
		this.pulsePhase.delete(actionId);
	}

	/** Maps the stored device key to a currently-detected device. */
	private async resolve(
		action: KeyAction<BatterySettings>,
		settings: BatterySettings,
		force: boolean,
	): Promise<DiscoveredDevice | undefined> {
		if (settings.deviceKey) return discovery.find(settings.deviceKey, force);

		// Nothing configured yet: pick something useful so a freshly dropped key
		// isn't blank, and persist it so the property inspector agrees.
		const devices = await discovery.list(force);
		const pick = devices.find((d) => d.supportsBattery) ?? devices[0];
		if (pick) await action.setSettings({ ...settings, deviceKey: pick.key });
		return pick;
	}

	private async readDevice(device: DiscoveredDevice): Promise<BatteryReading> {
		const provider = discovery.provider(device.providerId);
		if (!provider) {
			return {
				deviceLabel: device.label,
				percent: null,
				status: "error",
				detail: `Unknown provider ${device.providerId}`,
			};
		}
		return provider.read(device);
	}

	/** Caches label/kind in settings so a disconnected device still renders right. */
	private async remember(
		action: KeyAction<BatterySettings>,
		settings: BatterySettings,
		device: DiscoveredDevice,
	): Promise<void> {
		if (settings.deviceLabel === device.label && settings.deviceKind === device.kind) return;
		await action.setSettings({
			...settings,
			deviceKey: device.key,
			deviceLabel: device.label,
			deviceKind: device.kind,
		});
	}

	/**
	 * Text for the small line under the meter — empty when there shouldn't be one.
	 *
	 * Stream Deck composites its own title over our image and refuses to let a
	 * plugin clear a title the user typed, so the plugin can only draw the title
	 * itself when the user has hidden Stream Deck's ("T" toggle above the Title
	 * field). While Stream Deck is still drawing it, "auto" falls back to the
	 * device name rather than showing the same text twice.
	 */
	private nameLine(
		action: KeyAction<BatterySettings>,
		settings: BatterySettings,
		reading: BatteryReading,
	): string {
		if (!(settings.showName ?? DEFAULTS.showName)) return "";

		const source = settings.nameSource ?? DEFAULTS.nameSource;
		const info = this.titles.get(action.id);
		// Stream Deck titles can be multi-line; the key face has room for one.
		const custom = (info?.title ?? "").replace(/\s+/g, " ").trim();

		const wantsTitle = source === "title" || (source === "auto" && custom !== "");
		if (!wantsTitle) return reading.deviceLabel;
		if (info?.showTitle) return source === "auto" ? reading.deviceLabel : "";

		return custom;
	}

	private async render(
		action: KeyAction<BatterySettings>,
		settings: BatterySettings,
		reading: BatteryReading,
		kind: DeviceKind,
		phase = 0,
	): Promise<void> {
		const colors: FaceColors = {
			low: settings.colorLow ?? DEFAULTS.colorLow,
			medium: settings.colorMedium ?? DEFAULTS.colorMedium,
			high: settings.colorHigh ?? DEFAULTS.colorHigh,
			charging: settings.colorCharging ?? DEFAULTS.colorCharging,
			background: settings.colorBackground ?? DEFAULTS.colorBackground,
			foreground: settings.colorForeground ?? DEFAULTS.colorForeground,
		};

		const name = this.nameLine(action, settings, reading);

		await action.setImage(
			batteryKeyImage({
				percent: reading.percent,
				status: reading.status,
				kind,
				name,
				style: settings.style ?? DEFAULTS.style,
				showIcon: settings.showIcon ?? DEFAULTS.showIcon,
				showPercent: settings.showPercent ?? DEFAULTS.showPercent,
				showName: name !== "",
				lowThreshold: settings.lowThreshold ?? DEFAULTS.lowThreshold,
				mediumThreshold: settings.mediumThreshold ?? DEFAULTS.mediumThreshold,
				colors,
				// Sine so the breath eases at both ends instead of ramping linearly.
				pulse: (Math.sin((2 * Math.PI * phase) / PULSE_STEPS) + 1) / 2,
			}),
		);

		// "none" deliberately never calls setTitle, so a title typed by the user in
		// the property inspector survives.
		const titleMode = settings.titleMode ?? DEFAULTS.titleMode;
		if (titleMode === "device") {
			await action.setTitle(reading.deviceLabel);
		} else if (titleMode === "percent") {
			await action.setTitle(reading.percent === null ? "" : `${reading.percent}%`);
		}
	}
}
