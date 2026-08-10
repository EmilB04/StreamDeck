import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { batteryKeyImage, DEFAULT_COLORS, noticeKeyImage, renameKeyImage, wrapWords } from "../src/ui/battery-svg";
import type { FaceOptions } from "../src/ui/battery-svg";
import type { BatteryStatus } from "../src/providers/types";

/** The rendered SVG, decoded back out of the data URI the key is given. */
function svg(options: Partial<FaceOptions> & { percent: number | null; status: BatteryStatus }): string {
	const face: FaceOptions = {
		kind: "headset",
		name: "Kraken",
		style: "bar",
		showIcon: false,
		showPercent: true,
		showName: true,
		lowThreshold: 20,
		mediumThreshold: 50,
		colors: DEFAULT_COLORS,
		...options,
	};

	const uri = batteryKeyImage(face);
	assert.ok(uri.startsWith("data:image/svg+xml;charset=utf8,"), "Stream Deck ignores a bare <svg> string");
	return decodeURIComponent(uri.slice("data:image/svg+xml;charset=utf8,".length));
}

describe("the key face", () => {
	it("shows the level, in the colour its band calls for", () => {
		assert.match(svg({ percent: 72, status: "ok" }), />72%</);
		assert.ok(svg({ percent: 72, status: "ok" }).includes(DEFAULT_COLORS.high));
		assert.ok(svg({ percent: 35, status: "ok" }).includes(DEFAULT_COLORS.medium));
		assert.ok(svg({ percent: 12, status: "ok" }).includes(DEFAULT_COLORS.low));
	});

	it("marks charging with a bolt in the top-left corner", () => {
		const charging = svg({ percent: 40, status: "charging" });
		assert.match(charging, /M12 6 l-7 12/, "the bolt path, positioned top-left");
		assert.ok(!svg({ percent: 40, status: "ok" }).includes("M12 6 l-7 12"));
	});

	it("fades a last-known reading and marks it as not live", () => {
		const stale = svg({ percent: 62, status: "stale" });
		assert.match(stale, /<g opacity="0\.45">/, "the whole face dims, outline included");
		assert.match(stale, /circle cx="11" cy="11"/, "crossed-out circle on its own disc");
		assert.match(stale, />62%</, "the level is still readable");
	});

	it("draws a plug for a mains device instead of a meter or a number", () => {
		const mains = svg({ percent: null, status: "mains" });
		assert.match(mains, /M-11 -7 h22/, "the plug body");
		assert.ok(!/>—</.test(mains), "a dash would read as a fault");
		assert.ok(!/\d+%/.test(mains), "there is no level to show");
	});

	it("says why a reading is missing", () => {
		assert.match(svg({ percent: null, status: "unsupported" }), />N\/A</);
		assert.match(svg({ percent: null, status: "error" }), />ERR</);
		assert.match(svg({ percent: null, status: "not-found" }), />—</);
	});

	it("marks the lowest-battery face, and frames it once that device is low", () => {
		const healthy = svg({ percent: 62, status: "ok", lowest: true });
		assert.match(healthy, /M11 6 v9\.4/, "the chevron");
		assert.ok(!healthy.includes('rx="7"'), "no frame while nothing is wrong");

		const low = svg({ percent: 12, status: "ok", lowest: true });
		assert.match(low, /rx="7"/, "the whole key becomes the warning");
		assert.ok(low.includes(DEFAULT_COLORS.low));
	});

	it("yields the corner to the bolt while charging — one marker at a time", () => {
		const charging = svg({ percent: 40, status: "charging", lowest: true });
		assert.ok(!charging.includes("M11 6 v9.4"), "the chevron stands down");
		assert.match(charging, /M12 6 l-7 12/);
	});

	it("escapes a name that would otherwise break the document", () => {
		const rendered = svg({ percent: 50, status: "ok", name: 'Bob & "Co" <x>' });
		assert.ok(!rendered.includes("<x>"), "raw markup would make the SVG unparseable");
		assert.match(rendered, /&amp;/);
	});

	it("keeps the number legible when everything is switched on", () => {
		const busy = svg({ percent: 100, status: "ok", showIcon: true, showName: true, style: "ring" });
		// Too tall for the ring's inner circle, so the stack scales rather than spills.
		assert.match(busy, /scale\(0\.\d+\)/);
	});
});

describe("the notice face", () => {
	it("wraps to the words that fit", () => {
		assert.deepEqual(wrapWords(["Device", "is", "Disconnected"], 12), ["Device is", "Disconnected"]);
		assert.deepEqual(wrapWords(["Supercalifragilistic"], 12), ["Supercalifragilistic"], "never split a word");
	});

	it("draws the message and a warning mark", () => {
		const notice = decodeURIComponent(
			noticeKeyImage("Device is Disconnected", DEFAULT_COLORS).replace("data:image/svg+xml;charset=utf8,", ""),
		);

		assert.match(notice, />Device is</);
		assert.match(notice, />Disconnected</);
		assert.match(notice, /M0 -8 L9 8 H-9 Z/, "the warning triangle");
	});
});

describe("the device-renaming key", () => {
	/** The rendered SVG, decoded back out of the data URI. */
	const rename = (renamed: number, detected: number): string =>
		decodeURIComponent(renameKeyImage(renamed, detected, DEFAULT_COLORS));

	it("counts the names in force against the devices detected", () => {
		const markup = rename(3, 11);
		assert.match(markup, />3</);
		assert.match(markup, />of 11</);
	});

	it("picks up the accent colour once something has been renamed", () => {
		// The key is otherwise indistinguishable from one that has done nothing.
		assert.ok(rename(2, 5).includes(DEFAULT_COLORS.high));
		assert.ok(!rename(0, 5).includes(DEFAULT_COLORS.high), "nothing renamed yet, so no accent");
	});

	it("is a data URI, which is what setImage needs", () => {
		// A bare <svg> string is silently ignored and the key keeps its manifest image.
		assert.match(renameKeyImage(0, 0, DEFAULT_COLORS), /^data:image\/svg\+xml;charset=utf8,/);
	});
});
