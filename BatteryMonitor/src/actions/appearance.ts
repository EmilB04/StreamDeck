import streamDeck from "@elgato/streamdeck";
import type { Appearance, BatterySettings, GlobalSettings } from "./settings";

/**
 * Last global settings seen, from any direction: startup, a read, an edit in a
 * panel, or a write made here.
 *
 * Every `getGlobalSettings` answer also arrives as a did-receive event, so
 * asking for them used to be enough to push the shared look onto every key
 * again, undoing whatever had been changed on one key since. Keys now decide
 * from this copy and a revision number instead, which needs no round-trip.
 */
let latest: GlobalSettings | undefined;

const listeners: (() => void)[] = [];

/** Keeps the copy current. Called for every global settings event. */
export function cacheGlobal(settings: GlobalSettings | undefined): void {
	latest = settings ?? {};
}

/** Global settings, from the copy when there is one. */
export async function globalSettings(): Promise<GlobalSettings> {
	if (latest) return latest;
	const fetched = (await streamDeck.settings.getGlobalSettings<GlobalSettings>()) ?? {};
	latest ??= fetched;
	return latest;
}

/**
 * The look every key adopts, and its revision, or undefined when nobody has
 * shared one yet.
 */
export async function sharedAppearance(): Promise<{ appearance: Appearance; rev?: number } | undefined> {
	const global = await globalSettings();
	return global.appearance ? { appearance: global.appearance, rev: global.appearanceRev } : undefined;
}

/**
 * The shared look an existing key should adopt, or undefined when it has
 * nothing new to take: no share, a share from before revisions existed, or
 * one this key already has.
 */
export function pendingAppearance(settings: BatterySettings): { appearance: Appearance; rev: number } | undefined {
	const appearance = latest?.appearance;
	const rev = latest?.appearanceRev;
	if (!appearance || rev === undefined || settings.appearanceRev === rev) return undefined;
	return { appearance, rev };
}

/**
 * Runs `listener` after this plugin shares a look.
 *
 * Stream Deck only reports global settings changed by a panel, not ones the
 * plugin wrote itself, so the event alone would leave every other key waiting
 * for an unrelated reason to look again.
 */
export function whenShared(listener: () => void): void {
	listeners.push(listener);
}

/**
 * Publishes a look under a new revision. Everything else in global settings is
 * carried over: the renames live there too, and writing `{ appearance }` alone
 * used to wipe every one of them.
 */
export async function shareAppearance(appearance: Appearance): Promise<void> {
	const current = (await streamDeck.settings.getGlobalSettings<GlobalSettings>()) ?? {};
	const next: GlobalSettings = { ...current, appearance, appearanceRev: Date.now() };

	await streamDeck.settings.setGlobalSettings<GlobalSettings>(next);
	cacheGlobal(next);
	for (const listener of listeners) listener();
}
