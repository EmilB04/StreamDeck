import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cacheGlobal, pendingAppearance } from "../src/actions/appearance";

describe("sharing a look across keys", () => {
	it("offers a new share to a key that hasn't taken it", () => {
		cacheGlobal({ appearance: { style: "ring" }, appearanceRev: 2 });
		assert.deepEqual(pendingAppearance({ appearanceRev: 1 }), { appearance: { style: "ring" }, rev: 2 });
		assert.deepEqual(pendingAppearance({}), { appearance: { style: "ring" }, rev: 2 });
	});

	it("leaves a key alone once it has, so later changes to it survive", () => {
		// Every read of global settings used to push the shared look again,
		// undoing whatever had been set on one key since.
		cacheGlobal({ appearance: { style: "ring" }, appearanceRev: 2 });
		assert.equal(pendingAppearance({ appearanceRev: 2, style: "bar" }), undefined);
	});

	it("doesn't push a look shared before revisions existed onto existing keys", () => {
		cacheGlobal({ appearance: { style: "ring" } });
		assert.equal(pendingAppearance({}), undefined);
	});

	it("has nothing to offer when nothing was shared", () => {
		cacheGlobal({ renames: { a: "b" } });
		assert.equal(pendingAppearance({}), undefined);
	});
});
