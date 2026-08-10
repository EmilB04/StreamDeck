import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseDevices, toReading } from "../src/providers/headsetcontrol";

describe("reading HeadsetControl's output", () => {
	it("understands the v3 shape", () => {
		const devices = parseDevices(
			JSON.stringify({
				devices: [{ device: "SteelSeries Arctis 7", battery: { level: 64, status: "BATTERY_AVAILABLE" } }],
			}),
		);

		assert.equal(devices.length, 1);
		assert.equal(devices[0]?.label, "SteelSeries Arctis 7");
		assert.equal(devices[0]?.reading?.percent, 64);
		assert.equal(devices[0]?.reading?.status, "ok");
	});

	it("understands the older nested shape", () => {
		// Both shapes are in the wild; the version installed is not ours to choose.
		const devices = parseDevices(
			JSON.stringify({ devices: [{ device: "Arctis Nova", status: { battery: { level: 30 } } }] }),
		);

		assert.equal(devices[0]?.reading?.percent, 30);
	});

	it("falls back to the plain-text output of very old builds", () => {
		const devices = parseDevices("Battery: 75%");
		assert.equal(devices.length, 1);
		assert.equal(devices[0]?.reading?.percent, 75);
	});

	it("returns nothing rather than throwing on output it can't use", () => {
		// The contract callers rely on is that a scan never throws. These are the
		// shapes that used to reach a `.trim()` or `slug()` and take the poll down.
		assert.deepEqual(parseDevices(""), []);
		assert.deepEqual(parseDevices("command not found"), []);
		assert.deepEqual(parseDevices("null"), []);
		assert.deepEqual(parseDevices(JSON.stringify({ devices: [] })), []);
	});

	it("survives a device whose fields are the wrong types", () => {
		const devices = parseDevices(
			JSON.stringify({
				devices: [{ device: { unexpected: "object" }, vendor: 42, battery: { level: 50 } }],
			}),
		);

		// It keeps the reading and settles for a generic name, rather than throwing
		// on a field that used to be a string.
		assert.equal(devices.length, 1);
		assert.equal(devices[0]?.label, "Headset");
		assert.equal(devices[0]?.reading?.percent, 50);
	});
});

describe("turning one HeadsetControl device into a reading", () => {
	it("reports charging when the tool says so", () => {
		const reading = toReading("Arctis", { battery: { level: 80, status: "BATTERY_CHARGING" } });
		assert.equal(reading?.status, "charging");
	});

	it("treats the tool's error states as offline, not as empty", () => {
		for (const status of ["BATTERY_UNAVAILABLE", "BATTERY_TIMEOUT", "BATTERY_HIDERROR"]) {
			const reading = toReading("Arctis", { battery: { level: 0, status } });
			assert.equal(reading?.status, "not-found", status);
			assert.equal(reading?.percent, null, `${status} must not read as 0%`);
		}
	});

	it("prefers the tool's own explanation when it gives one", () => {
		const reading = toReading("Arctis", {
			battery: { level: 0, status: "BATTERY_TIMEOUT" },
			errors: { battery: "Device is offline or not responding" },
		});

		assert.match(reading?.detail ?? "", /Device is offline or not responding/);
	});

	it("says nothing at all when there is no battery field", () => {
		assert.equal(toReading("Arctis", {}), undefined);
		assert.equal(toReading("Arctis", { battery: null }), undefined);
		assert.equal(toReading("Arctis", { battery: "not an object" }), undefined);
	});

	it("keeps the level inside 0-100", () => {
		assert.equal(toReading("Arctis", { battery: { level: 140 } })?.percent, 100);
	});
});
