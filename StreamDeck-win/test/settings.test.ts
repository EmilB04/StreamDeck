import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	adaptiveSeconds,
	estimateRemaining,
	extractAppearance,
	formatDuration,
	migrate,
	MIN_REFRESH_SECONDS,
	nextPollSeconds,
	recordSample,
	refreshSeconds,
	watchIncludes,
} from "../src/actions/settings";
import type { BatteryReading } from "../src/providers/types";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const reading = (percent: number | null, status: BatteryReading["status"] = "ok"): BatteryReading => ({
	deviceLabel: "Test device",
	percent,
	status,
});

describe("battery history", () => {
	it("keeps a sample per change, ignoring repeats", () => {
		let history = recordSample(undefined, 80, 0);
		history = recordSample(history, 80, MINUTE);
		history = recordSample(history, 79, 2 * MINUTE);

		assert.deepEqual(history, [
			{ percent: 80, at: 0 },
			{ percent: 79, at: 2 * MINUTE },
		]);
	});

	it("starts over when the level rises, because a charge breaks the trend", () => {
		let history = recordSample(undefined, 80, 0);
		history = recordSample(history, 70, HOUR);
		history = recordSample(history, 95, 2 * HOUR);

		assert.deepEqual(history, [{ percent: 95, at: 2 * HOUR }]);
	});

	it("keeps the window bounded", () => {
		let history: ReturnType<typeof recordSample> | undefined;
		for (let i = 0; i < 20; i++) history = recordSample(history, 100 - i, i * MINUTE);

		assert.equal(history!.length, 8);
		assert.equal(history!.at(-1)?.percent, 81);
	});
});

describe("time remaining", () => {
	it("extrapolates from the observed rate", () => {
		// 5% an hour, currently at 70% -> about fourteen hours left.
		const history = [
			{ percent: 90, at: 0 },
			{ percent: 70, at: 4 * HOUR },
		];

		const remaining = estimateRemaining(history, 70, 4 * HOUR);
		assert.ok(remaining !== null);
		assert.equal(formatDuration(remaining), "14h");
	});

	it("says nothing without enough evidence", () => {
		assert.equal(estimateRemaining(undefined, 80, 0), null, "no history");
		assert.equal(estimateRemaining([{ percent: 80, at: 0 }], 80, 0), null, "one sample");

		// The case that made a real key claim minutes of life: a 3% drop measured
		// across three seconds, as a device woke up and settled.
		const blip = [
			{ percent: 98, at: 0 },
			{ percent: 95, at: 2_800 },
		];
		assert.equal(estimateRemaining(blip, 95, 2_800), null, "3% in seconds is not a rate");

		const shallow = [
			{ percent: 80, at: 0 },
			{ percent: 79, at: 2 * HOUR },
		];
		assert.equal(estimateRemaining(shallow, 79, 2 * HOUR), null, "1% is inside the noise");
	});

	it("counts the time since the last sample", () => {
		const history = [
			{ percent: 90, at: 0 },
			{ percent: 80, at: 2 * HOUR },
		];

		const fresh = estimateRemaining(history, 80, 2 * HOUR)!;
		const later = estimateRemaining(history, 80, 3 * HOUR)!;
		assert.ok(later < fresh, "an hour of sitting still is an hour less remaining");
		assert.equal(Math.round((fresh - later) / HOUR), 1);
	});
});

describe("duration wording", () => {
	it("drops to the units that matter", () => {
		assert.equal(formatDuration(45 * MINUTE), "45m");
		assert.equal(formatDuration(2 * HOUR + 20 * MINUTE), "2h 20m");
		assert.equal(formatDuration(3 * HOUR), "3h");
		assert.equal(formatDuration(26 * HOUR), "1d 2h");
		assert.equal(formatDuration(48 * HOUR), "2d");
	});
});

