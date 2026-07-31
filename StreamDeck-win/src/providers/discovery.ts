import { AsusProvider } from "./asus";
import { DualSenseProvider } from "./dualsense";
import { GenericHidProvider } from "./generic-hid";
import { HeadsetControlProvider } from "./headsetcontrol";
import { log } from "./log";
import { LogitechProvider } from "./logitech";
import type { BatteryProvider, DeviceKind, DiscoveredDevice } from "./types";
import { WindowsBluetoothProvider } from "./windows-bluetooth";

/**
 * Every provider is asked to enumerate what it can see; nothing is registered
 * per-model. Adding support for a new device family means adding a provider
 * here, not adding an entry to a device list.
 */
const providers: BatteryProvider[] = [
	new HeadsetControlProvider(),
	new LogitechProvider(),
	new AsusProvider(),
	new DualSenseProvider(),
	new WindowsBluetoothProvider(),
	// Last: its entries are dropped wherever a real provider covers the same
	// hardware (see mergeGeneric).
	new GenericHidProvider(),
];

const providersById = new Map(providers.map((p) => [p.id, p]));

/** A scan opens HID interfaces and shells out, so results are reused briefly. */
const CACHE_TTL_MS = 10_000;

/** Desk peripherals first, then things that merely happen to be paired. */
const KIND_ORDER: Record<DeviceKind, number> = {
	headset: 0,
	earbuds: 1,
	mouse: 2,
	keyboard: 3,
	gamepad: 4,
	microphone: 5,
	speaker: 6,
	phone: 7,
	tablet: 8,
	watch: 9,
	other: 10,
};

class DeviceDiscovery {
	private cache: { at: number; devices: DiscoveredDevice[] } | undefined;
	private inflight: Promise<DiscoveredDevice[]> | undefined;

	/** Lists everything detected on this machine, right now. */
	async list(force = false): Promise<DiscoveredDevice[]> {
		if (force) this.invalidate();
		if (this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) {
			return this.cache.devices;
		}
		// Serialize: concurrent scans would fight over exclusive HID handles.
		this.inflight ??= this.scan().finally(() => {
			this.inflight = undefined;
		});
		return this.inflight;
	}

	async find(key: string, force = false): Promise<DiscoveredDevice | undefined> {
		return (await this.list(force)).find((d) => d.key === key);
	}

	invalidate(): void {
		this.cache = undefined;
	}

	provider(id: string): BatteryProvider | undefined {
		return providersById.get(id);
	}

	private async scan(): Promise<DiscoveredDevice[]> {
		const started = Date.now();
		const results = await Promise.allSettled(providers.map((p) => p.discover()));

		const found: DiscoveredDevice[] = [];
		results.forEach((result, i) => {
			if (result.status === "fulfilled") found.push(...result.value);
			else log.warn(`discovery: provider ${providers[i].id} failed`, result.reason);
		});

		const devices = mergeGeneric(found);

		// Devices that can actually report a level come first: the picker defaults
		// to the top entry, and the catch-all list is long.
		devices.sort(
			(a, b) =>
				Number(b.supportsBattery) - Number(a.supportsBattery) ||
				KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
				a.label.localeCompare(b.label),
		);

		log.info(`discovery: found ${devices.length} device(s) in ${Date.now() - started}ms`);
		this.cache = { at: Date.now(), devices };
		return devices;
	}
}

export const discovery = new DeviceDiscovery();

/**
 * Drops entries for hardware another provider described better.
 *
 * One device can legitimately reach two providers: a DualSense is both a Sony
 * HID device and a paired Bluetooth node, and a HyperX headset is both a
 * HeadsetControl device and a plain HID interface. Only one of those knows how
 * to read its battery, and the picker shouldn't offer the other.
 *
 * Names are what's available to match on — they all come from the device's own
 * product string — so they're compared loosely: the HID layer prefixes the
 * manufacturer ("HP, Inc HyperX Cloud Alpha Wireless") where HeadsetControl
 * doesn't. A false match only costs a duplicate entry that said less than the
 * one it was dropped for.
 */
function mergeGeneric(devices: DiscoveredDevice[]): DiscoveredDevice[] {
	const readable = devices.filter((d) => d.supportsBattery).map((d) => normalize(d.label));

	return devices.filter((device) => {
		if (device.supportsBattery) return true;

		// Fallback entries lose to anything; a provider-specific entry only loses
		// to one that can actually report a level.
		const name = normalize(device.label);
		return !readable.some((other) => sameDevice(name, other));
	});
}

/**
 * Loose name match, but only loose enough to survive a manufacturer prefix.
 * Substring matching on a short name would collide with anything ("4" is a real
 * Bluetooth friendly name on the dev machine), so that falls back to equality.
 */
const MIN_SUBSTRING_MATCH = 6;

function sameDevice(a: string, b: string): boolean {
	if (a === b) return true;
	const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
	return shorter.length >= MIN_SUBSTRING_MATCH && longer.includes(shorter);
}

function normalize(label: string): string {
	return label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
