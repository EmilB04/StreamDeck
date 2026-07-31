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
import { findHeadsetControl, HEADSETCONTROL_RELEASES } from "../providers/headsetcontrol";
import type { BatteryReading, DeviceKind, DiscoveredDevice } from "../providers/types";
import { batteryKeyImage, noticeKeyImage } from "../ui/battery-svg";
import { listApps } from "./apps";
import { openTarget } from "./launch";
import type { BatterySettings, PollMode } from "./settings";
import { DEFAULTS, faceColors, migrate, nextPollSeconds, refreshSeconds } from "./settings";

/** Messages from the property inspector; `isRefresh` comes from its refresh button. */
type UiMessage = { event?: string; isRefresh?: boolean };

/** Shown on the key when it's pressed while its device isn't connected. */
const DISCONNECTED_NOTICE = "Device is Disconnected";
const NOTICE_MS = 2500;

/** Charging pulse: 8 steps of 450ms, i.e. a slow ~3.6s breath. */
const PULSE_INTERVAL_MS = 450;
const PULSE_STEPS = 8;

/**
 * How long a last-known level's timestamp may drift before it's rewritten. The
 * percentage is persisted the moment it changes; refreshing the timestamp alone
 * on every poll would be a settings write per minute forever, and the age is
 * only ever shown rounded, so a few minutes of slack costs nothing.
 */
const LAST_SEEN_TOUCH_MS = 10 * 60_000;

/**
 * Everything the plugin tracks for one visible key. A key's timers, its last
 * reading and the bookkeeping used to spot what actually changed all live and
 * die together, so they're one record rather than a map each.
 */
type KeyState = {
	/**
	 * Polling is a chain of one-shot timers rather than an interval, because in
	 * adaptive mode the next wait depends on what the last reading said.
	 */
	pollTimer?: NodeJS.Timeout;
	/** Configured interval and mode the chain was armed with, to spot an edit. */
	pollBase?: number;
	pollMode?: PollMode;
	/** Consecutive readings that said the same thing; drives the adaptive backoff. */
	unchanged: number;
	/**
	 * Whether the level was last seen rising. The only charging signal available
	 * for a device whose provider can't report one (see inferCharging).
	 */
	rising?: boolean;
	pulseTimer?: NodeJS.Timeout;
	pulsePhase: number;
	/**
	 * Last thing drawn: the live reading (before any last-known substitution),
	 * the device kind, and the settings drawn with. Enough to repaint for a
	 * colour edit or a pulse frame without touching the device.
	 */
	drawn?: { reading: BatteryReading; kind: DeviceKind; settings: BatterySettings };
	/** The user's own title, and whether Stream Deck is drawing it itself. */
	title?: { title: string; showTitle: boolean };
	/** Device the key was last refreshed for, to spot a changed one. */
	deviceKey?: string;
	/** A message is on the key; painting the face is suspended until it clears. */
	showingNotice?: boolean;
	noticeTimer?: NodeJS.Timeout;
	/**
	 * Last title written, boxed so "never written" is distinguishable from
	 * "written as undefined" — the latter is what hands the title back to
	 * Stream Deck.
	 */
	titleApplied?: { value: string | undefined };
};

/**
 * How a device reads in the picker. Everything detected is listed, so the entry
 * has to say why one of them won't show a percentage.
 */
function pickerLabel(device: DiscoveredDevice): string {
	if (device.supportsBattery) return device.label;
	if (device.reading?.status === "mains") return `${device.label} (mains powered)`;
	return `${device.label} (no battery data)`;
}

/** One line for the property inspector's status strip, in the user's terms. */
function statusWording(reading: BatteryReading): string {
	switch (reading.status) {
		case "charging":
			return reading.detail === "Charge complete" ? "On the charger, full" : "Charging";
		case "mains":
			return "Mains powered";
		case "stale":
			return "Disconnected — last known level";
		case "not-found":
			return "Not detected";
		case "unsupported":
			return "No battery to read";
		case "error":
			return "Couldn't be read";
		default:
			return "Connected";
	}
}

/** Which of the strip's three looks to use. */
function statusTone(status: BatteryReading["status"]): "charging" | "offline" | "ok" | "idle" {
	if (status === "charging") return "charging";
	if (status === "stale" || status === "not-found" || status === "error") return "offline";
	if (status === "ok" || status === "mains") return "ok";
	return "idle";
}

