import type { Device as HidDeviceInfo, HID as HidDevice } from "node-hid";
import { hidDevices, loadHid } from "./hid";
import type { BatteryProvider, BatteryReading, DiscoveredDevice } from "./types";
import { hex4, slug } from "./types";

const VENDOR_SONY = 0x054c;

/** PlayStation 5 controllers. Both speak the same input report. */
const PRODUCTS = new Map([
	[0x0ce6, "DualSense Wireless Controller"],
	[0x0df2, "DualSense Edge Wireless Controller"],
]);

/**
 * Input report ids. Over USB the pad sends 0x01 with the full state; over
 * Bluetooth it starts in a compatibility mode that reuses id 0x01 for a short
 * report with no battery in it, and only sends the full state as id 0x31.
 */
const REPORT_USB = 0x01;
const REPORT_BT = 0x31;

/**
 * Offset of the status byte. The report body is identical on both transports;
 * the Bluetooth one just carries an extra header byte before it.
 *
 *   31 41 7e 85 7d 80 00 00 01 08 ... 08 ...
 *   |  |  |                           |
 *   |  |  +-- sticks (LX LY RX RY)    +-- [54] status: 0x08 = level 8, discharging
 *   |  +----- sequence / flags
 *   +-------- report id
 */
const STATUS_INDEX_USB = 53;
const STATUS_INDEX_BT = 54;

/**
 * Calibration data. Reading it is what makes a Bluetooth pad switch to the full
 * 0x31 report — the same thing any game does when it takes over the controller.
 * It is a GET_FEATURE, so nothing is written to the device.
 */
const FEATURE_CALIBRATION = 0x05;
const FEATURE_CALIBRATION_LENGTH = 41;

/** Reports stream continuously once the pad is in full mode, so this is generous. */
const READ_TIMEOUT_MS = 120;
const READ_ATTEMPTS = 8;

/** Bluetooth HID service UUIDs, which Windows puts in the device path. */
const BLUETOOTH_PATH = /\{0000112[45]-0000-1000-8000-00805f9b34fb\}/i;

/** Charge state, from the status byte's high nibble. */
const CHARGING = 0x1;
const CHARGE_COMPLETE = 0x2;
const TEMPERATURE_ERROR = new Set([0xa, 0xb]);
const CHARGING_ERROR = 0xf;

/**
 * PlayStation 5 controllers, read straight from the pad's own input report.
 *
 * They need their own provider because neither of the OS-level routes works: a
 * DualSense pairs as Bluetooth Classic rather than LE, so Windows has no GATT
 * battery service to mirror into the PnP battery property the Bluetooth provider
 * reads, and over USB it's a plain HID gamepad with no battery usage.
 *
 * The layout below matches Linux's hid-playstation driver and was verified on a
 * DualSense over Bluetooth (status 0x08 = 85%, discharging).
 */
export class DualSenseProvider implements BatteryProvider {
	readonly id = "dualsense";

	async discover(): Promise<DiscoveredDevice[]> {
		const devices = await hidDevices(VENDOR_SONY);
		if (!devices) return [];

		const found: DiscoveredDevice[] = [];

		for (const info of devices) {
			if (!info.path || !PRODUCTS.has(info.productId)) continue;

			const label = (info.product ?? "").trim() || PRODUCTS.get(info.productId)!;
			const device: DiscoveredDevice = {
				// The serial number is the pad's MAC address over Bluetooth, so it
				// survives a reconnect and a reboot. USB doesn't always report one.
				key: `dualsense:${hex4(info.productId)}:${slug(info.serialNumber || info.path)}`,
				providerId: this.id,
				label,
				kind: "gamepad",
				supportsBattery: true,
				locator: { productId: info.productId, serialNumber: info.serialNumber ?? "" },
			};

			device.reading = await this.readFrom(info, label);
			found.push(device);
		}

		return found;
	}

	async read(device: DiscoveredDevice): Promise<BatteryReading> {
		const info = await this.locate(device);
		if (!info) {
			return {
				deviceLabel: device.label,
				percent: null,
				status: "not-found",
				detail: "Controller not connected",
			};
		}
		return this.readFrom(info, device.label);
	}

