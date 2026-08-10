import type { Device as HidDeviceInfo } from "node-hid";
import { hidDevices, withHidDevice } from "./hid";
import { log } from "./log";
import type { BatteryProvider, BatteryReading, DeviceKind, DiscoveredDevice } from "./types";
import { clampPercent, hex4, notFound } from "./types";

const VENDOR_RAZER = 0x1532;

/**
 * Razer's control protocol, as documented by OpenRazer
 * (https://github.com/openrazer/openrazer). One 90-byte struct covers every
 * device and every command:
 *
 *   [0]      status          (response only: 0x02 = ok)
 *   [1]      transaction id
 *   [2..3]   remaining packets
 *   [4]      protocol type
 *   [5]      data size
 *   [6]      command class    0x07 is power
 *   [7]      command id       0x80 battery level, 0x84 charging
 *   [8..87]  arguments
 *   [88]     checksum         XOR of [2..87]
 *   [89]     reserved
 *
 * It travels as HID feature report 0x00, so node-hid's buffers carry the report
 * id in front and every struct offset shifts by one.
 */
const REPORT_LENGTH = 90;
const REPORT_ID = 0x00;

const CLASS_POWER = 0x07;
const CMD_BATTERY = 0x80;
const CMD_CHARGING = 0x84;

const STATUS_OK = 0x02;

/**
 * The transaction id is per-device and there's no way to ask for it, so the
 * documented values are tried in turn and the one that answers is remembered.
 * 0x1f covers most wireless mice, 0x3f the keyboards and headsets.
 */
const TRANSACTION_IDS = [0x1f, 0x3f, 0x08, 0x09, 0x00];

/** The device answers its own feature report; it needs a moment to prepare it. */
const REPLY_DELAY_MS = 60;

/** HID usage page 0x01 (Generic Desktop) usages that identify a form factor. */
const USAGE_MOUSE = 0x02;
const USAGE_KEYBOARD = 0x06;

/**
 * Razer peripherals — wireless mice, keyboards and headsets.
 *
 * Nothing is hard-coded per model: any Razer device that answers the power
 * command reports its level, so a Viper, a BlackWidow or a Basilisk all work
 * through the same path, and a model released tomorrow needs no change here.
 *
 * Unverified against hardware — this was written from OpenRazer's protocol
 * rather than from a device on the bench (see scripts/razer-probe.mjs, which
 * prints what a real one answers).
 */
export class RazerProvider implements BatteryProvider {
	readonly id = "razer";

	async discover(): Promise<DiscoveredDevice[]> {
		const devices = await hidDevices(VENDOR_RAZER);
		if (!devices) return [];

		// One device exposes several interfaces; only some accept the control
		// protocol, so each product is tried once and its working interface kept.
		const byProduct = new Map<number, HidDeviceInfo[]>();
		for (const info of devices) {
			if (!info.path) continue;
			const list = byProduct.get(info.productId) ?? [];
			list.push(info);
			byProduct.set(info.productId, list);
		}

		const found: DiscoveredDevice[] = [];

		for (const [productId, interfaces] of byProduct) {
			const label = (interfaces.find((i) => i.product)?.product ?? "").trim() || `Razer device ${hex4(productId)}`;
			const answer = await this.findChannel(interfaces);

			const device: DiscoveredDevice = {
				key: `razer:${hex4(productId)}`,
				providerId: this.id,
				label,
				kind: kindOf(interfaces, label),
				supportsBattery: answer !== undefined,
				locator: { productId, transactionId: answer?.transactionId ?? -1 },
			};

			device.reading = answer
				? answer.reading
				: // Silent rather than batteryless — the device may simply be asleep,
					// so this reads as absent and lets the poll back off.
					notFound(label, "Detected, but it didn't answer the Razer power command");

			found.push(device);
		}

		return found;
	}

