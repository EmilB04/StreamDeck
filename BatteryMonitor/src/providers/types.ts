/**
 * Note the line between the two "no number" cases, which providers used to draw
 * differently for the same situation:
 *
 *  - "unsupported" is permanent. Asking again will not help, because there is no
 *    battery here to read, or no way to read it.
 *  - "not-found" may fix itself. The device is asleep, out of range or switched
 *    off, and the key backs its polling off rather than probing every cycle.
 *
 * A peripheral that's silent behind a dongle that's still plugged in is
 * "not-found", not "unsupported" — the dongle answering is not the device
 * answering.
 */
export type BatteryStatus =
	| "ok"
	| "charging"
	| "mains" // runs off the cable; there is no battery to report
	| "unsupported" // device found, but it has no battery, or no protocol to read one
	| "not-found" // not answering now: disconnected, asleep or out of range
	| "stale" // device is gone; the percentage is the last one that was read
	| "error";

/** Physical form factor of the device, used to pick which icon to draw on the key. */
export type DeviceKind =
	| "headset"
	| "earbuds"
	| "mouse"
	| "keyboard"
	| "gamepad"
	| "phone"
	| "tablet"
	| "speaker"
	| "microphone"
	| "watch"
	| "other";

export interface BatteryReading {
	deviceLabel: string;
	percent: number | null;
	status: BatteryStatus;
	detail?: string;
}

/**
 * A device that was actually found on this machine by a provider's scan. Nothing
 * here is hard-coded: labels come from the device's own descriptor / name
 * feature / OS record, and `key` is what gets persisted in the action settings.
 */
export interface DiscoveredDevice {
	/** Stable identity persisted in settings; must survive replug and reboot. */
	key: string;
	providerId: string;
	label: string;
	kind: DeviceKind;
	/** False when the device is detected but its battery protocol is unknown. */
	supportsBattery: boolean;
	/** Provider-private addressing info. Must be JSON-serializable. */
	locator: Record<string, string | number>;
	/**
	 * The USB ids of the interface this entry came from, when it came from one.
	 *
	 * Unlike {@link locator}, this means the same thing across providers, which is
	 * what lets the catch-all provider list a vendor another provider also handles
	 * without producing a duplicate: an entry is dropped only when a real provider
	 * described *that* piece of hardware, not merely something by the same vendor.
	 */
	hardware?: HardwareId;
	/**
	 * True where the protocol behind this entry has never been run against the
	 * hardware it decodes — written from published documentation instead.
	 *
	 * It reaches the device picker, because the alternative is a device that
	 * silently reads wrong or reads nothing and looks like a plugin that doesn't
	 * work. Saying so turns that into a bug report.
	 */
	unverified?: boolean;
	/** Reading captured during the scan, when the scan had to fetch it anyway. */
	reading?: BatteryReading;
}

export interface HardwareId {
	vendorId: number;
	productId: number;
}

export interface BatteryProvider {
	id: string;
	/**
	 * Whether a reading from this provider can ever say "charging". False means
	 * the source carries a level and nothing else (the Windows PnP battery
	 * property, for one), so a charging device is indistinguishable from one
	 * sitting still — and the only clue left is the level going up. Defaults to
	 * true when omitted.
	 */
	reportsCharging?: boolean;
	/** Enumerates everything this provider can see right now. Never throws. */
	discover(): Promise<DiscoveredDevice[]>;
	/** Reads a device previously returned by {@link discover}. Never throws. */
	read(device: DiscoveredDevice): Promise<BatteryReading>;
}

/**
 * How much a device can say about its power, most useful first:
 *
 *   0 has a battery this plugin can read
 *   1 runs off the cable — a real answer, just never a percentage
 *   2 nothing to say: no battery protocol here, or nothing answering
 *
 * This orders the device picker and names its entries, from one definition so
 * the two can't disagree — a device sorted into the battery group but labelled
 * "no battery data" would read as a bug in both places at once.
 */
export type PowerTier = 0 | 1 | 2;

export function powerTier(device: DiscoveredDevice): PowerTier {
	if (device.supportsBattery) return 0;
	if (device.reading?.status === "mains") return 1;
	return 2;
}

/**
 * A whole-number percentage inside 0-100.
 *
 * Every provider scales a raw value into a percentage, and each was clamping it
 * differently — a couple only capped the top, so a decode that went negative
 * could paint a key below empty.
 */
export function clampPercent(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.max(0, Math.min(100, Math.round(value)));
}

/** The device isn't answering right now. It may well be back next poll. */
export function notFound(deviceLabel: string, detail?: string): BatteryReading {
	return { deviceLabel, percent: null, status: "not-found", detail };
}

/** The device is there, but nothing here knows how to read a battery from it. */
export function unsupported(deviceLabel: string, detail?: string): BatteryReading {
	return { deviceLabel, percent: null, status: "unsupported", detail };
}

export function slug(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

export function hex4(value: number): string {
	return value.toString(16).padStart(4, "0");
}
