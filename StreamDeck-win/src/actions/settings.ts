import type { BatteryReading, DeviceKind } from "../providers/types";
import type { BatteryStyle, FaceColors } from "../ui/battery-svg";
import { DEFAULT_COLORS, LEGACY_BACKGROUND_COLORS, LEGACY_CHARGING_COLORS } from "../ui/battery-svg";

/** What, if anything, the plugin writes into the key's title. */
export type TitleMode = "none" | "device" | "percent";

/** What the small text line under the meter shows. */
export type NameSource = "device" | "title" | "auto";

/** Whether the poll interval is exactly what was configured, or varies with what's happening. */
export type PollMode = "fixed" | "adaptive";

/**
 * How the key treats the device's power. "auto" believes the provider; "mains"
 * is the user saying the thing never runs on a battery, which no amount of
 * probing can establish for, say, a Bluetooth speaker.
 */
export type PowerSource = "auto" | "mains";


export type BatterySettings = {
	/** Stable key of a device found by discovery (see providers/discovery.ts). */
	deviceKey?: string;
	/** Last known label/kind, so a disconnected device still renders sensibly. */
	deviceLabel?: string;
	deviceKind?: DeviceKind;
	refreshSeconds?: number;
	pollMode?: PollMode;
	powerSource?: PowerSource;
	/**
	 * What a press opens, on top of always reading the battery. Empty means it
	 * only reads the battery — there is no separate on/off for this, since an
	 * app being set is itself the switch.
	 *
	 * `pressTarget` is what the app picker writes; `pressCustomTarget` is a path
	 * or URL typed by hand, and wins when both are set. They're separate settings
	 * so the picker's internal value never lands in the text box.
	 */
	pressTarget?: string;
	pressCustomTarget?: string;

	/**
	 * Last percentage actually read from the device, and when. Persisted in the
	 * action's settings rather than kept in memory so the last known level also
	 * survives a plugin restart, a Stream Deck restart and a reboot.
	 */
	lastPercent?: number;
	lastSeenAt?: number;
	/** Whether a disconnected device shows that level instead of a dash. */
	showLastKnown?: boolean;

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
 * Floor on the poll interval. A scan takes ~3s and discovery caches its result
 * for 10s, so anything faster than this would spend the extra polls re-drawing
 * the same cached numbers.
 */
export const MIN_REFRESH_SECONDS = 10;

/**
 * v2: the charging colour moved from blue to green. v3: last-known level.
 * v4: the charging green was brightened. v5: the background went black.
 */
export const SETTINGS_VERSION = 5;

export const DEFAULTS = {
	refreshSeconds: 60,
	pollMode: "fixed" as PollMode,
	powerSource: "auto" as PowerSource,
	showLastKnown: true,
	style: "bar" as BatteryStyle,
	showIcon: false,
	showPercent: true,
	showName: true,
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

/**
 * Brings a key's settings up to the current version, writing the appearance
 * defaults out the first time so the property inspector's controls start out
 * matching what's drawn rather than showing empty inputs.
 *
 * Returns undefined when the settings are already current, i.e. when there is
 * nothing to persist.
 */
export function migrate(settings: BatterySettings): BatterySettings | undefined {
	const version = settings.settingsVersion ?? (settings.configured ? 1 : 0);
	if (settings.configured && version >= SETTINGS_VERSION) return undefined;

	const migrated: BatterySettings = { ...settings };

	// The charging colour has changed twice (blue -> green -> brighter green).
	// Only move a key that's still sitting on a colour this plugin chose for it;
	// one the user picked themselves is left alone.
	const chargingIsADefault =
		migrated.colorCharging === undefined || LEGACY_CHARGING_COLORS.includes(migrated.colorCharging);
	if (version < SETTINGS_VERSION && chargingIsADefault) {
		migrated.colorCharging = DEFAULTS.colorCharging;
	}

	// Same rule for the background, which went from near-black to black: a key
	// still on a shipped default follows, one the user set keeps what it has.
	const backgroundIsADefault =
		migrated.colorBackground === undefined || LEGACY_BACKGROUND_COLORS.includes(migrated.colorBackground);
	if (version < SETTINGS_VERSION && backgroundIsADefault) {
		migrated.colorBackground = DEFAULTS.colorBackground;
	}

	// v2 -> v3 added showLastKnown; the defaults merge below turns it on.
	return { ...DEFAULTS, ...migrated, configured: true, settingsVersion: SETTINGS_VERSION };
}

export function refreshSeconds(settings: BatterySettings): number {
	return Math.max(MIN_REFRESH_SECONDS, settings.refreshSeconds ?? DEFAULTS.refreshSeconds);
}

/**
 * Adaptive polling policy. A scan costs two spawned processes and a couple of
 * HID handles, so the point is to spend them when the number is actually moving
 * and not when it isn't.
 */
export const ADAPTIVE = {
	/** Charging climbs fast enough to be worth watching. */
	chargingSeconds: 15,
	/** So does a level that's about to run out. */
	lowSeconds: 30,
	/** Nothing to read from a device that's gone; a key press still forces one. */
	offlineSeconds: 120,
	/** Each unchanged reading stretches the wait by this much... */
	backoff: 1.5,
	/** ...up to here. */
	maxSeconds: 600,
};

/**
 * How long to wait before reading again, given what the last reading said and
 * how many readings in a row have shown the same percentage.
 *
 * The configured interval is the baseline: charging and low levels can only
 * shorten it, never lengthen it, so a key set to 15s stays responsive; a steady
 * level backs off from it; and MIN_REFRESH_SECONDS is still the floor.
 */
export function adaptiveSeconds(
	settings: BatterySettings,
	reading: BatteryReading | undefined,
	unchanged: number,
): number {
	const base = refreshSeconds(settings);
	if (!reading) return base;

	const quicker = (seconds: number) => Math.max(MIN_REFRESH_SECONDS, Math.min(base, seconds));

	if (reading.status === "charging") return quicker(ADAPTIVE.chargingSeconds);

	const low = settings.lowThreshold ?? DEFAULTS.lowThreshold;
	if (reading.percent !== null && reading.percent <= low) return quicker(ADAPTIVE.lowSeconds);

	// A device that isn't there costs the same scan as one that is, and reports
	// nothing new until it comes back.
	if (reading.status === "not-found" || reading.status === "error") {
		return Math.max(base, ADAPTIVE.offlineSeconds);
	}

	return Math.min(ADAPTIVE.maxSeconds, Math.round(base * ADAPTIVE.backoff ** unchanged));
}

/** The wait before the next reading, in whichever mode the key is set to. */
export function nextPollSeconds(
	settings: BatterySettings,
	reading: BatteryReading | undefined,
	unchanged: number,
): number {
	return (settings.pollMode ?? DEFAULTS.pollMode) === "adaptive"
		? adaptiveSeconds(settings, reading, unchanged)
		: refreshSeconds(settings);
}

export function faceColors(settings: BatterySettings): FaceColors {
	return {
		low: settings.colorLow ?? DEFAULTS.colorLow,
		medium: settings.colorMedium ?? DEFAULTS.colorMedium,
		high: settings.colorHigh ?? DEFAULTS.colorHigh,
		charging: settings.colorCharging ?? DEFAULTS.colorCharging,
		background: settings.colorBackground ?? DEFAULTS.colorBackground,
		foreground: settings.colorForeground ?? DEFAULTS.colorForeground,
	};
}
