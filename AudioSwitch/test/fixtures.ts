import type { AudioDevice, Flow } from "../src/audio/devices";
import type { DeviceKeySettings, ResolvedSettings } from "../src/actions/settings";
import { resolved } from "../src/actions/settings";

/** A device with only the interesting parts spelled out. */
export function device(id: string, overrides: Partial<AudioDevice> = {}): AudioDevice {
	const flow: Flow = overrides.flow ?? "output";
	return {
		id,
		flow,
		name: `${id} (Adapter ${id})`,
		description: id,
		adapter: `Adapter ${id}`,
		formFactor: -1,
		isDefault: false,
		isCommunications: false,
		...overrides,
	};
}

export function settings(partial: DeviceKeySettings): ResolvedSettings {
	return resolved(partial);
}
