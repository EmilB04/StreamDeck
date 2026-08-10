import type HidModule from "node-hid";
import { log } from "./log";

export const HID_UNAVAILABLE = "node-hid not available. Run `npm run sync-deps` on the machine running Stream Deck.";

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
	} catch (err) {
		// Every HID provider goes quiet when this happens, which otherwise looks
		// exactly like a desk with no supported devices on it.
		log.warn(`${HID_UNAVAILABLE} (${String(err)})`);
		cached = null;
	}
	return cached;
}

/**
 * Opens a HID interface, runs `use`, and closes it again whatever happens.
 *
 * Every provider had its own copy of this open/try/finally dance, and the
 * handles are exclusive on Windows — one early return that skipped the close
 * would lock the device out until Stream Deck restarted. Returns `fallback` if
 * the interface can't be opened or the work throws, because a provider must
 * never take down a scan.
 */
export async function withHidDevice<T>(
	path: string,
	fallback: T,
	use: (device: HidModule.HID) => Promise<T> | T,
	context?: string,
): Promise<T> {
	const HID = await loadHid();
	if (!HID) return fallback;

	let device: HidModule.HID | undefined;
	try {
		device = new HID.HID(path);
		return await use(device);
	} catch (err) {
		if (context) log.warn(`${context}: ${String(err)}`);
		return fallback;
	} finally {
		try {
			device?.close();
		} catch {
			// Already gone — unplugged mid-read, most likely.
		}
	}
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
