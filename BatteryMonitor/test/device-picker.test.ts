import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groupedDevices } from "../src/actions/battery-status";
import type { UiGroup } from "../src/actions/ui-messages";
import type { BatteryStatus, DiscoveredDevice } from "../src/providers/types";

const device = (label: string, supportsBattery: boolean, status?: BatteryStatus): DiscoveredDevice => ({
	key: `k:${label}`,
	providerId: "test",
	label,
	kind: "other",
	supportsBattery,
	locator: {},
	reading: status ? { deviceLabel: label, percent: null, status } : undefined,
});

const groups = (entries: ReturnType<typeof groupedDevices>): [string, string[]][] =>
	entries.map((e) => [e.label, (e as UiGroup).children.map((c) => c.label)]);

describe("grouping the device picker", () => {
	it("files each device under the heading for what it can report", () => {
		const entries = groupedDevices([
			device("G502 X PLUS", true),
			device("HyperX SoloCast", false, "mains"),
			device("Emils Nest Hub", false, "unsupported"),
		]);

		assert.deepEqual(groups(entries), [
			["Battery", ["G502 X PLUS"]],
			["Mains powered", ["HyperX SoloCast"]],
			["No battery data", ["Emils Nest Hub"]],
		]);
	});

	it("leaves out a heading with nothing under it", () => {
		// An optgroup with no options still draws its heading, so an empty tier
		// would put a divider over the group below it.
		const entries = groupedDevices([device("G502 X PLUS", true), device("Nest Hub", false, "unsupported")]);

		assert.deepEqual(
			entries.map((e) => e.label),
			["Battery", "No battery data"],
		);
	});

	it("drops the suffix the heading now carries", () => {
		// The entry used to read "HyperX SoloCast (mains powered)"; saying it once
		// per group beats repeating it on every line.
		const [mains] = groupedDevices([device("HyperX SoloCast", false, "mains")]) as UiGroup[];

		assert.deepEqual(mains.children, [{ label: "HyperX SoloCast", value: "k:HyperX SoloCast" }]);
	});

	it("keeps the key as the value, so a selection still resolves", () => {
		const [battery] = groupedDevices([device("G502 X PLUS", true)]) as UiGroup[];
		assert.equal(battery.children[0].value, "k:G502 X PLUS");
	});

	it("returns nothing at all when no device was detected", () => {
		assert.deepEqual(groupedDevices([]), []);
	});
});

describe("labelling devices whose protocol has never met the hardware", () => {
	const untested = (label: string): DiscoveredDevice => ({ ...device(label, true), unverified: true });

	it("says so in the picker, so a wrong level becomes a bug report", () => {
		const [battery] = groupedDevices([untested("Razer Basilisk V3 Pro")]) as UiGroup[];
		assert.deepEqual(
			battery.children.map((c) => c.label),
			["Razer Basilisk V3 Pro (untested — please report)"],
		);
	});

	it("leaves verified devices alone", () => {
		const [battery] = groupedDevices([device("G502 X PLUS", true)]) as UiGroup[];
		assert.deepEqual(
			battery.children.map((c) => c.label),
			["G502 X PLUS"],
		);
	});

	it("keeps the key untouched, so the marking can't change what a key points at", () => {
		const [battery] = groupedDevices([untested("Xbox Wireless Controller")]) as UiGroup[];
		assert.equal(battery.children[0].value, "k:Xbox Wireless Controller");
	});
});
