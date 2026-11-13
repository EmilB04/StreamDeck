import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	faceFor,
	findDevice,
	labelFor,
	namesToSave,
	pickerItems,
	planPress,
	rememberedFor,
	rotation,
} from "../src/actions/switching";
import { device, settings } from "./fixtures";

describe("a key that sets one device", () => {
	it("switches to its device when something else is the default", () => {
		const list = [device("a", { isDefault: true, isCommunications: true }), device("b")];
		const plan = planPress(settings({ device: "b" }), list);
		assert.deepEqual(plan, { kind: "switch", target: list[1] });
	});

	it("does nothing when its device already holds every default it covers", () => {
		const list = [device("a", { isDefault: true, isCommunications: true })];
		assert.equal(planPress(settings({ device: "a" }), list).kind, "already");
	});

	it("still switches when its device holds only one of the two defaults", () => {
		// Default for music but not for calls: "both" isn't satisfied yet.
		const list = [device("a", { isDefault: true }), device("b", { isCommunications: true })];
		assert.equal(planPress(settings({ device: "a", role: "both" }), list).kind, "switch");
		assert.equal(planPress(settings({ device: "a", role: "default" }), list).kind, "already");
		assert.equal(planPress(settings({ device: "a", role: "communications" }), list).kind, "switch");
	});

	it("can't act with no device chosen, or with the device unplugged", () => {
		const list = [device("a", { isDefault: true })];
		assert.equal(planPress(settings({}), list).kind, "unavailable");
		assert.equal(planPress(settings({ device: "gone" }), list).kind, "unavailable");
	});
});

describe("a key that steps through devices", () => {
	const cycle = (ids: string[], role?: "both" | "default" | "communications") =>
		settings({ mode: "cycle", devices: ids, role });

	it("moves to the next device and wraps at the end", () => {
		const at = (current: string) =>
			["a", "b", "c"].map((id) => device(id, { isDefault: id === current, isCommunications: id === current }));
		const target = (current: string) => {
			const plan = planPress(cycle(["a", "b", "c"]), at(current));
			return plan.kind === "switch" ? plan.target.id : plan.kind;
		};

		assert.equal(target("a"), "b");
		assert.equal(target("b"), "c");
		assert.equal(target("c"), "a");
	});

	it("is a plain toggle with two devices", () => {
		const list = [device("a", { isDefault: true, isCommunications: true }), device("b"), device("c")];
		const plan = planPress(cycle(["a", "b"]), list);
		assert.equal(plan.kind === "switch" && plan.target.id, "b");
	});

	it("starts at its first device when the default is none of its own", () => {
		const list = [device("a"), device("b"), device("other", { isDefault: true, isCommunications: true })];
		const plan = planPress(cycle(["a", "b"]), list);
		assert.equal(plan.kind === "switch" && plan.target.id, "a");
	});

	it("skips a device that isn't connected", () => {
		// "b" is chosen but absent, so from "a" the next one present is "c".
		const list = [device("a", { isDefault: true, isCommunications: true }), device("c")];
		const plan = planPress(cycle(["a", "b", "c"]), list);
		assert.equal(plan.kind === "switch" && plan.target.id, "c");
	});

	it("follows Windows' order, not the order the boxes were ticked in", () => {
		const list = [device("a", { isDefault: true, isCommunications: true }), device("b"), device("c")];
		assert.deepEqual(
			rotation(cycle(["c", "a", "b"]), list).map((d) => d.id),
			["a", "b", "c"],
		);
	});

	it("has nothing to do with one device left and that one already the default", () => {
		const list = [device("a", { isDefault: true, isCommunications: true })];
		assert.equal(planPress(cycle(["a", "b"]), list).kind, "already");
	});

	it("can't act with nothing chosen or nothing connected", () => {
		const list = [device("a", { isDefault: true })];
		assert.equal(planPress(cycle([]), list).kind, "unavailable");
		assert.equal(planPress(cycle(["x", "y"]), list).kind, "unavailable");
	});

	it("measures position by the communications default when that is the role", () => {
		// Music is on "a", calls are on "b". A calls-only key is at "b", so it goes to "a".
		const list = [device("a", { isDefault: true }), device("b", { isCommunications: true })];
		const calls = planPress(cycle(["a", "b"], "communications"), list);
		assert.equal(calls.kind === "switch" && calls.target.id, "a");

		const music = planPress(cycle(["a", "b"], "default"), list);
		assert.equal(music.kind === "switch" && music.target.id, "b");
	});
});

