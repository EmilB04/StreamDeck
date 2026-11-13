import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chosenIds, resolved } from "../src/actions/settings";

describe("reading a key's settings", () => {
	it("fills a new key with defaults", () => {
		assert.deepEqual(resolved(undefined), {
			mode: "set",
			device: "",
			devices: [],
			role: "both",
			label: "auto",
			customLabel: "",
			showIcon: true,
			icon: "auto",
			names: {},
			kinds: {},
		});
	});

	it("treats values of the wrong kind as absent", () => {
		const s = resolved({
			mode: "shuffle",
			device: 7,
			devices: "a",
			role: "everything",
			label: 1,
			customLabel: {},
			names: ["x"],
			icon: "sofa",
			kinds: { a: "sofa", b: "tv" },
		} as never);
		assert.deepEqual({ ...s, kinds: {} }, resolved({}));
		assert.deepEqual(s.kinds, { b: "tv" });
	});

	it("drops junk from the device list and removes repeats", () => {
		const s = resolved({ devices: ["a", "", 3, "a", "b", null] as never });
		assert.deepEqual(s.devices, ["a", "b"]);
	});

	it("turns the icon off only when told to", () => {
		assert.equal(resolved({ showIcon: false }).showIcon, false);
		assert.equal(resolved({ showIcon: "no" } as never).showIcon, true);
	});

	it("reports the devices that belong to the current mode", () => {
		assert.deepEqual(chosenIds(resolved({ mode: "set", device: "a", devices: ["b", "c"] })), ["a"]);
		assert.deepEqual(chosenIds(resolved({ mode: "cycle", device: "a", devices: ["b", "c"] })), ["b", "c"]);
		assert.deepEqual(chosenIds(resolved({})), []);
	});
});
