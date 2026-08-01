import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decodeBattery } from "../src/providers/xbox";

const ONLINE = 0x80;
const CHARGING = 0x10;

describe("decoding an Xbox pad's battery flags", () => {
	it("reads the four capacity steps", () => {
		// The pad reports a step, not a percentage — these numbers are the middle
		// of each step, so "70%" means "medium" and will sit there until it moves.
		assert.equal(decodeBattery(ONLINE | 0, "Pad").percent, 10);
		assert.equal(decodeBattery(ONLINE | 1, "Pad").percent, 35);
		assert.equal(decodeBattery(ONLINE | 2, "Pad").percent, 70);
		assert.equal(decodeBattery(ONLINE | 3, "Pad").percent, 100);
	});

	it("says which step it was, since the number is a stand-in", () => {
		assert.match(decodeBattery(ONLINE | 2, "Pad").detail ?? "", /Medium/);
	});

	it("reports charging when the flag is set", () => {
		assert.equal(decodeBattery(ONLINE | CHARGING | 2, "Pad").status, "charging");
		assert.equal(decodeBattery(ONLINE | 2, "Pad").status, "ok");
	});

	it("treats a pad that isn't online as absent rather than empty", () => {
		const reading = decodeBattery(0, "Pad");
		assert.equal(reading.status, "not-found");
		assert.equal(reading.percent, null, "0% would show a switched-off pad as flat");
	});
});
