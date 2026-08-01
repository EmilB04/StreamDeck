import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coalesce } from "../src/providers/coalesce";

/** A fetch that counts its calls and only settles when told to. */
function deferred<T>() {
	let release!: (value: T) => void;
	const promise = new Promise<T>((resolve) => {
		release = resolve;
	});
	return { promise, release };
}

describe("sharing one expensive fetch", () => {
	it("runs the fetch once for callers that overlap", async () => {
		const gate = deferred<string>();
		let calls = 0;
		const shared = coalesce(() => {
			calls += 1;
			return gate.promise;
		}, 60_000);

		// Three keys asking at the same moment is the case this exists for.
		const all = Promise.all([shared(), shared(), shared()]);
		gate.release("devices");

		assert.deepEqual(await all, ["devices", "devices", "devices"]);
		assert.equal(calls, 1);
	});

	it("reuses the answer for as long as the window lasts", async () => {
		let calls = 0;
		const shared = coalesce(async () => ++calls, 60_000);

		assert.equal(await shared(), 1);
		assert.equal(await shared(), 1);
		assert.equal(calls, 1);
	});

	it("fetches again once the window has passed", async () => {
		let calls = 0;
		const shared = coalesce(async () => ++calls, 0);

		assert.equal(await shared(), 1);
		assert.equal(await shared(), 2);
	});

	it("doesn't cache a failure", async () => {
		let calls = 0;
		const shared = coalesce(async () => {
			calls += 1;
			if (calls === 1) throw new Error("powershell missing");
			return "recovered";
		}, 10_000);

		// A provider that fails once must be free to succeed on the next poll,
		// rather than being held down by its own error for the whole window.
		await assert.rejects(shared(), /powershell missing/);
		assert.equal(await shared(), "recovered");
	});
});
