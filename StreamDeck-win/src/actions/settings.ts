import type { BatteryReading, DeviceKind } from "../providers/types";
import type { BatteryStyle, FaceColors } from "../ui/battery-svg";
import { DEFAULT_COLORS, LEGACY_BACKGROUND_COLORS, LEGACY_CHARGING_COLORS } from "../ui/battery-svg";

/** What, if anything, the plugin writes into the key's title. */
export type TitleMode = "none" | "device" | "percent";

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
	/** Overrides the name the device reports — Windows calls one phone here "4". */
	displayName?: string;
	/** Overrides the drawn form factor; "auto" believes the provider. */
	iconKind?: DeviceKind | "auto";
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
	/** Recent levels, oldest first, for the time-remaining estimate. */
	history?: Sample[];
	/** Whether a disconnected device shows that level instead of a dash. */
	showLastKnown?: boolean;

	// Appearance
	style?: BatteryStyle;
	showIcon?: boolean;
	showPercent?: boolean;
	showName?: boolean;
	/** Replaces the name line with how long the level should last. */
	showTimeLeft?: boolean;
	/** Prefixes the name line with how long ago an offline device was last seen. */
	showOfflineAge?: boolean;
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

/** A level and when it was seen, for working out how fast it's dropping. */
export type Sample = { percent: number; at: number };

/**
 * How many drops to remember. Enough to average out a coarse gauge that moves
 * in 10% steps, few enough that a settings write stays small.
 */
const MAX_SAMPLES = 8;

/** Estimates need a real drop over a real interval, or the maths is noise. */
const MIN_DROP_PERCENT = 3;
const MIN_SPAN_MS = 10 * 60_000;
/** Beyond this the answer stops meaning anything useful. */
const MAX_ESTIMATE_MS = 14 * 24 * 60 * 60_000;

/**
 * Adds a reading to the history, and throws the history away when the level
 * goes up: a device that has been on a charger has no useful discharge history
 * behind it, and averaging across the charge would report nonsense.
 */
export function recordSample(history: Sample[] | undefined, percent: number, at: number): Sample[] {
	const samples = history ?? [];
	const last = samples[samples.length - 1];

	if (last && percent > last.percent) return [{ percent, at }];
	if (last && percent === last.percent) return samples;

	return [...samples, { percent, at }].slice(-MAX_SAMPLES);
}

/**
 * Milliseconds until empty at the rate the level has actually been dropping,
 * or null when there isn't enough history to say.
 *
 * The oldest and newest samples give the rate. A median-of-intervals would
 * resist a single odd reading better, but wireless gauges move in steps of 10%
 * — over a handful of steps the endpoints *are* the trend, and anything
 * cleverer would be fitting noise.
 */
export function estimateRemaining(history: Sample[] | undefined, percent: number, now: number): number | null {
	if (!history || history.length < 2) return null;

	const first = history[0];
	const last = history[history.length - 1];

	const drop = first.percent - last.percent;
	const span = last.at - first.at;
	if (drop < MIN_DROP_PERCENT || span < MIN_SPAN_MS) return null;

	const msPerPercent = span / drop;
	const remaining = percent * msPerPercent - (now - last.at);

	if (remaining <= 0 || remaining > MAX_ESTIMATE_MS) return null;
	return remaining;
}

/** "3h 20m", "45m", "2d" — short enough for the key's name line. */
export function formatDuration(ms: number): string {
	const minutes = Math.round(ms / 60_000);
	if (minutes < 60) return `${minutes}m`;

	const hours = Math.floor(minutes / 60);
	if (hours < 24) {
		const rest = minutes % 60;
		return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
	}

	const days = Math.floor(hours / 24);
	const restHours = hours % 24;
	return restHours === 0 ? `${days}d` : `${days}d ${restHours}h`;
}

/**
 * The settings that describe how a key looks rather than what it watches.
 * Shared across keys by the "apply to all" button, via global settings.
 */
export const APPEARANCE_KEYS = [
	"style",
	"showIcon",
	"showPercent",
	"showName",
	"showTimeLeft",
	"showOfflineAge",
	"lowThreshold",
	"mediumThreshold",
	"alertBelow",
	"colorLow",
	"colorMedium",
	"colorHigh",
	"colorCharging",
	"colorForeground",
	"colorBackground",
] as const;

export type Appearance = Pick<BatterySettings, (typeof APPEARANCE_KEYS)[number]>;

/** Settings shared by every key of this plugin. */
export type GlobalSettings = {
	appearance?: Appearance;
	/** Device key -> the name the user gave it; see actions/renames.ts. */
	renames?: Record<string, string>;
};

export function extractAppearance(settings: BatterySettings): Appearance {
	const appearance: Appearance = {};
	for (const key of APPEARANCE_KEYS) {
		const value = settings[key];
		if (value !== undefined) Object.assign(appearance, { [key]: value });
	}
	return appearance;
}

/** Which devices the "Lowest battery" action counts. */
export type WatchScope = "peripherals" | "everything";

export type LowestBatterySettings = BatterySettings & {
	watch?: WatchScope;
};

/**
 * Kinds left out of "peripherals". A phone or a watch has its own charger and
 * its own reminders; counting them means the key spends most of its time
 * reporting a phone that is about to be plugged in anyway, and never mentions
 * the headset that's about to die mid-call.
 */
const PERSONAL_KINDS = new Set<DeviceKind>(["phone", "tablet", "watch"]);

export function watchIncludes(scope: WatchScope, kind: DeviceKind): boolean {
	return scope === "everything" || !PERSONAL_KINDS.has(kind);
}

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
	watch: "peripherals" as WatchScope,
	pollMode: "fixed" as PollMode,
	powerSource: "auto" as PowerSource,
	showLastKnown: true,
	style: "bar" as BatteryStyle,
	showIcon: false,
	showPercent: true,
	showName: true,
	showTimeLeft: false,
	showOfflineAge: true,
	iconKind: "auto" as DeviceKind | "auto",
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
