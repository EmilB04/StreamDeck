import type HidModule from "node-hid";

export const HID_UNAVAILABLE =
	"node-hid not available. Run `npm run sync-deps` on the machine running Stream Deck.";

/**
 * node-hid is a native addon that only gets installed into the .sdPlugin folder
 * on the target machine (see scripts/sync-runtime-deps.mjs). Loading it lazily
 * means a missing/mismatched binary only disables the HID-based providers
 * instead of taking down the whole plugin.
 */
let cached: typeof HidModule | null | undefined;

export async function loadHid(): Promise<typeof HidModule | null> {
	if (cached !== undefined) return cached;
	try {
		const ns = await import("node-hid");
		cached = ns.default ?? (ns as unknown as typeof HidModule);
	} catch {
		cached = null;
	}
	return cached;
}

/** Enumerates connected HID interfaces, optionally filtered by vendor. */
export async function hidDevices(vendorId?: number): Promise<HidModule.Device[] | null> {
	const HID = await loadHid();
	if (!HID) return null;
	try {
		const all = HID.devices();
		return vendorId === undefined ? all : all.filter((d) => d.vendorId === vendorId);
	} catch {
		return [];
	}
}
