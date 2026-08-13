import assert from "node:assert/strict";
import type { Device as HidDeviceInfo } from "node-hid";
import { describe, it } from "node:test";
import { selectEndpoints } from "../src/providers/logitech";

/**
 * Windows paths for two collections of the same interface differ only in the
 * collection index and the trailing instance number, which is what groups them.
 */
const path = (device: string, collection: number): string =>
	`\\\\?\\HID#VID_046D&PID_C547&MI_02&Col0${collection}#9&${device}&0&0000#{4d1e55b2-f16f-11cf-88cb-001111000030}`;

const iface = (over: Partial<HidDeviceInfo> & { path: string }): HidDeviceInfo =>
	({ vendorId: 0x046d, productId: 0xc547, usagePage: 0xff00, usage: 0x01, ...over }) as HidDeviceInfo;

const keys = (endpoints: { productId: number }[]): number[] => endpoints.map((e) => e.productId);

describe("picking which Logitech interfaces to speak HID++ to", () => {
	it("pairs the short and long collections of one endpoint", () => {
		const endpoints = selectEndpoints([
			iface({ path: path("1b0e509f", 1), usage: 0x01 }),
			iface({ path: path("1b0e509f", 2), usage: 0x02 }),
		]);

		assert.equal(endpoints.length, 1);
		assert.ok(endpoints[0].short, "short collection kept");
		assert.ok(endpoints[0].long, "long collection kept");
	});

	it("probes a vendor page other than 0xff00", () => {
		// HID++ is a vendor protocol and the page is the vendor's choice; several
		// Logitech G devices don't use the receiver's 0xff00. Pinning that page
		// meant those devices were never spoken to at all.
		const endpoints = selectEndpoints([
			iface({ path: path("aaaa1111", 1), productId: 0x0aba, usagePage: 0xff43, usage: 0x01 }),
			iface({ path: path("aaaa1111", 2), productId: 0x0aba, usagePage: 0xff43, usage: 0x02 }),
		]);

		assert.deepEqual(keys(endpoints), [0x0aba]);
	});

	it("doesn't let one device's collections disqualify another's", () => {
		// The regression: the long-collection requirement was judged across the
		// whole machine, so a receiver that split its collections knocked out every
		// endpoint that hadn't — a mouse's receiver could hide a headset.
		const endpoints = selectEndpoints([
			iface({ path: path("1b0e509f", 1), usage: 0x01 }),
			iface({ path: path("1b0e509f", 2), usage: 0x02 }),
			iface({ path: path("cccc3333", 1), productId: 0x0af7, usagePage: 0xff43, usage: undefined }),
		]);

		assert.deepEqual(keys(endpoints).sort(), [0x0af7, 0xc547]);
	});

	it("drops a vendor interface that declares a short collection and no long one", () => {
		// Not HID++: probing it costs a full timeout for each of the seven device
		// indices and can only ever come back empty.
		const endpoints = selectEndpoints([iface({ path: path("dddd4444", 1), productId: 0x085e, usage: 0x01 })]);

		assert.deepEqual(endpoints, []);
	});

	it("falls back to unlabelled interfaces when nothing reports a usage page", () => {
		// Some platforms/drivers don't fill usagePage in at all.
		const endpoints = selectEndpoints([
			iface({ path: path("eeee5555", 1), productId: 0xc52b, usagePage: undefined, usage: undefined }),
		]);

		assert.deepEqual(keys(endpoints), [0xc52b]);
	});

	it("ignores interfaces with no path — there is nothing to open", () => {
		assert.deepEqual(selectEndpoints([{ vendorId: 0x046d, productId: 0xc547 } as HidDeviceInfo]), []);
	});
});