describe("recognising a device", () => {
	it("falls back to the remembered name when the id is gone", () => {
		const list = [device("new-id", { name: "Headphones (HyperX)" })];
		assert.equal(findDevice("old-id", { "old-id": "Headphones (HyperX)" }, list)?.id, "new-id");
	});

	it("refuses to guess between two devices of the same name", () => {
		const list = [device("x", { name: "Speakers (USB)" }), device("y", { name: "Speakers (USB)" })];
		assert.equal(findDevice("old-id", { "old-id": "Speakers (USB)" }, list), undefined);
	});

	it("prefers the id over a name that now belongs to something else", () => {
		const list = [device("a", { name: "One" }), device("b", { name: "Two" })];
		assert.equal(findDevice("a", { a: "Two" }, list)?.id, "a");
	});
});

describe("the name on the key", () => {
	const mics = [
		device("m1", { flow: "input", description: "Microphone", adapter: "3- HyperX SoloCast" }),
		device("m2", { flow: "input", description: "Microphone", adapter: "Webcam" }),
	];
	const screens = [
		device("s1", { description: "Odyssey G8", adapter: "NVIDIA High Definition Audio" }),
		device("s2", { description: "MSI MAG", adapter: "NVIDIA High Definition Audio" }),
	];

	it("uses the adapter when several devices share a description", () => {
		assert.equal(labelFor(mics[0], settings({}), mics), "HyperX SoloCast");
	});

	it("uses the description when it is the part that differs", () => {
		assert.equal(labelFor(screens[0], settings({}), screens), "Odyssey G8");
	});

	it("does as it's told when a choice is made", () => {
		assert.equal(labelFor(screens[0], settings({ label: "adapter" }), screens), "NVIDIA High Definition Audio");
		assert.equal(labelFor(mics[0], settings({ label: "description" }), mics), "Microphone");
		assert.equal(labelFor(mics[0], settings({ label: "none" }), mics), "");
	});
});

describe("what a key shows", () => {
	it("is lit for the default device and dim for any other", () => {
		const list = [device("a", { isDefault: true, isCommunications: true }), device("b")];
		assert.equal(faceFor(settings({ device: "a" }), list, "output").state, "active");
		assert.equal(faceFor(settings({ device: "b" }), list, "output").state, "inactive");
	});

	it("is lit for the device you hear, even while calls go elsewhere", () => {
		// Speakers as the default, headset for calls: a common resting state.
		const list = [device("speakers", { isDefault: true }), device("headset", { isCommunications: true })];
		const speakers = settings({ device: "speakers" });
		assert.equal(faceFor(speakers, list, "output").state, "active");
		assert.equal(faceFor(settings({ device: "headset" }), list, "output").state, "inactive");
		// A press on the lit key still has something to do: bring calls along.
		assert.equal(planPress(speakers, list).kind, "switch");

		assert.equal(faceFor(settings({ device: "headset", role: "communications" }), list, "output").state, "active");
	});

	it("keeps an unplugged device's name", () => {
		const face = faceFor(settings({ device: "gone", names: { gone: "Headphones (HyperX)" } }), [device("a")], "output");
		assert.equal(face.state, "missing");
		assert.equal(face.title, "Headphones");
	});

	it("puts a custom label in place of the device's name", () => {
		const list = [device("a", { isDefault: true, isCommunications: true })];
		assert.equal(faceFor(settings({ device: "a", customLabel: "Desk" }), list, "output").title, "Desk");
	});

	it("asks for a choice when nothing is chosen", () => {
		assert.equal(faceFor(settings({}), [], "output").state, "empty");
		assert.equal(faceFor(settings({ mode: "cycle" }), [], "output").state, "empty");
	});

	it("names the current device on a cycle key and marks its place", () => {
		const list = [device("a"), device("b", { isDefault: true, isCommunications: true }), device("c")];
		const face = faceFor(settings({ mode: "cycle", devices: ["a", "b", "c"] }), list, "output");
		assert.equal(face.state, "active");
		assert.equal(face.title, "b");
		assert.deepEqual(face.dots, { count: 3, active: 1 });
	});

	it("doesn't claim a default that isn't one of the cycle's own devices", () => {
		const list = [device("a"), device("b"), device("other", { isDefault: true, isCommunications: true })];
		const face = faceFor(settings({ mode: "cycle", devices: ["a", "b"] }), list, "output");
		assert.equal(face.state, "inactive");
		assert.equal(face.title, "other");
		assert.deepEqual(face.dots, { count: 2, active: -1 });
	});
});

