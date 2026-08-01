import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decodeDualShock4, decodeStatus, statusIndexOf } from "../src/providers/dualsense";

describe("DualSense status byte", () => {
	it("reads the level from the low nibble, centred on each step", () => {
		// 0x08 is what the pad on the bench actually sent: level 8, discharging.
		const reading = decodeStatus(0x08, "DualSense");
		assert.equal(reading.percent, 85);
		assert.equal(reading.status, "ok");
	});

	it("treats both cable states as charging", () => {
		assert.equal(decodeStatus(0x18, "DualSense").status, "charging", "0x1 = charging");

		// 0x28 is "charge complete" — which the pad reports at level 8, not 10, so
		// the level is kept rather than rounded up to a number it never sent.
		const complete = decodeStatus(0x28, "DualSense");
		assert.equal(complete.status, "charging");
		assert.equal(complete.percent, 85);
		assert.equal(complete.detail, "Charge complete");
	});

	it("takes a complete-at-zero as genuinely full", () => {
		assert.equal(decodeStatus(0x20, "DualSense").percent, 100);
	});

	it("reports faults without inventing a level", () => {
		assert.equal(decodeStatus(0xa8, "DualSense").status, "error");
		assert.equal(decodeStatus(0xf8, "DualSense").status, "error");
	});

	it("caps a full battery at 100", () => {
		assert.equal(decodeStatus(0x0a, "DualSense").percent, 100);
	});
});

describe("DualShock 4 status byte", () => {
	it("scales out of ten on battery", () => {
		assert.equal(decodeDualShock4(0x05, "DualShock 4").percent, 50);
		assert.equal(decodeDualShock4(0x05, "DualShock 4").status, "ok");
	});

	it("scales out of eleven on the cable, where the range is longer", () => {
		const charging = decodeDualShock4(0x15, "DualShock 4");
		assert.equal(charging.status, "charging");
		assert.equal(charging.percent, 45);
	});

	it("calls the top of the charging range complete", () => {
		const full = decodeDualShock4(0x1b, "DualShock 4");
		assert.equal(full.percent, 100);
		assert.equal(full.detail, "Charge complete");
	});
});

describe("which byte carries the battery", () => {
	const ds5Bluetooth = [0x31, 0x41, 0x7e];
	const ds5Usb = [0x01, 0x7e, 0x85];
	const ds4Bluetooth = [0x11, 0xc0, 0x00];

	it("only trusts the full report over Bluetooth", () => {
		assert.equal(statusIndexOf(ds5Bluetooth, true, "dualsense"), 54);

		// The compatibility report reuses id 0x01 and is padded to the same length,
		// so length can't tell them apart — the id has to.
		assert.equal(statusIndexOf(ds5Usb, true, "dualsense"), null);
	});

	it("uses the earlier offset over USB, where there's no extra header byte", () => {
		assert.equal(statusIndexOf(ds5Usb, false, "dualsense"), 53);
	});

	it("keeps the two pad families apart", () => {
		assert.equal(statusIndexOf(ds4Bluetooth, true, "dualshock4"), 32);
		assert.equal(statusIndexOf(ds4Bluetooth, true, "dualsense"), null, "a DS4 report is not a DualSense one");
		assert.equal(statusIndexOf(ds5Bluetooth, true, "dualshock4"), null);
	});
});