	async read(device: DiscoveredDevice): Promise<BatteryReading> {
		const productId = Number(device.locator.productId);
		const devices = await hidDevices(VENDOR_RAZER);
		const interfaces = devices?.filter((d) => d.path && d.productId === productId) ?? [];

		if (interfaces.length === 0) {
			return { deviceLabel: device.label, percent: null, status: "not-found", detail: "Device not connected" };
		}

		// The transaction id found during discovery saves re-testing all of them.
		const known = Number(device.locator.transactionId);
		const answer = await this.findChannel(interfaces, known >= 0 ? [known] : undefined);

		return answer?.reading ?? notFound(device.label, "Device didn't answer the Razer power command");
	}

	/** Finds an interface and transaction id that answer, and reads the battery. */
	private async findChannel(
		interfaces: HidDeviceInfo[],
		transactionIds: number[] = TRANSACTION_IDS,
	): Promise<{ transactionId: number; reading: BatteryReading } | undefined> {
		const label = (interfaces.find((i) => i.product)?.product ?? "Razer device").trim();

		for (const info of interfaces) {
			for (const transactionId of transactionIds) {
				const level = await this.exchange(info, transactionId, CMD_BATTERY);
				if (level === undefined) continue;

				// A sleeping device answers 0; that's "no reading", not "flat".
				const percent = clampPercent((level / 255) * 100);
				if (percent <= 0) continue;

				const charging = await this.exchange(info, transactionId, CMD_CHARGING);
				return {
					transactionId,
					reading: {
						deviceLabel: label,
						percent,
						status: charging ? "charging" : "ok",
					},
				};
			}
		}

		return undefined;
	}

	/** Sends one power command and returns the byte the device answers with. */
	private async exchange(info: HidDeviceInfo, transactionId: number, commandId: number): Promise<number | undefined> {
		// undefined on a failure to open: the wrong interface for this protocol,
		// or a device busy elsewhere, which is what the probe loop expects.
		return withHidDevice<number | undefined>(info.path!, undefined, async (device) => {
			device.sendFeatureReport([REPORT_ID, ...buildReport(transactionId, commandId)]);

			await sleep(REPLY_DELAY_MS);
			const reply = device.getFeatureReport(REPORT_ID, REPORT_LENGTH + 1);
			if (!reply?.length) return undefined;

			// Offsets shift by one: node-hid puts the report id in front.
			const status = reply[1];
			const commandClass = reply[7];
			const answeredId = reply[8];
			if (status !== STATUS_OK || commandClass !== CLASS_POWER || answeredId !== commandId) return undefined;

			return reply[10];
		});
	}
}

function buildReport(transactionId: number, commandId: number): number[] {
	const report = new Array<number>(REPORT_LENGTH).fill(0);
	report[1] = transactionId;
	report[5] = 0x02; // data size
	report[6] = CLASS_POWER;
	report[7] = commandId;

	let crc = 0;
	for (let i = 2; i < 88; i++) crc ^= report[i];
	report[88] = crc;

	return report;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function kindOf(interfaces: HidDeviceInfo[], label: string): DeviceKind {
	for (const info of interfaces) {
		if (info.usagePage !== 0x01) continue;
		if (info.usage === USAGE_MOUSE) return "mouse";
		if (info.usage === USAGE_KEYBOARD) return "keyboard";
	}

	const name = label.toLowerCase();
	if (/kraken|barracuda|nari|thresher|blackshark|headset/.test(name)) return "headset";
	if (/hammerhead|earbud/.test(name)) return "earbuds";
	if (/basilisk|deathadder|viper|naga|orochi|lancehead|mamba|pro click|mouse/.test(name)) return "mouse";
	if (/blackwidow|huntsman|ornata|cynosa|deathstalker|keyboard/.test(name)) return "keyboard";
	if (/seiren|microphone/.test(name)) return "microphone";
	if (/leviathan|nommo|speaker/.test(name)) return "speaker";
	if (/wolverine|raiju|kishi|controller/.test(name)) return "gamepad";
	if (/tartarus|orbweaver|nostromo/.test(name)) return "keyboard";

	log.info(`razer: no form factor matched for "${label}"`);
	return "other";
}