describe("remembering device names", () => {
	it("records the names of chosen devices that are present", () => {
		const list = [device("a", { name: "A (One)" }), device("b", { name: "B (Two)" })];
		assert.deepEqual(namesToSave(settings({ device: "a" }), list), { a: "A (One)" });
	});

	it("reports nothing to save when the record is already right", () => {
		const list = [device("a", { name: "A (One)" })];
		assert.equal(namesToSave(settings({ device: "a", names: { a: "A (One)" } }), list), undefined);
	});

	it("keeps the name of a device that has gone away", () => {
		const s = settings({ mode: "cycle", devices: ["a", "gone"], names: { gone: "Old (Thing)", a: "A (One)" } });
		assert.equal(namesToSave(s, [device("a", { name: "A (One)" })]), undefined);
	});

	it("forgets names of devices no longer chosen", () => {
		const s = settings({ device: "a", names: { a: "A (One)", b: "B (Two)" } });
		assert.deepEqual(namesToSave(s, [device("a", { name: "A (One)" })]), { a: "A (One)" });
	});
});

describe("the device picker", () => {
	it("lists connected devices, then a chosen one that isn't", () => {
		const s = settings({ device: "gone", names: { gone: "Headphones (HyperX)" } });
		assert.deepEqual(pickerItems(s, [device("a", { name: "A (One)" })]), [
			{ label: "A (One)", value: "a" },
			{ label: "Headphones (HyperX) (not connected)", value: "gone" },
		]);
	});
});

describe("the picture on the key", () => {
	it("follows the device, and the user's choice beats the guess", () => {
		const list = [device("a", { name: "Headphones (USB)", isDefault: true })];
		assert.equal(faceFor(settings({ device: "a" }), list, "output").kind, "headphones");
		assert.equal(faceFor(settings({ device: "a", icon: "monitor" }), list, "output").kind, "monitor");
	});

	it("shows an unplugged device as it last looked", () => {
		const s = settings({ device: "gone", kinds: { gone: "headset" } });
		assert.equal(faceFor(s, [], "output").kind, "headset");
		assert.equal(faceFor(settings({ device: "gone" }), [], "input").kind, "microphone");
	});

	it("changes with the device on a step-through key", () => {
		const list = [
			device("a", { name: "Speakers (X)" }),
			device("b", { name: "Headphones (Y)", isDefault: true, isCommunications: true }),
		];
		assert.equal(faceFor(settings({ mode: "cycle", devices: ["a", "b"] }), list, "output").kind, "headphones");
	});

	it("remembers each chosen device's picture, and only when it changed", () => {
		const list = [device("a", { name: "Headphones (Y)" })];
		const first = rememberedFor(settings({ device: "a" }), list);
		assert.deepEqual(first?.kinds, { a: "headphones" });
		assert.equal(rememberedFor(settings({ device: "a", names: first?.names, kinds: first?.kinds }), list), undefined);
	});
});
