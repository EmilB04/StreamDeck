import streamDeck, { action, SingletonAction } from "@elgato/streamdeck";
import type {
	DidReceiveSettingsEvent,
	KeyAction,
	KeyDownEvent,
	SendToPluginEvent,
	WillAppearEvent,
	WillDisappearEvent,
} from "@elgato/streamdeck";
import { applyAppearance, shareAppearance, sharedAppearance } from "./appearance";
import { listApps } from "./apps";
import { withRenames } from "./renames";
import { discovery } from "../providers/discovery";
import type { BatteryReading, DeviceKind, DiscoveredDevice } from "../providers/types";
import { batteryKeyImage } from "../ui/battery-svg";
import type { LowestBatterySettings } from "./settings";
import {
	DEFAULTS,
	extractAppearance,
	faceColors,
	migrate,
	nextPollSeconds,
	refreshSeconds,
	watchIncludes,
} from "./settings";
import type { Appearance } from "./settings";
import { openTarget } from "./launch";

/** Messages from the property inspector; `isRefresh` comes from its refresh button. */
type UiMessage = { event?: string; isRefresh?: boolean };

/** Charging pulse: 8 steps of 450ms, matching the single-device action. */
const PULSE_INTERVAL_MS = 450;
const PULSE_STEPS = 8;

type KeyState = {
	pollTimer?: NodeJS.Timeout;
	pollBase?: number;
	pollMode?: string;
	unchanged: number;
	/** Whether the warning already fired for this trip below the threshold. */
	alerted?: boolean;
	pulseTimer?: NodeJS.Timeout;
	pulsePhase: number;
	drawn?: { reading: BatteryReading; kind: DeviceKind; settings: LowestBatterySettings };
};

/**
 * One key for a deskful of devices: whichever has least charge left.
 *
 * The single-device action answers "how is this headset doing"; this one
 * answers "is anything about to die on me", which is the question you actually
 * have when five keys each show a healthy number. It reads nothing itself —
 * discovery has already collected every device's level, so this is a choice
 * made over readings that exist, not extra work on the devices.
 */
@action({ UUID: "com.emilberglund.batterymonitor.lowest-battery" })
export class LowestBatteryAction extends SingletonAction<LowestBatterySettings> {
	private readonly keys = new Map<string, KeyState>();

	override async onWillAppear(ev: WillAppearEvent<LowestBatterySettings>): Promise<void> {
		if (!ev.action.isKey()) return;
		const settings = await this.ensureDefaults(ev.action, ev.payload.settings);
		await this.refresh(ev.action, settings);
		this.schedule(ev.action, settings);
	}

	override onWillDisappear(ev: WillDisappearEvent<LowestBatterySettings>): void {
		const state = this.keys.get(ev.action.id);
		if (!state) return;
		clearTimeout(state.pollTimer);
		clearInterval(state.pulseTimer);
		this.keys.delete(ev.action.id);
	}

	override async onKeyDown(ev: KeyDownEvent<LowestBatterySettings>): Promise<void> {
		const target = ev.payload.settings.pressCustomTarget?.trim() || ev.payload.settings.pressTarget?.trim();
		if (target) {
			try {
				openTarget(target);
			} catch (err) {
				streamDeck.logger.error(`lowest-battery: couldn't open ${target}`, err);
			}
		}

		await this.refresh(ev.action, ev.payload.settings, true);
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<LowestBatterySettings>): Promise<void> {
		if (!ev.action.isKey()) return;
		const settings = ev.payload.settings;
		const state = this.state(ev.action.id);

		// Appearance edits repaint from what's already known; only a changed
		// filter needs the list looked at again, and even that reuses the cache.
		if (state.drawn) {
			state.drawn.settings = settings;
			await this.render(ev.action, settings, state.drawn.reading, state.drawn.kind);
		}
		await this.refresh(ev.action, settings);

		const mode = settings.pollMode ?? DEFAULTS.pollMode;
		if (state.pollBase !== refreshSeconds(settings) || state.pollMode !== mode) {
			this.schedule(ev.action, settings);
		}
	}

	/**
	 * Datasources for this action's property inspector. Messages arrive at the
	 * action that owns the panel, so both handlers live here as well as in the
	 * single-device action.
	 */
	override async onSendToPlugin(ev: SendToPluginEvent<UiMessage, LowestBatterySettings>): Promise<void> {
		if (ev.payload?.event === "getApps") {
			const apps = await listApps(ev.payload?.isRefresh === true);
			const items = apps.map((app) => ({ label: app.name, value: app.target }));
			items.unshift({ label: "Don't open anything", value: "" });
			await streamDeck.ui.sendToPropertyInspector({ event: "getApps", items });
			return;
		}

		if (ev.payload?.event === "shareAppearance") {
			const source = this.keys.get(ev.action.id)?.drawn?.settings;
			if (source) await shareAppearance(extractAppearance(source));
			return;
		}

		if (ev.payload?.event === "getStatus") {
			const drawn = this.keys.get(ev.action.id)?.drawn;
			await streamDeck.ui.sendToPropertyInspector({
				event: "getStatus",
				status: drawn
					? {
							label: drawn.reading.deviceLabel,
							percent: drawn.reading.percent,
							state: drawn.reading.status === "charging" ? "Charging — lowest of the lot" : "Lowest right now",
							tone: drawn.reading.percent === null ? "offline" : "ok",
						}
					: null,
			});
		}
	}

