import { AsusProvider } from "./asus";
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
	new WindowsBluetoothProvider(),
];

const providersById = new Map(providers.map((p) => [p.id, p]));

/** A scan opens HID interfaces and shells out, so results are reused briefly. */
const CACHE_TTL_MS = 10_000;

const KIND_ORDER: Record<DeviceKind, number> = {
	headset: 0,
	mouse: 1,
	keyboard: 2,
	gamepad: 3,
	other: 4,
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

		const devices: DiscoveredDevice[] = [];
		results.forEach((result, i) => {
			if (result.status === "fulfilled") devices.push(...result.value);
			else log.warn(`discovery: provider ${providers[i].id} failed`, result.reason);
		});

		devices.sort(
			(a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.label.localeCompare(b.label),
		);

		log.info(`discovery: found ${devices.length} device(s) in ${Date.now() - started}ms`);
		this.cache = { at: Date.now(), devices };
		return devices;
	}
}

export const discovery = new DeviceDiscovery();
