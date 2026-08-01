import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeGeneric } from "../src/providers/discovery";
import type { DeviceKind, DiscoveredDevice } from "../src/providers/types";

const device = (
	providerId: string,
	label: string,
	supportsBattery: boolean,
	kind: DeviceKind = "other",
): DiscoveredDevice => ({
	key: `${providerId}:${label}`,
	providerId,
	label,
	kind,
	supportsBattery,
	locator: {},
});

const labels = (devices: DiscoveredDevice[]): string[] => devices.map((d) => `${d.providerId}/${d.label}`);

describe("merging what several providers saw", () => {
	it("drops the entry that can't read a battery when another one can", () => {
		// The real case: a DualSense is a Sony HID device and a paired Bluetooth
		// node, and only the Sony route can read its level.
		const merged = mergeGeneric([
			device("dualsense", "DualSense Wireless Controller", true, "gamepad"),
			device("winbt", "DualSense Wireless Controller", false, "gamepad"),
		]);

		assert.deepEqual(labels(merged), ["dualsense/DualSense Wireless Controller"]);
	});

	it("matches through a manufacturer prefix", () => {
		// HeadsetControl reports the bare product name; the HID layer prefixes the
		// manufacturer, so an exact comparison would keep both.
		const merged = mergeGeneric([
			device("headset", "HyperX Cloud Alpha Wireless", true, "headset"),
			device("hid", "HP, Inc HyperX Cloud Alpha Wireless", false),
		]);

		assert.deepEqual(labels(merged), ["headset/HyperX Cloud Alpha Wireless"]);
	});

	it("keeps unrelated devices that happen to share no name", () => {
		const merged = mergeGeneric([
			device("logitech", "G502 X PLUS", true, "mouse"),
			device("hid", "NZXT Kraken Base", false),
			device("winbt", "Emils Nest Hub", false, "speaker"),
		]);

		assert.equal(merged.length, 3);
	});

	it("won't let a short name swallow the list", () => {
		// Windows really does report one phone here as "4"; substring matching on
		// that would drop every device whose name contains a 4.
		const merged = mergeGeneric([
			device("winbt", "4", true, "phone"),
			device("hid", "Corsair K4 Keyboard", false, "keyboard"),
			device("hid", "Model 4", false),
		]);

		assert.equal(merged.length, 3, "only an exact match may drop a short name");
	});

	it("drops an exact short-name duplicate", () => {
		const merged = mergeGeneric([device("winbt", "4", true, "phone"), device("hid", "4", false)]);
		assert.deepEqual(labels(merged), ["winbt/4"]);
	});

	it("keeps two unreadable entries — neither knows better than the other", () => {
		const merged = mergeGeneric([
			device("winbt", "Emils Nest Hub", false, "speaker"),
			device("hid", "Emils Nest Hub", false, "speaker"),
		]);

		assert.equal(merged.length, 2);
	});
});
