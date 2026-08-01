import streamDeck, { action } from "@elgato/streamdeck";
import type { KeyAction, SendToPluginEvent } from "@elgato/streamdeck";
import { discovery } from "../providers/discovery";
import type { BatteryReading, DiscoveredDevice } from "../providers/types";
import { shareAppearance, sharedAppearance } from "./appearance";
import type { Face, Reading } from "./key-face";
import { KeyFaceAction } from "./key-face";
import { withRenames } from "./renames";
import type { LowestBatterySettings } from "./settings";
import { DEFAULTS, extractAppearance, migrate, watchIncludes } from "./settings";

type UiMessage = { event?: string; isRefresh?: boolean };

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
export class LowestBatteryAction extends KeyFaceAction<LowestBatterySettings> {
	/** Picks the emptiest device from the scan discovery already did. */
	protected async read(
		_action: KeyAction<LowestBatterySettings>,
		settings: LowestBatterySettings,
		force: boolean,
	): Promise<Reading<LowestBatterySettings>> {
		const devices = withRenames(await discovery.list(force));
		const lowest = pickLowest(devices, settings);

		if (!lowest) {
			return {
				settings,
				kind: "other",
				reading: {
					deviceLabel: "No devices",
					percent: null,
					status: "not-found",
					detail: "Nothing detected can report a battery level",
				},
			};
		}

		return { settings, reading: lowest.reading, kind: lowest.device.kind };
	}

	/**
	 * The name is the point here: a number without the device it belongs to tells
	 * you something is low but not what to go and charge.
	 */
	protected present(
		_action: KeyAction<LowestBatterySettings>,
		settings: LowestBatterySettings,
		live: BatteryReading,
		kind: import("../providers/types").DeviceKind,
	): Face {
		const showName = settings.showName ?? DEFAULTS.showName;
		return { reading: live, kind, name: showName ? live.deviceLabel : "", lowest: true };
	}

	/** A changed filter needs the list looked at again; a colour edit doesn't. */
	protected override async needsReread(): Promise<boolean> {
		return true;
	}

	protected async ensureDefaults(
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

	override async onSendToPlugin(ev: SendToPluginEvent<UiMessage, LowestBatterySettings>): Promise<void> {
		if (ev.payload?.event === "getApps") {
			await this.sendApps(ev.payload?.isRefresh === true);
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
