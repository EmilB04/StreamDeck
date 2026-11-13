import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEVICE_KINDS } from "../src/audio/device-kind";
import type { KeyFace } from "../src/ui/key-svg";
import { escapeXml, keyImage, keySvg, wrapTitle } from "../src/ui/key-svg";

const face = (overrides: Partial<KeyFace> = {}): KeyFace => ({
	kind: "speaker",
	state: "active",
	title: "Speakers",
	showIcon: true,
	...overrides,
});

const texts = (svg: string) => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);

describe("fitting a name on the key", () => {
	it("leaves a short name alone", () => {
		assert.deepEqual(wrapTitle("Speakers", 12, 2), ["Speakers"]);
	});

	it("breaks between words", () => {
		assert.deepEqual(wrapTitle("HyperX Cloud Alpha", 12, 2), ["HyperX Cloud", "Alpha"]);
	});

	it("marks a name it had to cut", () => {
		const lines = wrapTitle("NVIDIA High Definition Audio Device", 12, 2);
		assert.equal(lines.length, 2);
		assert.ok(lines[1].endsWith("…"));
		assert.ok(lines.every((line) => line.length <= 12));
	});

	it("splits a single word wider than the key", () => {
		const lines = wrapTitle("Hodetelefonerutgang", 12, 2);
		assert.deepEqual(lines, ["Hodetelefone", "rutgang"]);
	});

	it("gives no lines for no text", () => {
		assert.deepEqual(wrapTitle("   ", 12, 2), []);
	});
});

describe("drawing a key", () => {
	it("lights the default device and dims the others", () => {
		assert.match(keySvg(face({ state: "active" })), /stroke="#eaeaea"/);
		assert.doesNotMatch(keySvg(face({ state: "inactive" })), /stroke="#eaeaea"/);
	});

	it("strikes through a device that isn't connected, and says so if it has no name", () => {
		const svg = keySvg(face({ state: "missing", title: "" }));
		assert.match(svg, /stroke="#e35d5d"/);
		assert.equal(texts(svg).join(" "), "Not connected");
	});

	it("draws a different glyph for each kind of device", () => {
		const drawn = DEVICE_KINDS.map((kind) => keySvg(face({ kind })).match(/<g .*<\/g>/)?.[0]);
		assert.equal(new Set(drawn).size, DEVICE_KINDS.length);
		assert.ok(drawn.every((g) => g && g.length > 60));
	});

	it("sets a long line smaller instead of splitting a word for one letter", () => {
		const svg = keySvg(face({ title: "Hodetelefoner" }));
		assert.deepEqual(texts(svg), ["Hodetelefoner"]);
		assert.match(svg, /font-size="16"/);
		assert.match(keySvg(face({ title: "Speakers" })), /font-size="20"/);
	});

	it("never leaves a colour for the renderer to work out", () => {
		for (const kind of DEVICE_KINDS) {
			const svg = keySvg(face({ kind }));
			assert.doesNotMatch(svg, /currentColor|COLOR/);
			// Every shape sets its own fill or stroke; a bare one would draw black on black.
			for (const shape of svg.match(/<(path|rect|circle)\b[^>]*>/g) ?? []) {
				if (shape.includes("<rect width=")) continue;
				assert.match(shape, /fill="#|stroke="#/, `${kind}: ${shape}`);
			}
		}
	});

	it("leaves the glyph out when asked", () => {
		assert.doesNotMatch(keySvg(face({ showIcon: false })), /<g /);
	});

	it("draws one dot per device and fills the current one", () => {
		const svg = keySvg(face({ dots: { count: 3, active: 1 } }));
		const dots = [...svg.matchAll(/<circle[^>]*fill="([^"]+)"/g)].map((m) => m[1]);
		assert.equal(dots.length, 3);
		assert.equal(dots[1], "#eaeaea");
		assert.equal(dots.filter((fill) => fill === "#eaeaea").length, 1);
	});

	it("draws no dots for a single device", () => {
		assert.doesNotMatch(keySvg(face({ dots: { count: 1, active: 0 } })), /<circle/);
	});

	it("escapes a device name instead of letting it into the markup", () => {
		const svg = keySvg(face({ title: '<AT&T> "x"' }));
		assert.ok(!svg.includes("<AT&T>"));
		assert.ok(svg.includes(escapeXml("<AT&T>")));
	});

	it("produces an image Stream Deck accepts", () => {
		const image = keyImage(face());
		assert.ok(image.startsWith("data:image/svg+xml;charset=utf8,"));
		assert.equal(decodeURIComponent(image.split(",")[1]), keySvg(face()));
	});
});
