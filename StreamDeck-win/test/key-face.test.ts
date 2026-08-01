import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { KeyAction } from "@elgato/streamdeck";
import type { Face, Reading } from "../src/actions/key-face";
import { KeyFaceAction } from "../src/actions/key-face";
import type { BatterySettings } from "../src/actions/settings";
import type { BatteryReading, DeviceKind } from "../src/providers/types";

const reading = (percent: number | null, status: BatteryReading["status"] = "ok"): BatteryReading => ({
	deviceLabel: "Test device",
	percent,
	status,
});

/** A Stream Deck key, reduced to the calls KeyFaceAction actually makes. */
function fakeAction(id = "key-1", settings: BatterySettings = {}) {
	const calls = { images: [] as string[], titles: [] as (string | undefined)[], alerts: 0, settings: 0 };
	const action = {
		id,
		isKey: () => true,
		getSettings: async () => settings,
		setSettings: async (next: BatterySettings) => {
			calls.settings += 1;
			settings = next;
		},
		setImage: async (image: string) => void calls.images.push(image),
		setTitle: async (title?: string) => void calls.titles.push(title),
		showAlert: async () => void (calls.alerts += 1),
	};
	return { action: action as unknown as KeyAction<BatterySettings>, calls };
}

/**
 * The smallest possible concrete key: it reports whatever it's told to, so the
 * tests exercise the shared machinery rather than any one action's device code.
 */
class TestKey extends KeyFaceAction<BatterySettings> {
	next: BatteryReading = reading(80);
	readsSeen = 0;
	throwOnRead = false;

	protected async read(
		_action: KeyAction<BatterySettings>,
		settings: BatterySettings,
	): Promise<Reading<BatterySettings>> {
		this.readsSeen += 1;
		if (this.throwOnRead) throw new Error("device exploded");
		return { settings, reading: this.next, kind: "headset" };
	}

	protected present(
		_action: KeyAction<BatterySettings>,
		_settings: BatterySettings,
		live: BatteryReading,
		kind: DeviceKind,
	): Face {
		return { reading: live, kind, name: "" };
	}

	// Reaching the private-ish helpers the tests are actually about.
	peek(id: string) {
		return this.state(id);
	}
	count() {
		return this.keys.size;
	}
	async run(action: KeyAction<BatterySettings>, settings: BatterySettings, force = false) {
		await this.refresh(action, settings, force);
	}
	arm(action: KeyAction<BatterySettings>, settings: BatterySettings) {
		this.schedule(action, settings);
	}
}

describe("a key's state, and letting go of it", () => {
	it("forgets everything about a key that disappears", () => {
		// The leak this guards: per-key bookkeeping used to live in maps the
		// subclass never cleaned, so every key ever shown stayed in memory.
		const key = new TestKey();
		const { action } = fakeAction();

		key.peek(action.id).unchanged = 5;
		assert.equal(key.count(), 1);

		key.onWillDisappear({ action } as never);
		assert.equal(key.count(), 0, "no state left behind for a key that's gone");
	});

	it("clears the timers it armed, so nothing fires for a vanished key", () => {
		const key = new TestKey();
		const { action } = fakeAction();

		key.arm(action, { refreshSeconds: 3600 });
		assert.ok(key.peek(action.id).pollTimer, "a poll is pending");

		key.onWillDisappear({ action } as never);
		// An orphaned timer would keep the process alive and paint a dead key.
		assert.equal(key.count(), 0);
	});

	it("hands the same record back for the same key", () => {
		const key = new TestKey();
		assert.equal(key.peek("key-1"), key.peek("key-1"));
		assert.notEqual(key.peek("key-1"), key.peek("key-2"));
	});
});

describe("painting a key", () => {
	it("draws what was read", async () => {
		const key = new TestKey();
		const { action, calls } = fakeAction();

		await key.run(action, {});
		assert.equal(calls.images.length, 1);
		assert.equal(key.peek(action.id).drawn?.reading.percent, 80);
	});

	it("still paints something when the read throws", async () => {
		// A key that silently keeps its last face is indistinguishable from one
		// that's working, so a failure has to be visible.
		const key = new TestKey();
		key.throwOnRead = true;
		const { action, calls } = fakeAction();

		await key.run(action, {});
		assert.equal(calls.images.length, 1);
		assert.equal(key.peek(action.id).drawn?.reading.status, "error");
	});

	it("counts repeat readings, which is what widens the adaptive interval", async () => {
		const key = new TestKey();
		const { action } = fakeAction();

		await key.run(action, {});
		assert.equal(key.peek(action.id).unchanged, 0);

		await key.run(action, {});
		assert.equal(key.peek(action.id).unchanged, 1, "same reading again");

		key.next = reading(60);
		await key.run(action, {});
		assert.equal(key.peek(action.id).unchanged, 0, "a change resets the backoff");
	});

	it("records when a live level last arrived, but not a stale one", async () => {
		const key = new TestKey();
		const { action } = fakeAction();

		await key.run(action, {});
		const live = key.peek(action.id).lastLiveAt;
		assert.ok(live !== undefined);

		key.next = reading(80, "stale");
		await key.run(action, {});
		assert.equal(key.peek(action.id).lastLiveAt, live, "a remembered level isn't a sighting");
	});
});

describe("the low-battery warning", () => {
	it("fires once on the way down, not on every poll", async () => {
		// Six flashes a minute is how you make someone switch the warning off.
		const key = new TestKey();
		const { action, calls } = fakeAction();
		const settings = { alertBelow: 20 };

		key.next = reading(15);
		await key.run(action, settings);
		await key.run(action, settings);
		await key.run(action, settings);

		assert.equal(calls.alerts, 1);
	});

	it("re-arms once the level recovers", async () => {
		const key = new TestKey();
		const { action, calls } = fakeAction();
		const settings = { alertBelow: 20 };

		key.next = reading(15);
		await key.run(action, settings);
		key.next = reading(50);
		await key.run(action, settings);
		key.next = reading(15);
		await key.run(action, settings);

		assert.equal(calls.alerts, 2);
	});

	it("stays quiet for a device that's merely remembered", async () => {
		// Otherwise a device left switched off below the threshold warns forever.
		const key = new TestKey();
		const { action, calls } = fakeAction();

		key.next = reading(5, "stale");
		await key.run(action, { alertBelow: 20 });
		assert.equal(calls.alerts, 0);
	});

	it("stays quiet while charging, and when switched off entirely", async () => {
		const key = new TestKey();
		const { action, calls } = fakeAction();

		key.next = reading(5, "charging");
		await key.run(action, { alertBelow: 20 });
		assert.equal(calls.alerts, 0, "on its way up already");

		key.next = reading(5);
		await key.run(action, { alertBelow: 0 });
		assert.equal(calls.alerts, 0, "0 disables the warning");
	});
});