/**
 * Coarse "how long ago", e.g. "12m" / "3h" / "2d". Empty for anything under a
 * minute (and for a missing timestamp), where "0m ago" would say nothing.
 */
function ageLabel(at: number | undefined): string {
	if (at === undefined) return "";
	const minutes = Math.floor((Date.now() - at) / 60_000);
	if (minutes < 1) return "";
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h`;
	return `${Math.floor(hours / 24)}d`;
}

@action({ UUID: "com.emilberglund.batterymonitor.battery-status" })
export class BatteryStatusAction extends SingletonAction<BatterySettings> {
	private readonly keys = new Map<string, KeyState>();

	override async onWillAppear(ev: WillAppearEvent<BatterySettings>): Promise<void> {
		if (!ev.action.isKey()) return; // this action only declares a Keypad controller
		const settings = await this.ensureDefaults(ev.action, ev.payload.settings);
		await this.refresh(ev.action, settings);
		this.schedule(ev.action, settings);
	}

	override onWillDisappear(ev: WillDisappearEvent<BatterySettings>): void {
		const state = this.keys.get(ev.action.id);
		if (!state) return;
		clearTimeout(state.pollTimer);
		clearInterval(state.pulseTimer);
		clearTimeout(state.noticeTimer);
		this.keys.delete(ev.action.id);
	}

	/**
	 * Tracks the user's own title so it can be drawn in the key's own style, and
	 * repaints when it changes.
	 */
	override async onTitleParametersDidChange(ev: TitleParametersDidChangeEvent<BatterySettings>): Promise<void> {
		if (!ev.action.isKey()) return;

		const state = this.state(ev.action.id);
		const next = { title: ev.payload.title ?? "", showTitle: ev.payload.titleParameters.showTitle };
		const previous = state.title;
		state.title = next;

		// Setting the title ourselves (titleMode) echoes back through this event;
		// only repaint on a real change so that can't turn into a loop.
		if (previous?.title === next.title && previous?.showTitle === next.showTitle) return;

		const drawn = state.drawn;
		if (drawn) await this.render(ev.action, ev.payload.settings, drawn.reading, drawn.kind);
	}

	/**
	 * A press means "tell me now", so it bypasses the discovery cache — and a
	 * forced scan takes a couple of seconds.
	 *
	 * The warning therefore goes up *before* the scan rather than after it. The
	 * key already knows the device was missing a moment ago, and that's what the
	 * press is asking about; waiting for the rescan to confirm it would leave the
	 * press looking ignored for as long as the scan takes.
	 */
	override async onKeyDown(ev: KeyDownEvent<BatterySettings>): Promise<void> {
		// First, because it's the part the press is visibly for: waiting on a scan
		// before launching would make the app feel slow to open.
		this.openConfiguredTarget(ev.payload.settings);

		const known = this.state(ev.action.id).drawn;
		const wasDisconnected = known?.reading.status === "not-found";
		if (wasDisconnected && known) await this.notify(ev.action, known.settings);

		await this.refresh(ev.action, ev.payload.settings, true);

		// The scan can also be what discovers the device is gone, in which case
		// this is the first chance to say so.
		const now = this.state(ev.action.id).drawn;
		if (!wasDisconnected && now?.reading.status === "not-found") {
			await this.notify(ev.action, now.settings);
		}
	}

	/**
	 * Opens the app, file or URL the key is pointed at, if it's set to.
	 *
	 * A failure here is logged rather than surfaced: the warning the key can show
	 * is about the device, and overloading it to also mean "that path is wrong"
	 * would make both meanings useless.
	 */
	private openConfiguredTarget(settings: BatterySettings): void {
		// A typed path beats the picker, so the text box can override without
		// having to clear the list first.
		const target = settings.pressCustomTarget?.trim() || settings.pressTarget?.trim();
		if (!target) return;

		try {
			streamDeck.logger.info(`battery-status: press opens ${target}`);
			openTarget(target);
		} catch (err) {
			streamDeck.logger.error(`battery-status: couldn't open ${target}`, err);
		}
	}

	/**
	 * Puts a message on the key for a moment. Painting is suspended while it's up
	 * — the refresh running behind it would otherwise replace it with the face
	 * mid-message — and resumes when the face is restored.
	 */
	private async notify(action: KeyAction<BatterySettings>, settings: BatterySettings): Promise<void> {
		const state = this.state(action.id);
		clearTimeout(state.noticeTimer);
		state.showingNotice = true;

		await action.showAlert();
		await action.setImage(noticeKeyImage(DISCONNECTED_NOTICE, faceColors(settings)));

		state.noticeTimer = setTimeout(() => {
			state.showingNotice = false;
			const current = state.drawn;
			if (!current) return;
			this.render(action, current.settings, current.reading, current.kind).catch((err) =>
				streamDeck.logger.error("battery-status: restoring the face after a notice failed", err),
			);
		}, NOTICE_MS);
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
		const state = this.state(ev.action.id);

		const deviceChanged = state.deviceKey !== settings.deviceKey;
		if (state.drawn && !deviceChanged) {
			await this.render(ev.action, settings, state.drawn.reading, state.drawn.kind);
			state.drawn.settings = settings;
		} else {
			await this.refresh(ev.action, settings);
		}

		// Restarting the timer on every keystroke would keep pushing the next poll
		// out of reach, so only do it when the interval or the mode changed.
		const mode = settings.pollMode ?? DEFAULTS.pollMode;
		if (state.pollBase !== refreshSeconds(settings) || state.pollMode !== mode) {
			this.schedule(ev.action, settings);
		}
	}

	/**
	 * Feeds the property inspector's device dropdown. The list is whatever the
	 * providers can see right now; its refresh button drops the cache first.
	 */
	override async onSendToPlugin(ev: SendToPluginEvent<UiMessage, BatterySettings>): Promise<void> {
		if (ev.payload?.event === "getStatus") {
			await this.sendStatus(ev.action.id);
			return;
		}
		if (ev.payload?.event === "getApps") {
			await this.sendApps(ev.action, ev.payload?.isRefresh === true);
			return;
		}
		if (ev.payload?.event === "getHeadsetTool") {
			const binary = await findHeadsetControl();
			await streamDeck.ui.sendToPropertyInspector({ event: "getHeadsetTool", installed: binary !== null, binary });
			return;
		}
		if (ev.payload?.event === "openHeadsetTool") {
			// Stream Deck opens it in the real browser; the inspector is a webview
			// with no place to put a page.
			await streamDeck.system.openUrl(HEADSETCONTROL_RELEASES);
			return;
		}
		if (ev.payload?.event !== "getDevices") return;

		const force = ev.payload?.isRefresh === true;
		streamDeck.logger.info(`battery-status: property inspector requested devices (force=${force})`);

		const devices = await discovery.list(force);
		const settings = await ev.action.getSettings();
		const items = devices.map((d) => ({ label: pickerLabel(d), value: d.key }));

		// Keep a previously chosen but currently absent device selectable, otherwise
		// the dropdown would silently clear the user's configuration.
		if (settings.deviceKey && !devices.some((d) => d.key === settings.deviceKey)) {
			items.push({
				label: `${settings.deviceLabel ?? settings.deviceKey} (not detected)`,
				value: settings.deviceKey,
			});
		}

		if (items.length === 0) {
			items.push({ label: "No devices detected — press the refresh button", value: "" });
		}

		await streamDeck.ui.sendToPropertyInspector({ event: "getDevices", items });
	}

	/**
	 * Tells the property inspector what the key is currently showing, so the panel
	 * opens with an answer rather than only questions.
	 *
	 * This reports the reading already drawn — no device is touched — so the panel
	 * can ask for it as often as it likes.
	 */
	private async sendStatus(actionId: string): Promise<void> {
		const drawn = this.keys.get(actionId)?.drawn;
		if (!drawn) {
			await streamDeck.ui.sendToPropertyInspector({ event: "getStatus", status: null });
			return;
		}

		const settings = drawn.settings;
		const reading = this.forPowerSource(settings, this.withLastKnown(settings, drawn.reading));

		await streamDeck.ui.sendToPropertyInspector({
			event: "getStatus",
			status: {
				label: reading.deviceLabel,
				percent: reading.percent,
				state: statusWording(reading),
				tone: statusTone(reading.status),
			},
		});
	}

	/**
	 * Feeds the property inspector's app picker with what the Start menu can
	 * launch, so a key can be pointed at an app without anyone typing a path.
	 */
	private async sendApps(action: SendToPluginEvent<UiMessage, BatterySettings>["action"], force: boolean): Promise<void> {
		const apps = await listApps(force);
		const items = apps.map((app) => ({ label: app.name, value: app.target }));

		// Leaving the key on "just read the battery" has to be reachable from the
		// picker itself; there's no separate switch to turn opening off.
		items.unshift({ label: "Don't open anything", value: "" });

		await streamDeck.ui.sendToPropertyInspector({ event: "getApps", items });
	}

	private state(actionId: string): KeyState {
		let state = this.keys.get(actionId);
		if (!state) {
			state = { pulsePhase: 0, unchanged: 0 };
			this.keys.set(actionId, state);
		}
		return state;
	}

	private async ensureDefaults(
		action: KeyAction<BatterySettings>,
		settings: BatterySettings,
	): Promise<BatterySettings> {
		const migrated = migrate(settings);
		if (!migrated) return settings;
		await action.setSettings(migrated);
		return migrated;
	}

	/**
	 * Arms the next poll. Each tick re-arms itself, so an adaptive key can widen
	 * or narrow its own interval as the reading changes.
	 */
	private schedule(action: KeyAction<BatterySettings>, settings: BatterySettings): void {
		const state = this.state(action.id);
		clearTimeout(state.pollTimer);

		state.pollBase = refreshSeconds(settings);
		state.pollMode = settings.pollMode ?? DEFAULTS.pollMode;

		const seconds = nextPollSeconds(settings, state.drawn?.reading, state.unchanged);
		streamDeck.logger.debug(`battery-status: next check in ${seconds}s (${state.pollMode}, ${state.unchanged} unchanged)`);

		state.pollTimer = setTimeout(() => {
			// Read the settings fresh on every tick. Closing over the settings from
			// when the timer was created would repaint the key with a stale
			// appearance, silently undoing any edit made since.
			action
				.getSettings()
				.then(async (current) => {
					await this.refresh(action, current);
					this.schedule(action, current);
				})
				.catch((err) => {
					streamDeck.logger.error("battery-status: scheduled refresh failed", err);
					// Keep the chain alive; a failed tick shouldn't stop the key updating.
					this.schedule(action, settings);
				});
		}, seconds * 1000);
	}

	private async refresh(
		action: KeyAction<BatterySettings>,
		settings: BatterySettings,
		force = false,
	): Promise<void> {
		this.state(action.id).deviceKey = settings.deviceKey;

		try {
			const device = await this.resolve(action, settings, force);
			if (!device) {
				// A device that comes back at a higher level was charged somewhere
				// else, which isn't the same as charging now.
				this.state(action.id).rising = false;
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

			// discover() already read the battery for most providers; only pay for a
			// second round-trip when the scan didn't produce one (or it's stale).
			const reported = !force && device.reading ? device.reading : await this.readDevice(device);

			// Compared against the stored level, so this has to happen before
			// `remember` overwrites it with the new one.
			const live = this.inferCharging(action.id, settings, device, reported);

			// Persist first: a fresh percentage becomes the fallback for the next
			// time the device is gone, and `remember` may correct the label/kind.
			const current = await this.remember(action, settings, device, live);

			await this.draw(action, current, live, device.kind);
			if (live.status === "error") {
				streamDeck.logger.warn(`battery-status: ${device.key} error: ${live.detail}`);
			}

			// Alerting belongs to a real reading, not to a repaint — otherwise
			// dragging the "alert below" slider would flash the key continuously.
			// A last-known level isn't a reading either: a device left off would
			// otherwise flash forever at whatever it read before it went away.
			const alertBelow = current.alertBelow ?? DEFAULTS.alertBelow;
			if (alertBelow > 0 && live.percent !== null && live.percent < alertBelow) {
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

	/**
	 * Marks a device as charging when its level is going up, for providers that
	 * can't tell us directly.
	 *
	 * A source like the Windows PnP battery property gives a percentage and
	 * nothing else, so a phone on a charger looks exactly like one in a pocket.
	 * A level that has risen since the last reading is the one thing that can't
	 * happen off a charger, so that's the signal; it stays set while the level
	 * holds (a phone sitting at 100% is still plugged in) and clears the moment
	 * the level drops.
	 *
	 * It is a guess, and it's wrong for a while in one case: unplugging at a level
	 * the device then holds keeps the bolt until the first drop.
	 */
	private inferCharging(
		actionId: string,
		settings: BatterySettings,
		device: DiscoveredDevice,
		reading: BatteryReading,
	): BatteryReading {
		const provider = discovery.provider(device.providerId);
		if (provider?.reportsCharging !== false) return reading;
		if (reading.status !== "ok" || reading.percent === null) return reading;

		const state = this.state(actionId);
		const previous = settings.lastPercent;

		if (previous !== undefined) {
			if (reading.percent > previous) state.rising = true;
			else if (reading.percent < previous) state.rising = false;
		}

		if (!state.rising) return reading;
		return { ...reading, status: "charging", detail: "Level rising — assumed to be charging" };
	}

	/**
	 * Substitutes the last known level when the live reading has no number of its
	 * own, so a device that's off or out of range shows where it was rather than a
	 * dash. The result is marked "stale" so the face renders it faded — the level
	 * is still useful, it just isn't current.
	 */
	private withLastKnown(settings: BatterySettings, reading: BatteryReading): BatteryReading {
		if (reading.percent !== null) return reading;
		if (!(settings.showLastKnown ?? DEFAULTS.showLastKnown)) return reading;
		// "unsupported" means the device exposes no battery at all, so there is
		// nothing it could have been at; leave that case saying so.
		if (reading.status !== "not-found" && reading.status !== "error") return reading;

		const percent = settings.lastPercent;
		if (percent === undefined) return reading;

		const age = ageLabel(settings.lastSeenAt);
		return {
			...reading,
			percent,
			status: "stale",
			detail: `${reading.detail ?? reading.deviceLabel} — last known ${percent}%${age ? ` (${age} ago)` : ""}`,
		};
	}

	/**
	 * Applies the key's power-source setting. Telling a key its device is always
	 * plugged in wins over whatever came back: a Bluetooth speaker that reports no
	 * level is indistinguishable from a headset whose battery can't be read, and
	 * only the user knows which one is on the desk.
	 */
	private forPowerSource(settings: BatterySettings, reading: BatteryReading): BatteryReading {
		if ((settings.powerSource ?? DEFAULTS.powerSource) !== "mains") return reading;
		if (reading.status === "mains") return reading;
		return { deviceLabel: reading.deviceLabel, percent: null, status: "mains", detail: "Always plugged in" };
	}

	/**
	 * Renders and remembers the reading, so later edits can repaint it for free.
	 * What's cached is the live reading, before any last-known substitution — the
	 * substitution depends on settings, and doing it at render time is what lets
	 * toggling "last known level" repaint without touching the device.
	 */
	private async draw(
		action: KeyAction<BatterySettings>,
		settings: BatterySettings,
		reading: BatteryReading,
		kind: DeviceKind,
	): Promise<void> {
		const state = this.state(action.id);

		// Counted before the new reading replaces the old one; adaptive polling
		// backs off while this keeps climbing.
		const previous = state.drawn?.reading;
		const same = previous?.percent === reading.percent && previous?.status === reading.status;
		state.unchanged = same ? state.unchanged + 1 : 0;

		state.drawn = { reading, kind, settings };

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
		const state = this.state(action.id);
		if (state.pulseTimer) return;

		state.pulseTimer = setInterval(() => {
			const drawn = state.drawn;
			if (!drawn || drawn.reading.status !== "charging") {
				this.stopPulse(action.id);
				return;
			}

			state.pulsePhase = (state.pulsePhase + 1) % PULSE_STEPS;

			this.render(action, drawn.settings, drawn.reading, drawn.kind, state.pulsePhase).catch((err) =>
				streamDeck.logger.error("battery-status: pulse frame failed", err),
			);
		}, PULSE_INTERVAL_MS);
	}

	private stopPulse(actionId: string): void {
		const state = this.keys.get(actionId);
		if (!state?.pulseTimer) return;
		clearInterval(state.pulseTimer);
		state.pulseTimer = undefined;
		state.pulsePhase = 0;
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

	/**
	 * Caches what a disconnected device still needs to render: its label and kind,
	 * plus the last percentage it actually reported. Both go out in one write, so
	 * neither can overwrite the other with a stale copy of the settings.
	 *
	 * Returns the settings as they now stand, which the caller draws with.
	 */
	private async remember(
		action: KeyAction<BatterySettings>,
		settings: BatterySettings,
		device: DiscoveredDevice,
		reading: BatteryReading,
	): Promise<BatterySettings> {
		const patch: BatterySettings = {};

		if (settings.deviceLabel !== device.label || settings.deviceKind !== device.kind) {
			patch.deviceKey = device.key;
			patch.deviceLabel = device.label;
			patch.deviceKind = device.kind;
		}

		if (reading.percent !== null) {
			const drifted = Date.now() - (settings.lastSeenAt ?? 0) > LAST_SEEN_TOUCH_MS;
			if (settings.lastPercent !== reading.percent || drifted) {
				patch.lastPercent = reading.percent;
				patch.lastSeenAt = Date.now();
			}
		}

		if (Object.keys(patch).length === 0) return settings;

		const merged = { ...settings, ...patch };
		await action.setSettings(merged);
		return merged;
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
		const state = this.state(action.id);
		const info = state.title;

		// A title this plugin wrote is not a title the user chose. Without this,
		// "device name" or "percentage" mode would echo back through
		// titleParametersDidChange and read as a custom title, suppressing the
		// name line the user actually asked for.
		const raw = info?.title === state.titleApplied?.value ? "" : (info?.title ?? "");
		// Stream Deck titles can be multi-line; the key face has room for one.
		const custom = raw.replace(/\s+/g, " ").trim();

		const device = this.deviceLine(settings, reading);
		const wantsTitle = source === "title" || (source === "auto" && custom !== "");
		if (!wantsTitle) return device;

		// A title the user typed replaces the device name rather than joining it.
		// While Stream Deck is drawing that title itself, the key already carries
		// the words, so the plugin draws no line at all instead of printing the
		// device name underneath and having the key say two different things.
		if (info?.showTitle) return "";

		return custom;
	}

	/**
	 * The device's own line: its label, prefixed with how long ago the level was
	 * read while it's offline. The age goes first because the line is truncated
	 * from the right, and "how old is this number" is the part worth keeping.
	 */
	private deviceLine(settings: BatterySettings, reading: BatteryReading): string {
		if (reading.status !== "stale") return reading.deviceLabel;
		const age = ageLabel(settings.lastSeenAt);
		return age ? `${age} · ${reading.deviceLabel}` : reading.deviceLabel;
	}

	/** Paints the key from a live reading; `live` is what came off the device. */
	private async render(
		action: KeyAction<BatterySettings>,
		settings: BatterySettings,
		live: BatteryReading,
		kind: DeviceKind,
		phase = 0,
	): Promise<void> {
		// A message owns the key while it's up; the reading behind it is still
		// cached, and gets drawn when the message clears.
		if (this.state(action.id).showingNotice) return;

		const reading = this.forPowerSource(settings, this.withLastKnown(settings, live));
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
				colors: faceColors(settings),
				// Sine so the breath eases at both ends instead of ramping linearly.
				pulse: (Math.sin((2 * Math.PI * phase) / PULSE_STEPS) + 1) / 2,
			}),
		);

		await this.applyTitle(action, settings, reading);
	}

	/**
	 * Writes the key's title, or gives it back.
	 *
	 * Switching away from "device name" or "percentage" has to actively undo what
	 * was written, otherwise the last title the plugin set stays on the key for
	 * good. `setTitle()` with no argument is the undo: Stream Deck restores the
	 * title from the manifest, and a title the user typed is never ours to
	 * overwrite in the first place.
	 *
	 * The applied value is remembered so a repaint — a pulse frame, a colour
	 * edit — doesn't re-send a title that hasn't changed. It starts unset rather
	 * than empty so the first paint after a restart always writes, which is what
	 * clears a title left behind by a previous run.
	 */
	private async applyTitle(
		action: KeyAction<BatterySettings>,
		settings: BatterySettings,
		reading: BatteryReading,
	): Promise<void> {
		const mode = settings.titleMode ?? DEFAULTS.titleMode;

		let wanted: string | undefined;
		if (mode === "device") {
			wanted = reading.deviceLabel;
		} else if (mode === "percent") {
			// A last-known level gets a "~" so the title doesn't claim to be current.
			const prefix = reading.status === "stale" ? "~" : "";
			wanted = reading.percent === null ? "" : `${prefix}${reading.percent}%`;
		}

		const state = this.state(action.id);
		if (state.titleApplied?.value === wanted) return;

		await action.setTitle(wanted);
		state.titleApplied = { value: wanted };
	}
}
