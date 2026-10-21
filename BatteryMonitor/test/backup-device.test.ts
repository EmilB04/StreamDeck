import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { KeyAction } from "@elgato/streamdeck";
import { BatteryStatusAction } from "../src/actions/battery-status";
import type { BatterySettings } from "../src/actions/settings";
import { discovery } from "../src/providers/discovery";
import type { BatteryReading, DiscoveredDevice } from "../src/providers/types";

const device = (key: string, label: string, reading: BatteryReading): DiscoveredDevice => ({
	key,
	providerId: "test",
	label,
	kind: "keyboard",
	supportsBattery: reading.percent !== null,
	locator: {},
	reading,
});

const wireless = (reading: Partial<BatteryReading>) =>
	device("asus:1a83", "ROG AZOTH", { deviceLabel: "ROG AZOTH", percent: 64, status: "ok", ...reading });
const wired = device("hid:046d:c33f", "G815", { deviceLabel: "G815", percent: null, status: "mains" });

/** Puts a scan in discovery's cache, so nothing touches real hardware. */
function scanned(devices: DiscoveredDevice[]): void {
	(discovery as unknown as { cache: unknown }).cache = { at: Date.now(), devices };
}

function fakeAction(): KeyAction<BatterySettings> {
	return {
		id: "key-1",
		isKey: () => true,
		setSettings: async () => {},
		setImage: async () => {},
		setTitle: async () => {},
		showAlert: async () => {},
	} as unknown as KeyAction<BatterySettings>;
}

class Probe extends BatteryStatusAction {
	async readNow(settings: BatterySettings) {
		const result = await this.read(fakeAction(), settings, false);
		return { ...result, label: this.label(result.settings, result.reading) };
	}
}

const settings: BatterySettings = {
	deviceKey: "asus:1a83",
	deviceLabel: "ROG AZOTH",
	deviceKind: "keyboard",
	backupDeviceKey: "hid:046d:c33f",
	displayName: "Keyboard",
};

describe("a backup device", () => {
	it("stays out of the way while the main device answers", async () => {
		scanned([wireless({}), wired]);
		const result = await new Probe().readNow(settings);

		assert.equal(result.reading.percent, 64);
		assert.equal(result.reading.fromBackup, undefined);
		assert.equal(result.label, "Keyboard");
	});

	it("takes over when the main device is switched off", async () => {
		// The dongle is still plugged in, so the keyboard is listed but silent.
		scanned([wireless({ percent: null, status: "not-found" }), wired]);
		const result = await new Probe().readNow(settings);

		assert.equal(result.reading.status, "mains");
		assert.equal(result.reading.fromBackup, true);
		assert.equal(result.label, "G815", "goes by its own name, not the main device's nickname");
	});

	it("takes over when the main device isn't detected at all", async () => {
		scanned([wired]);
		const result = await new Probe().readNow(settings);
		assert.equal(result.reading.fromBackup, true);
	});

	it("leaves the main device's offline state when the backup is gone too", async () => {
		scanned([wireless({ percent: null, status: "not-found" })]);
		const result = await new Probe().readNow(settings);

		assert.equal(result.reading.status, "not-found");
		assert.equal(result.reading.fromBackup, undefined);
	});

	it("does nothing without one configured", async () => {
		scanned([wired]);
		const result = await new Probe().readNow({ ...settings, backupDeviceKey: undefined });
		assert.equal(result.reading.status, "not-found");
	});
});
