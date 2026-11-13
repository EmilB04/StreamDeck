import type { AudioDevice, Flow, Role } from "../audio/devices";
import type { DeviceKind } from "../audio/device-kind";
import { defaultKind, kindOf } from "../audio/device-kind";
import type { KeyFace } from "../ui/key-svg";
import type { ResolvedSettings } from "./settings";
import { chosenIds } from "./settings";

/**
 * Everything a key decides, as functions of its settings and the device list.
 * Nothing here touches Stream Deck or Windows, which is what makes it testable:
 * the action class only fetches, calls these, and carries out the answer.
 *
 * Every function takes the list for one flow only (see {@link ofFlow}).
 */

export function ofFlow(list: readonly AudioDevice[], flow: Flow): AudioDevice[] {
	return list.filter((device) => device.flow === flow);
}

/**
 * Finds a chosen device in the current list.
 *
 * By id first. Failing that, by the name it had when last seen, because Windows
 * issues a new endpoint id when a driver is reinstalled and sometimes when a
 * USB device moves port, and a key that silently stopped working after a driver
 * update would be a poor trade for strictness. Only an unambiguous name counts:
 * with two devices of the same name there's no telling which was meant.
 */
export function findDevice(
	id: string,
	names: Record<string, string>,
	list: readonly AudioDevice[],
): AudioDevice | undefined {
	const exact = list.find((device) => device.id === id);
	if (exact) return exact;

	const name = names[id];
	if (!name) return undefined;
	const sameName = list.filter((device) => device.name === name);
	return sameName.length === 1 ? sameName[0] : undefined;
}

/** Whether a device already holds every default the role covers. */
export function holdsRole(device: AudioDevice, role: Role): boolean {
	if (role === "default") return device.isDefault;
	if (role === "communications") return device.isCommunications;
	return device.isDefault && device.isCommunications;
}

/**
 * Whether a device is "the one in use" as far as a key with this role goes.
 *
 * Looser than {@link holdsRole} for "both", on purpose. Windows is often left
 * with speakers as the default and a headset as the communications default. A
 * speakers key that stayed dark in that state, while sound came out of the
 * speakers, would look broken. So the key lights for the device you hear, and
 * a press still brings the other default along.
 */
export function isCurrent(device: AudioDevice, role: Role): boolean {
	return role === "communications" ? device.isCommunications : device.isDefault;
}

/** The device a cycle counts as "where we are now". */
function currentFor(list: readonly AudioDevice[], role: Role): AudioDevice | undefined {
	return list.find((device) => isCurrent(device, role));
}

/**
 * The devices a cycle key steps through that are present right now, in the
 * order Windows lists them. Not the order they were ticked in: the panel shows
 * Windows' order, and a rotation that follows it is one you can predict.
 */
export function rotation(settings: ResolvedSettings, list: readonly AudioDevice[]): AudioDevice[] {
	const found = new Set<string>();
	for (const id of settings.devices) {
		const device = findDevice(id, settings.names, list);
		if (device) found.add(device.id);
	}
	return list.filter((device) => found.has(device.id));
}

export type PressPlan =
	/** Make this device the default. */
	| { kind: "switch"; target: AudioDevice }
	/** Nothing to do: it already is. */
	| { kind: "already"; target: AudioDevice }
	/** Can't act; `reason` is for the log. */
	| { kind: "unavailable"; reason: string };

/** What a press should do. */
export function planPress(settings: ResolvedSettings, list: readonly AudioDevice[]): PressPlan {
	if (settings.mode === "set") {
		if (!settings.device) return { kind: "unavailable", reason: "no device chosen" };
		const target = findDevice(settings.device, settings.names, list);
		if (!target) return { kind: "unavailable", reason: "the chosen device is not connected" };
		return { kind: holdsRole(target, settings.role) ? "already" : "switch", target };
	}

	if (settings.devices.length === 0) return { kind: "unavailable", reason: "no devices chosen" };
	const candidates = rotation(settings, list);
	if (candidates.length === 0) return { kind: "unavailable", reason: "none of the chosen devices is connected" };

	const current = currentFor(list, settings.role);
	const at = current ? candidates.findIndex((device) => device.id === current.id) : -1;
	// From outside the rotation, a press brings you into it at the start.
	const target = candidates[(at + 1) % candidates.length];

	// Only reachable with one device left: the "next" one is where we already are.
	if (target.id === current?.id && holdsRole(target, settings.role)) return { kind: "already", target };
	return { kind: "switch", target };
}

/** "3- HyperX SoloCast": Windows numbers an adapter it has installed more than once. */
function tidyAdapter(adapter: string): string {
	return adapter.replace(/^\d+-\s+/, "");
}

/**
 * The name that goes on the key for a device.
 *
 * "auto" uses the description unless another device of the same flow shares it.
 * Three microphones are all "Microphone" to Windows, and then only the adapter
 * tells them apart; two monitors are both "NVIDIA High Definition Audio", and
 * then only the description does.
 */
export function labelFor(device: AudioDevice, settings: ResolvedSettings, list: readonly AudioDevice[]): string {
	const adapter = tidyAdapter(device.adapter);
	const description = device.description;

	switch (settings.label) {
		case "none":
			return "";
		case "description":
			return description || adapter || device.name;
		case "adapter":
			return adapter || description || device.name;
		default: {
			const shared = list.some((other) => other.id !== device.id && other.description === description);
			if (description && !shared) return description;
			return adapter || description || device.name;
		}
	}
}