	/** Finds the pad again by serial, falling back to the product id. */
	private async locate(device: DiscoveredDevice): Promise<HidDeviceInfo | undefined> {
		const devices = await hidDevices(VENDOR_SONY);
		if (!devices) return undefined;

		const productId = Number(device.locator.productId);
		const serialNumber = String(device.locator.serialNumber ?? "");
		const candidates = devices.filter((d) => d.path && d.productId === productId);

		return candidates.find((d) => serialNumber !== "" && d.serialNumber === serialNumber) ?? candidates[0];
	}

	private async readFrom(info: HidDeviceInfo, label: string): Promise<BatteryReading> {
		const status = await this.readStatusByte(info);
		if (status === null) {
			return {
				deviceLabel: label,
				percent: null,
				status: "error",
				detail: "Controller didn't send a full input report",
			};
		}
		return decodeStatus(status, label);
	}

	/**
	 * Opens the pad, waits for a report that actually carries the battery, and
	 * returns its status byte.
	 */
	private async readStatusByte(info: HidDeviceInfo): Promise<number | null> {
		const HID = await loadHid();
		if (!HID) return null;

		const overBluetooth = BLUETOOTH_PATH.test(info.path ?? "");
		let device: HidDevice | undefined;

		try {
			device = new HID.HID(info.path!);

			let askedForFullReports = false;

			for (let attempt = 0; attempt < READ_ATTEMPTS; attempt++) {
				const report = device.readTimeout(READ_TIMEOUT_MS);
				if (!report?.length) continue;

				const bytes = Array.from(report);
				const index = statusIndexOf(bytes, overBluetooth);
				if (index !== null && bytes.length > index) return bytes[index];

				// A Bluetooth pad in compatibility mode pads its short report out to
				// the full length, so length alone can't tell them apart — the report
				// id can. Ask for the calibration data once; that flips it to 0x31.
				if (overBluetooth && !askedForFullReports) {
					askedForFullReports = true;
					try {
						device.getFeatureReport(FEATURE_CALIBRATION, FEATURE_CALIBRATION_LENGTH);
					} catch {
						// Some stacks refuse feature reads; the next attempts still stand
						// a chance if something else already switched the pad over.
					}
				}
			}

			return null;
		} catch {
			// Busy, disconnected mid-read, or no permission for this interface.
			return null;
		} finally {
			try {
				device?.close();
			} catch {
				/* already closed */
			}
		}
	}
}

/** Which byte holds the status, or null when this report doesn't carry one. */
function statusIndexOf(bytes: number[], overBluetooth: boolean): number | null {
	if (overBluetooth) return bytes[0] === REPORT_BT ? STATUS_INDEX_BT : null;
	return bytes[0] === REPORT_USB ? STATUS_INDEX_USB : null;
}

/**
 * Low nibble is the level in units of 10%, high nibble is the charge state.
 * Sony reports the level in 11 steps (0-10), which the +5 centres on the middle
 * of each step rather than its floor.
 */
function decodeStatus(status: number, label: string): BatteryReading {
	const level = status & 0x0f;
	const state = (status >> 4) & 0x0f;
	const percent = Math.min(level * 10 + 5, 100);

	// Both charge states mean the cable is attached, so both show the charging
	// indicator — the same call logitech.ts makes for its "charge complete".
	// Sony reports "complete" well before the gauge reads full (0x28 = complete
	// at level 8), so the pad's own level is kept rather than rounded up to 100.
	// A level of 0 alongside "complete" is the one case that can't be meant
	// literally.
	if (state === CHARGE_COMPLETE) {
		return {
			deviceLabel: label,
			percent: level === 0 ? 100 : percent,
			status: "charging",
			detail: "Charge complete",
		};
	}
	if (state === CHARGING) {
		return { deviceLabel: label, percent, status: "charging" };
	}
	if (TEMPERATURE_ERROR.has(state)) {
		return { deviceLabel: label, percent, status: "error", detail: "Battery temperature out of range" };
	}
	if (state === CHARGING_ERROR) {
		return { deviceLabel: label, percent, status: "error", detail: "Controller reported a charging error" };
	}

	return { deviceLabel: label, percent, status: "ok" };
}
