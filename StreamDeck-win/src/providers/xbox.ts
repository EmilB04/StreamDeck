import type { Device as HidDeviceInfo, HID as HidDevice } from "node-hid";
import { hidDevices, loadHid } from "./hid";
import type { BatteryProvider, BatteryReading, DiscoveredDevice } from "./types";
import { slug } from "./types";

const VENDOR_MICROSOFT = 0x045e;

/** HID usage page 0x01 (Generic Desktop), gamepad. */
const USAGE_PAGE_DESKTOP = 0x01;
const USAGE_GAMEPAD = 0x05;

/** Bluetooth HID service UUIDs, which Windows puts in the device path. */
const BLUETOOTH_PATH = /\{0000112[45]-0000-1000-8000-00805f9b34fb\}/i;

/**
 * Battery arrives as its own input report, id 0x04, carrying one byte of flags.
 * This is the layout Linux's xpadneo driver decodes:
 *
 *   bit 7    online
 *   bit 4    charging
 *   bits 3-2 supply kind (internal, AA cells, rechargeable pack)
 *   bits 1-0 capacity: 0 critical, 1 low, 2 medium, 3 full
 *
 * Note what's missing: a percentage. The pad reports four steps, so the numbers
 * below are the middle of each step rather than a reading — a key showing "70%"
 * for an Xbox pad means "medium", and it will sit there until the step changes.
 */
const REPORT_BATTERY = 0x04;
const ONLINE = 0x80;
const CHARGING = 0x10;
const CAPACITY = 0x03;

const CAPACITY_STEPS = [
	{ percent: 10, word: "Critical" },
	{ percent: 35, word: "Low" },
	{ percent: 70, word: "Medium" },
	{ percent: 100, word: "Full" },
];

/**
 * The pad sends this report when the level changes, not on a schedule, so a
 * quiet controller may not send one while we're listening. Kept short on
 * purpose: discovery runs while the property inspector waits.
 */
const READ_TIMEOUT_MS = 200;
const READ_ATTEMPTS = 2;

/**
 * Xbox Wireless Controllers paired over Bluetooth.
 *
 * No model list: any Microsoft gamepad on a Bluetooth path is tried, so an Xbox
 * One S pad and a Series X|S pad both work through the same code, as should
 * whatever ships next.
 *
 * Only Bluetooth. Connected through the Xbox Wireless dongle or a USB cable,
 * the controller speaks GIP rather than HID, and its battery isn't in a report
 * this can read — see "Xbox controllers" in the README.
 *
 * Unverified against hardware: written from xpadneo's decoding rather than from
 * a pad on the bench. `scripts/xbox-probe.mjs` prints what a real one sends.
 */
export class XboxProvider implements BatteryProvider {
	readonly id = "xbox";

	async discover(): Promise<DiscoveredDevice[]> {
		const devices = await hidDevices(VENDOR_MICROSOFT);
		if (!devices) return [];

		const found: DiscoveredDevice[] = [];

		for (const info of devices) {
			if (!isXboxPad(info)) continue;

			const label = (info.product ?? "").trim() || "Xbox Wireless Controller";
			const reading = await this.readFrom(info, label);

			found.push({
				key: `xbox:${slug(info.serialNumber || info.path || label)}`,
				providerId: this.id,
				label,
				kind: "gamepad",
				supportsBattery: reading.percent !== null,
				locator: { serialNumber: info.serialNumber ?? "", path: info.path ?? "" },
				reading,
			});
		}

		return found;
	}

	async read(device: DiscoveredDevice): Promise<BatteryReading> {
		const devices = await hidDevices(VENDOR_MICROSOFT);
		const serialNumber = String(device.locator.serialNumber ?? "");
		const pads = devices?.filter(isXboxPad) ?? [];
		const info = pads.find((d) => serialNumber !== "" && d.serialNumber === serialNumber) ?? pads[0];

		if (!info) {
			return { deviceLabel: device.label, percent: null, status: "not-found", detail: "Controller not connected" };
		}
		return this.readFrom(info, device.label);
	}

	private async readFrom(info: HidDeviceInfo, label: string): Promise<BatteryReading> {
		const HID = await loadHid();
		if (!HID) return { deviceLabel: label, percent: null, status: "error", detail: "node-hid unavailable" };

		let device: HidDevice | undefined;

		try {
			device = new HID.HID(info.path!);

			// Ask outright first: it costs nothing and doesn't depend on the pad
			// happening to send an update while we listen.
			try {
				const feature = device.getFeatureReport(REPORT_BATTERY, 2);
				if (feature?.length >= 2) return decodeBattery(feature[1], label);
			} catch {
				// Not every firmware answers a feature read for this report.
			}

			for (let attempt = 0; attempt < READ_ATTEMPTS; attempt++) {
				const report = device.readTimeout(READ_TIMEOUT_MS);
				if (report?.length && report[0] === REPORT_BATTERY && report.length >= 2) {
					return decodeBattery(report[1], label);
				}
			}

			return {
				deviceLabel: label,
				percent: null,
				status: "unsupported",
				detail: "Connected, but it didn't send a battery report",
			};
		} catch {
			return { deviceLabel: label, percent: null, status: "error", detail: "Controller couldn't be opened" };
		} finally {
			try {
				device?.close();
			} catch {
				/* already closed */
			}
		}
	}
}

/** A Microsoft gamepad on a Bluetooth path — no model list involved. */
export function isXboxPad(info: HidDeviceInfo): boolean {
	return (
		info.path !== undefined &&
		info.vendorId === VENDOR_MICROSOFT &&
		info.usagePage === USAGE_PAGE_DESKTOP &&
		info.usage === USAGE_GAMEPAD &&
		BLUETOOTH_PATH.test(info.path)
	);
}

function decodeBattery(flags: number, label: string): BatteryReading {
	if ((flags & ONLINE) === 0) {
		return { deviceLabel: label, percent: null, status: "not-found", detail: "Controller is offline" };
	}

	const step = CAPACITY_STEPS[flags & CAPACITY];
	return {
		deviceLabel: label,
		percent: step.percent,
		status: (flags & CHARGING) !== 0 ? "charging" : "ok",
		detail: `${step.word} — the pad reports four steps, not a percentage`,
	};
}
