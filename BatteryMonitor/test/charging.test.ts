import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CHARGE_HOLD_MS, nextChargeGuess } from "../src/actions/charging";

const idle = { rising: false } as const;
const T0 = 1_000_000;

describe("guessing whether a device is on a charger", () => {
	it("calls a rising level charging", () => {
		// The one thing that can't happen off a charger.
		const guess = nextChargeGuess(idle, 40, 41, T0);
		assert.equal(guess.rising, true);
		assert.equal(guess.risingSince, T0);
	});

	it("stops as soon as the level drops", () => {
		const charging = { rising: true, risingSince: T0 };
		const guess = nextChargeGuess(charging, 80, 79, T0 + 60_000);
		assert.equal(guess.rising, false);
		assert.equal(guess.risingSince, undefined);
	});

	it("keeps a full battery charging while it holds at 100%", () => {
		// A phone parked on a charger overnight holds at 100 and is still plugged
		// in, so the hold timeout must not apply here.
		const charging = { rising: true, risingSince: T0 };
		const guess = nextChargeGuess(charging, 100, 100, T0 + 12 * 60 * 60_000);
		assert.equal(guess.rising, true);
	});

	it("keeps the guess while a level below full holds briefly", () => {
		// Chargers nudge the level up every few minutes; a short plateau mid-charge
		// is normal and shouldn't drop the bolt.
		const charging = { rising: true, risingSince: T0 };
		const guess = nextChargeGuess(charging, 70, 70, T0 + CHARGE_HOLD_MS - 1);
		assert.equal(guess.rising, true);
	});

	it("gives up once a level below full has held too long", () => {
		// The iPhone bug: unplugged at 73%, level barely moves, and the key claimed
		// "charging" for hours because only a *drop* used to clear it.
		const charging = { rising: true, risingSince: T0 };
		const guess = nextChargeGuess(charging, 73, 73, T0 + CHARGE_HOLD_MS + 1);
		assert.equal(guess.rising, false);
		assert.equal(guess.risingSince, undefined);
	});

	it("re-arms the timeout each time the level actually rises", () => {
		let guess = nextChargeGuess(idle, 40, 41, T0);
		guess = nextChargeGuess(guess, 41, 42, T0 + CHARGE_HOLD_MS - 1);
		assert.equal(guess.risingSince, T0 + CHARGE_HOLD_MS - 1, "a fresh rise restarts the clock");

		// So a slow but genuine charge is never timed out mid-way.
		const later = nextChargeGuess(guess, 42, 42, T0 + CHARGE_HOLD_MS + 10);
		assert.equal(later.rising, true);
	});

	it("stays off for a device that was never seen rising", () => {
		assert.equal(nextChargeGuess(idle, 50, 50, T0).rising, false);
		assert.equal(nextChargeGuess(idle, undefined, 50, T0).rising, false);
	});

	it("holds its ground on the first reading, with nothing to compare against", () => {
		const charging = { rising: true, risingSince: T0 };
		const guess = nextChargeGuess(charging, undefined, 90, T0 + 1000);
		assert.equal(guess.rising, true, "a restart shouldn't silently clear the guess");
	});

	it("doesn't mutate what it was given", () => {
		const charging = { rising: true, risingSince: T0 };
		nextChargeGuess(charging, 80, 79, T0);
		assert.equal(charging.rising, true, "callers store the result; the input stays put");
	});

	it("carries the device it belongs to", () => {
		const guess = nextChargeGuess({ rising: false, deviceKey: "winbt:phone" }, 40, 41, T0);
		assert.equal(guess.deviceKey, "winbt:phone");
	});
});