/** Shortens a saved full name for a device that isn't there to ask: "Speakers (Realtek)" to "Speakers". */
function rememberedLabel(name: string): string {
	return name.replace(/\s*\([^()]*\)\s*$/, "") || name;
}

/** The picture for a device: the user's choice if they made one, else what it looks like. */
export function kindFor(device: AudioDevice, settings: ResolvedSettings): DeviceKind {
	return settings.icon === "auto" ? kindOf(device) : settings.icon;
}

/** The picture for a device that isn't here: what it was last time, or the plain default. */
function rememberedKind(id: string, settings: ResolvedSettings, flow: Flow): DeviceKind {
	return settings.icon === "auto" ? (settings.kinds[id] ?? defaultKind(flow)) : settings.icon;
}

/** What a key should show. */
export function faceFor(settings: ResolvedSettings, list: readonly AudioDevice[], flow: Flow): KeyFace {
	const base = { showIcon: settings.showIcon };
	const plain: DeviceKind = settings.icon === "auto" ? defaultKind(flow) : settings.icon;

	if (settings.mode === "set") {
		if (!settings.device) return { ...base, kind: plain, state: "empty", title: "Pick a device" };

		const device = findDevice(settings.device, settings.names, list);
		if (!device) {
			const remembered = settings.names[settings.device];
			return {
				...base,
				kind: rememberedKind(settings.device, settings, flow),
				state: "missing",
				title: settings.label === "none" ? "" : settings.customLabel || (remembered ? rememberedLabel(remembered) : ""),
			};
		}
		return {
			...base,
			kind: kindFor(device, settings),
			state: isCurrent(device, settings.role) ? "active" : "inactive",
			title: settings.label === "none" ? "" : settings.customLabel || labelFor(device, settings, list),
		};
	}

	if (settings.devices.length === 0) return { ...base, kind: plain, state: "empty", title: "Pick devices" };

	const candidates = rotation(settings, list);
	if (candidates.length === 0) return { ...base, kind: plain, state: "missing", title: "" };

	const current = currentFor(list, settings.role);
	const at = current ? candidates.findIndex((device) => device.id === current.id) : -1;
	const dots = { count: candidates.length, active: at };

	// The key names what's playing now even when that isn't one of its own
	// devices, dimmed, so it never claims a device that isn't the default.
	if (at < 0) {
		return {
			...base,
			kind: current ? kindFor(current, settings) : plain,
			state: "inactive",
			title: current ? labelFor(current, settings, list) : "",
			dots,
		};
	}
	return {
		...base,
		kind: kindFor(candidates[at], settings),
		state: "active",
		title: labelFor(candidates[at], settings, list),
		dots,
	};
}

/**
 * The names to remember for a key's chosen devices, or undefined when what's
 * saved is already right. Only devices that are present are updated; an absent
 * one keeps whatever was last recorded, which is the whole point of recording it.
 */
export function namesToSave(
	settings: ResolvedSettings,
	list: readonly AudioDevice[],
): Record<string, string> | undefined {
	const chosen = chosenIds(settings);
	const next: Record<string, string> = {};
	for (const id of chosen) {
		const device = list.find((d) => d.id === id);
		const name = device?.name ?? settings.names[id];
		if (name) next[id] = name;
	}

	const before = settings.names;
	const same =
		Object.keys(next).length === Object.keys(before).length &&
		Object.entries(next).every(([id, n]) => before[id] === n);
	return same ? undefined : next;
}

/**
 * What to remember about each chosen device that's present: its name and its
 * picture. Undefined when what's saved is already right.
 */
export function rememberedFor(
	settings: ResolvedSettings,
	list: readonly AudioDevice[],
): { names: Record<string, string>; kinds: Record<string, DeviceKind> } | undefined {
	const names = namesToSave(settings, list);
	const kinds: Record<string, DeviceKind> = {};
	for (const id of chosenIds(settings)) {
		const device = list.find((d) => d.id === id);
		const kind = device ? kindOf(device) : settings.kinds[id];
		if (kind) kinds[id] = kind;
	}
	const sameKinds =
		Object.keys(kinds).length === Object.keys(settings.kinds).length &&
		Object.entries(kinds).every(([id, k]) => settings.kinds[id] === k);

	if (!names && sameKinds) return undefined;
	return { names: names ?? settings.names, kinds };
}

/** One row of a device picker in the property inspector. */
export type PickerItem = { label: string; value: string };

/**
 * The picker's rows: every connected device, then any chosen one that isn't
 * connected. Leaving those out would make the panel show an empty choice for a
 * key that is merely waiting for its headset to be switched on.
 */
export function pickerItems(settings: ResolvedSettings, list: readonly AudioDevice[]): PickerItem[] {
	const items = list.map((device) => ({ label: device.name, value: device.id }));
	for (const id of chosenIds(settings)) {
		if (list.some((device) => device.id === id)) continue;
		items.push({ label: `${settings.names[id] ?? "Unknown device"} (not connected)`, value: id });
	}
	return items;
}
