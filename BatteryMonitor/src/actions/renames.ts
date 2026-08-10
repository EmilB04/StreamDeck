import streamDeck from "@elgato/streamdeck";
import type { DiscoveredDevice } from "../providers/types";
import type { GlobalSettings } from "./settings";

/**
 * Names the user has given devices, keyed by the stable device key.
 *
 * These live in global settings rather than on a key, because the point is that
 * the machine calls one of this user's phones "4" and every key that ever shows
 * it should say "iPhone". Renaming it on one key and again on the next is the
 * problem, not the feature.
 *
 * Only this plugin is affected: nothing here writes to Windows, Bluetooth or
 * the device itself. The map is read on the way out, wherever a label is shown.
 */
export type RenameMap = Record<string, string>;

/**
 * Read-through cache. Global settings are a round-trip to Stream Deck, and
 * labels are resolved on every repaint — including every pulse frame.
 */
let cache: RenameMap | undefined;

export async function loadRenames(force = false): Promise<RenameMap> {
	if (cache && !force) return cache;

	const global = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
	cache = global?.renames ?? {};
	return cache;
}

/** Keeps the cache honest when the map changes, from any key or any action. */
export function cacheRenames(renames: RenameMap | undefined): void {
	cache = renames ?? {};
}

/** What's cached right now; empty until the first load, which happens at startup. */
export function renames(): RenameMap {
	return cache ?? {};
}

/** Sets or clears one name, leaving the rest of the map alone. */
export async function setRename(deviceKey: string, name: string): Promise<RenameMap> {
	const global = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
	const next: RenameMap = { ...(global?.renames ?? {}) };

	const trimmed = name.trim();
	if (trimmed === "") delete next[deviceKey];
	else next[deviceKey] = trimmed;

	await streamDeck.settings.setGlobalSettings<GlobalSettings>({ ...global, renames: next });
	cacheRenames(next);
	return next;
}

/**
 * The name to show for a device: what the user called it, or what it calls
 * itself. Used everywhere a label is rendered, so a rename reaches the key face,
 * the picker, the titles and both actions without each one knowing about it.
 */
export function labelOf(deviceKey: string | undefined, reported: string): string {
	if (!deviceKey) return reported;
	return renames()[deviceKey] ?? reported;
}

/** Applies the map across a scan, for anything that consumes whole devices. */
export function withRenames(devices: DiscoveredDevice[]): DiscoveredDevice[] {
	const map = renames();
	if (Object.keys(map).length === 0) return devices;

	return devices.map((device) => {
		const renamed = map[device.key];
		if (!renamed) return device;

		return {
			...device,
			label: renamed,
			reading: device.reading ? { ...device.reading, deviceLabel: renamed } : device.reading,
		};
	});
}
