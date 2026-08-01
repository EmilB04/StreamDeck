import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { kindOf, toReading } from "../src/providers/windows-bluetooth";

describe("reading a Windows Bluetooth battery entry", () => {
	it("reports the level Windows gave", () => {
		const reading = toReading({ id: "BTHLE\\DEV_1", name: "MX Master 3S", level: 72 });
		assert.equal(reading.percent, 72);
		assert.equal(reading.status, "ok");
		assert.equal(reading.deviceLabel, "MX Master 3S");
	});

	it("calls a paired device with no level unreadable rather than flat", () => {
		// The distinction matters: 0% would show a device in the red when in fact
		// Windows simply has no GATT battery service to ask.
		const reading = toReading({ id: "BTHENUM\\DEV_2", name: "Speaker", level: null });
		assert.equal(reading.percent, null);
		assert.equal(reading.status, "unsupported");
	});

	it("falls back to a generic label when the device has no name", () => {
		const reading = toReading({ id: "BTHLE\\DEV_3", name: "   ", level: 40 });
		assert.equal(reading.deviceLabel, "Bluetooth device");
	});

	it("keeps the level inside 0-100", () => {
		assert.equal(toReading({ id: "a", name: "x", level: 140 }).percent, 100);
		assert.equal(toReading({ id: "a", name: "x", level: -5 }).percent, 0);
	});
});

describe("guessing a form factor from the Windows name", () => {
	it("recognises the obvious ones", () => {
		assert.equal(kindOf("Sony WH-1000XM5 Headphones"), "headset");
		assert.equal(kindOf("MX Master 3S Mouse"), "mouse");
		assert.equal(kindOf("Emil's iPhone"), "phone");
	});

	it("settles for 'other' when the name says nothing", () => {
		assert.equal(kindOf("4"), "other");
		assert.equal(kindOf(""), "other");
	});
});