describe("adaptive polling", () => {
	const settings = { refreshSeconds: 60, lowThreshold: 20, pollMode: "adaptive" as const };

	it("hurries for the states worth watching", () => {
		assert.equal(adaptiveSeconds(settings, reading(40, "charging"), 0), 15);
		assert.equal(adaptiveSeconds(settings, reading(15), 0), 30);
	});

	it("never goes slower than the configured interval for those states", () => {
		const brisk = { ...settings, refreshSeconds: 15 };
		assert.equal(adaptiveSeconds(brisk, reading(40, "charging"), 0), 15);
		assert.equal(adaptiveSeconds(brisk, reading(15), 0), 15, "30s default must not slow a 15s key");
	});

	it("backs off while nothing changes, up to a ceiling", () => {
		assert.equal(adaptiveSeconds(settings, reading(80), 0), 60);
		assert.ok(adaptiveSeconds(settings, reading(80), 3) > 60);
		assert.equal(adaptiveSeconds(settings, reading(80), 50), 600, "capped");
	});

	it("waits longer on a device that isn't there", () => {
		assert.equal(adaptiveSeconds(settings, reading(null, "not-found"), 0), 120);
	});

	it("respects the floor", () => {
		const impatient = { ...settings, refreshSeconds: 1 };
		assert.equal(refreshSeconds(impatient), MIN_REFRESH_SECONDS);
		assert.ok(adaptiveSeconds(impatient, reading(5), 0) >= MIN_REFRESH_SECONDS);
	});

	it("is ignored entirely in fixed mode", () => {
		const fixed = { ...settings, pollMode: "fixed" as const };
		assert.equal(nextPollSeconds(fixed, reading(40, "charging"), 9), 60);
	});
});

describe("what the lowest-battery key counts", () => {
	it("leaves out devices with their own chargers", () => {
		assert.equal(watchIncludes("peripherals", "headset"), true);
		assert.equal(watchIncludes("peripherals", "phone"), false);
		assert.equal(watchIncludes("peripherals", "watch"), false);
		assert.equal(watchIncludes("everything", "phone"), true);
	});
});

describe("settings migration", () => {
	it("writes defaults into a fresh key", () => {
		const migrated = migrate({});
		assert.ok(migrated);
		assert.equal(migrated.configured, true);
		assert.equal(migrated.colorCharging, "#55ff7f");
		assert.equal(migrated.colorBackground, "#000000");
	});

	it("does nothing to a key already at the current version", () => {
		const current = migrate({})!;
		assert.equal(migrate(current), undefined);
	});

	it("moves a key off a colour this plugin chose", () => {
		const old = { configured: true, settingsVersion: 1, colorCharging: "#3ba7ff", colorBackground: "#1e2024" };
		const migrated = migrate(old)!;

		assert.equal(migrated.colorCharging, "#55ff7f");
		assert.equal(migrated.colorBackground, "#000000");
	});

	it("leaves a colour the user picked alone", () => {
		const mine = { configured: true, settingsVersion: 1, colorCharging: "#ff00ff", colorBackground: "#123456" };
		const migrated = migrate(mine)!;

		assert.equal(migrated.colorCharging, "#ff00ff");
		assert.equal(migrated.colorBackground, "#123456");
	});

	it("moves a key onto adaptive polling, which is now the default", () => {
		const old = { configured: true, settingsVersion: 5, pollMode: "fixed" as const };
		assert.equal(migrate(old)!.pollMode, "adaptive");
		assert.equal(migrate({})!.pollMode, "adaptive", "and a fresh key starts there");
	});

	it("keeps everything else the key had", () => {
		const migrated = migrate({ configured: true, settingsVersion: 1, deviceKey: "logitech:abc", displayName: "Mouse" })!;
		assert.equal(migrated.deviceKey, "logitech:abc");
		assert.equal(migrated.displayName, "Mouse");
	});
});

describe("shared appearance", () => {
	it("takes the look and nothing else", () => {
		const appearance = extractAppearance({
			deviceKey: "logitech:abc",
			displayName: "Mouse",
			lastPercent: 42,
			colorLow: "#111111",
			lowThreshold: 25,
			showTimeLeft: true,
		});

		assert.deepEqual(appearance, { colorLow: "#111111", lowThreshold: 25, showTimeLeft: true });
	});
});
