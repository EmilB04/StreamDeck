import type { DeviceKind } from "../audio/device-kind";
import { DEVICE_KINDS } from "../audio/device-kind";
import type { Role } from "../audio/devices";

/** "set" always goes to one device; "cycle" steps through several. */
export type Mode = "set" | "cycle";

/**
 * Which of a device's names goes on the key. Windows gives every endpoint two:
 * what it is ("Speakers") and what it's on ("Realtek Audio"). Neither is
 * reliably the useful one, so "auto" picks per device (see `labelFor`).
 */
export type LabelMode = "auto" | "description" | "adapter" | "none";

/**
 * What a key stores. Every field is optional because this is whatever Stream
 * Deck hands back: a new key has none of it, and the property inspector writes
 * fields one at a time. Read it through {@link resolved}.
 */
/** "auto" works the picture out from the device (see `kindOf`); anything else is the user's say-so. */
export type IconChoice = DeviceKind | "auto";

export type DeviceKeySettings = {
	mode?: Mode;
	/** Endpoint id of the device a "set" key switches to. */
	device?: string;
	/** Endpoint ids a "cycle" key steps through. */
	devices?: string[];
	role?: Role;
	label?: LabelMode;
	/** Text for a "set" key's face, replacing the device's own name. */
	customLabel?: string;
	showIcon?: boolean;
	icon?: IconChoice;
	/**
	 * Full name of each chosen device when it was last seen, by endpoint id.
	 * Written by the plugin, never by the panel. It is what lets an unplugged
	 * device keep its name, and what a device is recognised by if Windows gives
	 * it a new id.
	 */
	names?: Record<string, string>;
	/** What each chosen device looked like when last seen, for the same reason as {@link names}. */
	kinds?: Record<string, DeviceKind>;
};

export type ResolvedSettings = Required<DeviceKeySettings>;

const MODES: readonly Mode[] = ["set", "cycle"];
const ROLES: readonly Role[] = ["both", "default", "communications"];
const LABELS: readonly LabelMode[] = ["auto", "description", "adapter", "none"];

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
	return allowed.includes(value as T) ? (value as T) : fallback;
}

/**
 * Settings with every gap filled and every value checked. Settings survive
 * plugin updates and can be edited by hand in an exported profile, so a value
 * of the wrong type is treated as absent rather than trusted.
 */
export function resolved(settings: DeviceKeySettings | undefined): ResolvedSettings {
	const s = settings ?? {};

	const names: Record<string, string> = {};
	if (s.names && typeof s.names === "object" && !Array.isArray(s.names)) {
		for (const [id, name] of Object.entries(s.names)) {
			if (typeof name === "string" && name) names[id] = name;
		}
	}

	const kinds: Record<string, DeviceKind> = {};
	if (s.kinds && typeof s.kinds === "object" && !Array.isArray(s.kinds)) {
		for (const [id, kind] of Object.entries(s.kinds)) {
			if (DEVICE_KINDS.includes(kind)) kinds[id] = kind;
		}
	}

	return {
		mode: oneOf(s.mode, MODES, "set"),
		device: typeof s.device === "string" ? s.device : "",
		devices: Array.isArray(s.devices)
			? [...new Set(s.devices.filter((id): id is string => typeof id === "string" && id !== ""))]
			: [],
		role: oneOf(s.role, ROLES, "both"),
		label: oneOf(s.label, LABELS, "auto"),
		customLabel: typeof s.customLabel === "string" ? s.customLabel.trim() : "",
		// Only an explicit false turns it off: a new key has no value at all.
		showIcon: s.showIcon !== false,
		icon: s.icon === "auto" || DEVICE_KINDS.includes(s.icon as DeviceKind) ? (s.icon as IconChoice) : "auto",
		names,
		kinds,
	};
}

/** The endpoint ids a key is pointed at in its current mode. */
export function chosenIds(settings: ResolvedSettings): string[] {
	if (settings.mode === "cycle") return settings.devices;
	return settings.device ? [settings.device] : [];
}
