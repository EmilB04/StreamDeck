import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DeviceStore, parseReply } from "../src/audio/devices";
import type { AudioHost } from "../src/audio/host";

const ONE = {
	id: "{0.0.0.00000000}.{aaa}",
	flow: "output",
	name: "Speakers (Realtek)",
	description: "Speakers",
	adapter: "Realtek",
	formFactor: 1,
	isDefault: true,
	isCommunications: false,
};
const reply = (devices: unknown[]) => JSON.stringify({ ok: true, devices });

/** A host that answers from a script and records what it was asked. */
function fakeHost(answers: string[], available = true) {
	const asked: string[] = [];
	const host = {
		available,
		request: async (line: string) => {
			asked.push(line);
			const next = answers.shift();
			if (next === undefined) throw new Error("no answer scripted");
			return next;
		},
	} as unknown as AudioHost;
	return { host, asked };
}

describe("reading the host's reply", () => {
	it("accepts a well-formed device", () => {
		assert.deepEqual(parseReply(reply([ONE])), [ONE]);
	});

	it("throws on anything that isn't the expected shape", () => {
		assert.throws(() => parseReply("not json"), /isn't JSON/);
		assert.throws(() => parseReply("null"), /empty reply/);
		assert.throws(() => parseReply('{"ok":true}'), /no device list/);
		assert.throws(() => parseReply('{"ok":true,"devices":{}}'), /no device list/);
	});

	it("passes on the host's own error message", () => {
		assert.throws(() => parseReply('{"ok":false,"error":"SetDefaultEndpoint failed"}'), /SetDefaultEndpoint failed/);
	});

	it("drops devices it couldn't key on, and keeps the rest", () => {
		const list = parseReply(reply([{ ...ONE, id: "" }, { ...ONE, flow: "sideways" }, null, "x", ONE]));
		assert.deepEqual(list, [ONE]);
	});

	it("keeps a form factor that is a whole number and drops anything else", () => {
		assert.equal(parseReply(reply([{ ...ONE, formFactor: 3 }]))[0].formFactor, 3);
		assert.equal(parseReply(reply([{ ...ONE, formFactor: "3" }]))[0].formFactor, -1);
		assert.equal(parseReply(reply([{ ...ONE, formFactor: 2.5 }]))[0].formFactor, -1);
		const { formFactor: _, ...bare } = ONE;
		assert.equal(parseReply(reply([bare]))[0].formFactor, -1);
	});

	it("only believes a flag that is really true", () => {
		const [d] = parseReply(reply([{ ...ONE, isDefault: "true", isCommunications: 1 }]));
		assert.equal(d.isDefault, false);
		assert.equal(d.isCommunications, false);
	});

	it("gives a nameless device a name", () => {
		const [d] = parseReply(reply([{ id: "x", flow: "input" }]));
		assert.equal(d.name, "Audio device");
		const [e] = parseReply(reply([{ id: "x", flow: "input", adapter: "Webcam" }]));
		assert.equal(e.name, "Webcam");
	});
});

describe("the device store", () => {
	it("tells listeners about the first read and about changes, and not about repeats", async () => {
		const { host } = fakeHost([reply([ONE]), reply([ONE]), reply([{ ...ONE, isDefault: false }])]);
		const store = new DeviceStore(host);
		let changes = 0;
		store.onChange(() => changes++);

		assert.equal(store.isLoaded(), false);
		await store.refresh();
		assert.equal(store.isLoaded(), true);
		assert.equal(changes, 1);

		await store.refresh();
		assert.equal(changes, 1);

		await store.refresh();
		assert.equal(changes, 2);
		assert.equal(store.list()[0].isDefault, false);
	});

	it("counts an empty first read as a read", async () => {
		const { host } = fakeHost([reply([])]);
		const store = new DeviceStore(host);
		let changes = 0;
		store.onChange(() => changes++);
		await store.refresh();
		assert.equal(changes, 1);
	});

	it("adopts the list a switch hands back", async () => {
		const { host, asked } = fakeHost([reply([ONE])]);
		const store = new DeviceStore(host);
		await store.setDefault(ONE.id, "communications");
		assert.deepEqual(asked, [`set communications ${ONE.id}`]);
		assert.equal(store.list().length, 1);
	});

	it("won't send an id or role that could be read as another request", async () => {
		const { host, asked } = fakeHost([]);
		const store = new DeviceStore(host);
		await assert.rejects(store.setDefault("a b", "both"), /valid device id/);
		await assert.rejects(store.setDefault("a\nlist", "both"), /valid device id/);
		await assert.rejects(store.setDefault("", "both"), /valid device id/);
		await assert.rejects(store.setDefault("a", "all" as never), /unknown role/);
		assert.deepEqual(asked, []);
	});

	it("reports no devices, without asking, where there is no host", async () => {
		const { host, asked } = fakeHost([], false);
		const store = new DeviceStore(host);
		assert.deepEqual(await store.refresh(), []);
		await assert.rejects(store.setDefault("a", "both"), /needs Windows/);
		assert.deepEqual(asked, []);
	});

	it("keeps the old list when a read fails", async () => {
		const { host } = fakeHost([reply([ONE]), "garbage"]);
		const store = new DeviceStore(host);
		await store.refresh();
		await assert.rejects(store.refresh());
		assert.deepEqual(store.list(), [ONE]);
	});

	it("polls while watched and stops with the last watcher", async () => {
		const answers = Array.from({ length: 50 }, () => reply([ONE]));
		const { host, asked } = fakeHost(answers);
		const store = new DeviceStore(host, 5);

		const first = store.watch();
		const second = store.watch();
		await new Promise((r) => setTimeout(r, 40));
		assert.ok(asked.length >= 2, "should have polled");

		first();
		first(); // releasing twice must not count twice
		const midway = asked.length;
		await new Promise((r) => setTimeout(r, 30));
		assert.ok(asked.length > midway, "one watcher left, still polling");

		second();
		const stopped = asked.length;
		await new Promise((r) => setTimeout(r, 30));
		assert.equal(asked.length, stopped);
	});
});