	/** Adopts a shared look. Called for every key when global settings change. */
	async applyShared(appearance: Appearance): Promise<void> {
		await applyAppearance(this.actions, appearance);
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
		action: KeyAction<LowestBatterySettings>,
		settings: LowestBatterySettings,
	): Promise<LowestBatterySettings> {
		const migrated = migrate(settings);
		if (!migrated) return settings;

		// A new key matches the look already shared across the deck, if there is one.
		const shared = settings.configured ? undefined : await sharedAppearance();
		const merged = { watch: DEFAULTS.watch, ...migrated, ...(shared ?? {}) } as LowestBatterySettings;

		await action.setSettings(merged);
		return merged;
	}

	private schedule(action: KeyAction<LowestBatterySettings>, settings: LowestBatterySettings): void {
		const state = this.state(action.id);
		clearTimeout(state.pollTimer);

		state.pollBase = refreshSeconds(settings);
		state.pollMode = settings.pollMode ?? DEFAULTS.pollMode;

		const seconds = nextPollSeconds(settings, state.drawn?.reading, state.unchanged);
		state.pollTimer = setTimeout(() => {
			action
				.getSettings()
				.then(async (current) => {
					await this.refresh(action, current);
					this.schedule(action, current);
				})
				.catch((err) => {
					streamDeck.logger.error("lowest-battery: scheduled refresh failed", err);
					this.schedule(action, settings);
				});
		}, seconds * 1000);
	}

	private async refresh(
		action: KeyAction<LowestBatterySettings>,
		settings: LowestBatterySettings,
		force = false,
	): Promise<void> {
		try {
			const devices = withRenames(await discovery.list(force));
			const lowest = pickLowest(devices, settings);

			if (!lowest) {
				await this.draw(
					action,
					settings,
					{
						deviceLabel: "No devices",
						percent: null,
						status: "not-found",
						detail: "Nothing detected can report a battery level",
					},
					"other",
				);
				return;
			}

			await this.draw(action, settings, lowest.reading, lowest.device.kind);

			// Once per trip below the threshold, not once per poll — see the same
			// guard in battery-status.ts.
			const alertBelow = settings.alertBelow ?? DEFAULTS.alertBelow;
			const state = this.state(action.id);
			const percent = lowest.reading.percent;

			if (alertBelow > 0 && percent !== null) {
				if (percent >= alertBelow || lowest.reading.status === "charging") {
					state.alerted = false;
				} else if (!state.alerted) {
					state.alerted = true;
					await action.showAlert();
				}
			}
		} catch (err) {
			streamDeck.logger.error("lowest-battery: refresh threw", err);
			await this.draw(action, settings, { deviceLabel: "Error", percent: null, status: "error" }, "other");
		}
	}

	private async draw(
		action: KeyAction<LowestBatterySettings>,
		settings: LowestBatterySettings,
		reading: BatteryReading,
		kind: DeviceKind,
	): Promise<void> {
		const state = this.state(action.id);

		const previous = state.drawn?.reading;
		const same = previous?.percent === reading.percent && previous?.deviceLabel === reading.deviceLabel;
		state.unchanged = same ? state.unchanged + 1 : 0;

		state.drawn = { reading, kind, settings };

		if (reading.status === "charging") this.startPulse(action);
		else this.stopPulse(action.id);

		await this.render(action, settings, reading, kind);
	}

	private startPulse(action: KeyAction<LowestBatterySettings>): void {
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
				streamDeck.logger.error("lowest-battery: pulse frame failed", err),
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

	private async render(
		action: KeyAction<LowestBatterySettings>,
		settings: LowestBatterySettings,
		reading: BatteryReading,
		kind: DeviceKind,
		phase = 0,
	): Promise<void> {
		// The name is the point here: a number without the device it belongs to
		// tells you something is low but not what to go and charge.
		const showName = settings.showName ?? true;
		const name = showName ? reading.deviceLabel : "";

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
				lowest: true,
				lowThreshold: settings.lowThreshold ?? DEFAULTS.lowThreshold,
				mediumThreshold: settings.mediumThreshold ?? DEFAULTS.mediumThreshold,
				colors: faceColors(settings),
				pulse: (Math.sin((2 * Math.PI * phase) / PULSE_STEPS) + 1) / 2,
			}),
		);

		const titleMode = settings.titleMode ?? DEFAULTS.titleMode;
		if (titleMode === "device") {
			await action.setTitle(reading.deviceLabel);
		} else if (titleMode === "percent") {
			await action.setTitle(reading.percent === null ? "" : `${reading.percent}%`);
		}
	}
}

/**
 * The device with least charge, among those the key is set to watch.
 *
 * Only live levels count. A device that's off would otherwise win every time
 * with its last known level, and a mains-powered one has nothing to compare.
 */
function pickLowest(
	devices: DiscoveredDevice[],
	settings: LowestBatterySettings,
): { device: DiscoveredDevice; reading: BatteryReading } | undefined {
	const scope = settings.watch ?? DEFAULTS.watch;
	let best: { device: DiscoveredDevice; reading: BatteryReading } | undefined;

	for (const device of devices) {
		const reading = device.reading;
		if (!reading || reading.percent === null) continue;
		if (reading.status !== "ok" && reading.status !== "charging") continue;
		if (!watchIncludes(scope, device.kind)) continue;

		if (!best || reading.percent < best.reading.percent!) best = { device, reading };
	}

	return best;
}
