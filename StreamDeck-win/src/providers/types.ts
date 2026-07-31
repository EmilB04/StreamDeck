export type BatteryStatus =
	| "ok"
	| "charging"
	| "mains" // runs off the cable; there is no battery to report
	| "unsupported" // device found, but no battery protocol is implemented for it
	| "not-found" // device no longer connected / not detected
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
	/** Reading captured during the scan, when the scan had to fetch it anyway. */
	reading?: BatteryReading;
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

export function slug(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

export function hex4(value: number): string {
	return value.toString(16).padStart(4, "0");
}
