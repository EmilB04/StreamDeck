import streamDeck from "@elgato/streamdeck";
import type { DialAction, KeyAction } from "@elgato/streamdeck";
import type { Appearance, BatterySettings, GlobalSettings } from "./settings";

/** The look every key adopts, or undefined when nobody has shared one yet. */
export async function sharedAppearance(): Promise<Appearance | undefined> {
	const global = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
	return global?.appearance;
}

/** Publishes a look; the global-settings event is what spreads it to the keys. */
export async function shareAppearance(appearance: Appearance): Promise<void> {
	await streamDeck.settings.setGlobalSettings<GlobalSettings>({ appearance });
}

/**
 * Writes an appearance into every visible key of one action.
 *
 * Propagation goes through the global-settings event rather than the button
 * pushing directly, so both action types hear it the same way and there's one
 * path to reason about. Writing values a key already has is harmless: it
 * repaints from the cached reading and touches no device.
 */
export async function applyAppearance(
	actions: Iterable<DialAction<BatterySettings> | KeyAction<BatterySettings>>,
	appearance: Appearance,
): Promise<void> {
	for (const action of actions) {
		const current = await action.getSettings();
		await action.setSettings({ ...current, ...appearance });
	}
}
