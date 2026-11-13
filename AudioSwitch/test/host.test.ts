import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { describe, it } from "node:test";
import { AudioHost } from "../src/audio/host";
import type { HostProcess } from "../src/audio/host";
import { encodedCommand, HOST_SCRIPT } from "../src/audio/host-script";

/** Stands in for PowerShell: records what it's sent and says what the test tells it to. */
class FakeChild extends EventEmitter {
	readonly stdout = new EventEmitter();
	readonly written: string[] = [];
	killed = false;
	/** Called for each request line; the default echoes it. */
	respond: (line: string) => void = (line) => this.say(`reply:${line}`);

	readonly stdin = {
		write: (chunk: string) => {
			this.written.push(chunk);
			this.respond(chunk.trim());
		},
	};

	say(text: string, newline = true): void {
		this.stdout.emit("data", Buffer.from(newline ? `${text}\r\n` : text));
	}

	kill(): void {
		this.killed = true;
	}
}

function harness(options: { ready?: boolean; timeouts?: { start: number; request: number } } = {}) {
	const children: FakeChild[] = [];
	const host = new AudioHost(
		() => {
			const child = new FakeChild();
			children.push(child);
			if (options.ready !== false) setImmediate(() => child.say('{"ready":true}'));
			return child as unknown as HostProcess;
		},
		options.timeouts ?? { start: 200, request: 200 },
		true,
	);
	return { host, children };
}

describe("talking to the audio host", () => {
	it("starts the host on the first request and reuses it", async () => {
		const { host, children } = harness();
		assert.equal(children.length, 0);

		assert.equal(await host.request("list"), "reply:list");
		assert.equal(await host.request("list"), "reply:list");
		assert.equal(children.length, 1);
		assert.deepEqual(children[0].written, ["list\n", "list\n"]);
	});

	it("answers overlapping requests in order, one at a time", async () => {
		const { host, children } = harness();
		const outstanding: number[] = [];
		let pending = 0;

		await host.request("warm-up");
		children[0].respond = (line) => {
			pending += 1;
			outstanding.push(pending);
			// Answer late, so a second request would overlap if it were allowed to.
			setTimeout(() => {
				pending -= 1;
				children[0].say(`reply:${line}`);
			}, 5);
		};

		const replies = await Promise.all([host.request("a"), host.request("b"), host.request("c")]);
		assert.deepEqual(replies, ["reply:a", "reply:b", "reply:c"]);
		assert.deepEqual(outstanding, [1, 1, 1]);
	});

	it("puts a reply back together when it arrives in pieces", async () => {
		const { host, children } = harness();
		await host.request("warm-up");
		children[0].respond = () => {
			children[0].say('{"ok":true,', false);
			setImmediate(() => children[0].say('"devices":[]}'));
		};
		assert.equal(await host.request("list"), '{"ok":true,"devices":[]}');
	});

	it("replaces a host that stops answering", async () => {
		const { host, children } = harness({ timeouts: { start: 200, request: 20 } });
		await host.request("warm-up");
		children[0].respond = () => {};

		await assert.rejects(host.request("list"), /no reply to "list"/);
		assert.equal(children[0].killed, true);

		// The queue survives the failure, and the next request gets a fresh host.
		assert.equal(await host.request("list"), "reply:list");
		assert.equal(children.length, 2);
	});

	it("fails the pending request when the host dies, then starts another", async () => {
		const { host, children } = harness();
		await host.request("warm-up");
		children[0].respond = () => children[0].emit("exit", 1);

		await assert.rejects(host.request("list"), /exited with code 1/);
		assert.equal(await host.request("list"), "reply:list");
		assert.equal(children.length, 2);
	});

	it("reports a host that never becomes ready", async () => {
		const { host, children } = harness({ ready: false, timeouts: { start: 20, request: 20 } });
		await assert.rejects(host.request("list"), /did not start/);
		assert.equal(children[0].killed, true);
	});

	it("reports a host that fails to compile", async () => {
		const { host, children } = harness({ ready: false });
		const pending = host.request("list");
		setImmediate(() => children[0].say('{"fatal":"compile error"}'));
		await assert.rejects(pending, /failed to start.*compile error/);
	});

	it("reports PowerShell being absent", async () => {
		const { host, children } = harness({ ready: false });
		const pending = host.request("list");
		setImmediate(() => children[0].emit("error", new Error("spawn powershell.exe ENOENT")));
		await assert.rejects(pending, /ENOENT/);
	});

	it("can be stopped and started again", async () => {
		const { host, children } = harness();
		await host.request("list");
		host.dispose();
		assert.equal(children[0].killed, true);
		assert.equal(await host.request("list"), "reply:list");
		assert.equal(children.length, 2);
	});
});

describe("the host script", () => {
	it("fits on a Windows command line", () => {
		// CreateProcess caps the whole command line at 32,767 characters, and the
		// script is most of it. Left unchecked, growing the C# past the limit
		// would show up as a host that never starts, on Windows only.
		assert.ok(encodedCommand().length < 30_000, `encoded script is ${encodedCommand().length} characters`);
	});

	it("survives the encoding PowerShell expects", () => {
		assert.equal(Buffer.from(encodedCommand(), "base64").toString("utf16le"), HOST_SCRIPT);
	});

	it("closes the here-string at the start of a line, where PowerShell requires it", () => {
		assert.match(HOST_SCRIPT, /\n'@\n/);
		// A line starting with '@ inside the C# would end the here-string early.
		assert.equal(HOST_SCRIPT.match(/^'@/gm)?.length, 1);
	});
});
