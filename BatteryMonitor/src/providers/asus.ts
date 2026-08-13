import type { Device as HidDeviceInfo } from "node-hid";
import { hidDevices, withHidDevice } from "./hid";
import { log } from "./log";
import type { BatteryProvider, BatteryReading, DeviceKind, DiscoveredDevice } from "./types";
import { hex4, notFound } from "./types";

const VENDOR_ID = 0x0b05; // ASUSTek

/** HID usage page 0x01 (Generic Desktop) usages that identify a form factor. */
const USAGE_KEYBOARD = 0x06;
const USAGE_MOUSE = 0x02;
const USAGE_GAMEPAD = 0x05;
const USAGE_JOYSTICK = 0x04;

/**
 * ROG receivers expose three vendor collections, each accepting exactly one
 * output report id. Windows rejects every other id with ERROR_INVALID_PARAMETER,
 * so the id has to match the collection.
 */
const REPORT_ID_BY_USAGE_PAGE = new Map([
	[0xff02, 0x01],
	[0xff00, 0x02],
	[0xff01, 0x03],
]);

/** Output reports are 64 bytes including the leading report id. */
const REPORT_LENGTH = 64;
const REPLY_TIMEOUT_MS = 400;

/** 0x12 is the "read info" command family; sub-command 0x01 returns power data. */
const CMD_READ_INFO = 0x12;
const SUB_POWER = 0x01;

/**
 * Layout of the power frame, verified against Armoury Crate on a ROG Azoth:
 *
 *   02 12 01 00 00 00 56 04 00 00 14 56 47 10 ...
 *   |  |  |           |           |  |
 *   |  |  |           |           |  +-- [11] battery again (mirror)
 *   |  |  |           |           +----- [10] low-battery warning threshold (0x14 = 20%,
 *   |  |  |           |                        matching Armoury Crate's 20% setting)
 *   |  |  |           +----------------- [6]  battery percentage (0x56 = 86)
 *   |  |  +----------------------------- [2]  sub-command echo
 *   |  +-------------------------------- [1]  command echo
 *   +----------------------------------- [0]  report id echo
 *
 * The device answers unsupported commands with `<id> ff aa`.
 */
const PERCENT_INDEX = 6;
const PERCENT_MIRROR_INDEX = 11;
const THRESHOLD_INDEX = 10;

const ERROR_MARKER = [0xff, 0xaa];

/**
 * Asus ROG peripherals are detected by enumeration — names come from each
 * device's own USB product descriptor, so whatever ROG gear is plugged in shows
 * up without a model list.
 *
 * Battery is read over the receiver's vendor collection. There is no public spec
 * for this; the command and frame layout were derived on real hardware (see
 * README "Asus battery protocol" and scripts/asus-*), and validated against the
 * percentage and low-battery threshold Armoury Crate displays. A device that
 * doesn't answer is reported as not detected rather than guessed at — it is
 * usually just switched off behind a dongle that's still plugged in.
 */
export class AsusProvider implements BatteryProvider {
	readonly id = "asus";

	async discover(): Promise<DiscoveredDevice[]> {
		const devices = await hidDevices(VENDOR_ID);
		if (!devices) return [];

		// One physical device exposes several HID interfaces; collapse to one entry
		// per productId, preferring the interface that names a form factor.
		const byProduct = new Map<number, DiscoveredDevice>();

		for (const info of devices) {
			const label = (info.product ?? "").trim() || `Asus device ${hex4(info.productId)}`;
			const kind = kindOf(info.usagePage, info.usage, label);
			const existing = byProduct.get(info.productId);
			if (existing && (existing.kind !== "other" || kind === "other")) continue;

			byProduct.set(info.productId, {
				key: `asus:${hex4(info.productId)}`,
				providerId: this.id,
				label,
				kind,
				supportsBattery: false,
				locator: { productId: info.productId },
				hardware: { vendorId: VENDOR_ID, productId: info.productId },
			});
		}

		// Every ASUSTek product is asked for the power frame, including the ones
		// whose form factor couldn't be worked out. Filtering on the form factor
		// first was cheaper, but a ROG mouse whose model name isn't in the list
		// below and whose input interface is held by Armoury Crate looks exactly
		// like a motherboard LED controller from here — and dropping it before
		// asking meant it never appeared at all.
		const all = [...byProduct.values()];

		for (const device of all) {
			const reading = await this.readPower(Number(device.locator.productId), device.label);
			if (!reading) continue;
			device.supportsBattery = true;
			device.reading = reading;
		}

		// Something that answers the ROG power command is a peripheral whatever it
		// called itself. Beyond that, only surface things that present as one:
		// ASUSTek's vendor id also covers motherboard gear ("AURA LED Controller"
		// and friends) with no battery and no business in a device picker.
		const candidates = all.filter((d) => d.supportsBattery || d.kind !== "other");

		for (const device of candidates) {
			// Silent, not batteryless: a ROG keyboard that's switched off still
			// leaves its dongle plugged in and answers nothing. "not-found" is
			// what a device that may come back looks like — and it lets the key
			// back off its polling instead of probing something that's asleep.
			device.reading ??= notFound(device.label, "Detected, but it didn't answer the ROG power command");
		}

		return candidates;
	}

	async read(device: DiscoveredDevice): Promise<BatteryReading> {
		const productId = Number(device.locator.productId);
		const reading = await this.readPower(productId, device.label);
		if (reading) return reading;

		const devices = await hidDevices(VENDOR_ID);
		const present = devices?.some((d) => d.productId === productId) ?? false;

		// Either way this is "not answering now", not "has no battery" — the
		// difference is only what to tell the user about why.
		return notFound(device.label, present ? "Device didn't answer the ROG power command" : "Device not connected");
	}

	/** Asks each vendor collection for the power frame; first valid answer wins. */
	private async readPower(productId: number, label: string): Promise<BatteryReading | null> {
		const devices = await hidDevices(VENDOR_ID);
		if (!devices) return null;

		const candidates = devices.filter(
			(d) => d.productId === productId && d.path && REPORT_ID_BY_USAGE_PAGE.has(d.usagePage ?? 0),
		);

		for (const info of candidates) {
			const reportId = REPORT_ID_BY_USAGE_PAGE.get(info.usagePage ?? 0);
			if (reportId === undefined) continue;

			const frame = await this.exchange(info, reportId);
			if (!frame) continue;

			const percent = frame[PERCENT_INDEX];
			const mirror = frame[PERCENT_MIRROR_INDEX];
			if (percent < 1 || percent > 100) continue;

			// The frame carries the level twice. They have always agreed on the
			// hardware this was derived from; if they ever don't, say so rather
			// than silently trusting one.
			if (mirror !== percent) {
				log.warn(
					`asus: power frame disagrees with itself ([${PERCENT_INDEX}]=${percent}, ` +
						`[${PERCENT_MIRROR_INDEX}]=${mirror}, threshold=${frame[THRESHOLD_INDEX]}) — using ${percent}`,
				);
			}

			return { deviceLabel: label, percent, status: "ok" };
		}

		return null;
	}

	/** Sends the power command on one collection and returns the reply frame. */
	private exchange(info: HidDeviceInfo, reportId: number): Promise<number[] | null> {
		// null on a failure to open: the wrong collection for this id, or a busy
		// interface — either way the caller moves on to the next candidate.
		return withHidDevice<number[] | null>(info.path!, null, (device) => {
			const report = new Array<number>(REPORT_LENGTH).fill(0);
			report[0] = reportId;
			report[1] = CMD_READ_INFO;
			report[2] = SUB_POWER;
			device.write(report);

			// The reply lands on the same handle that sent the command.
			const reply = device.readTimeout(REPLY_TIMEOUT_MS);
			if (!reply?.length) return null;

			const bytes = Array.from(reply);
			if (bytes[1] === ERROR_MARKER[0] && bytes[2] === ERROR_MARKER[1]) return null;
			if (bytes[1] !== CMD_READ_INFO || bytes[2] !== SUB_POWER) return null;

			// A short frame reads as `undefined` at the level offsets, and neither
			// `undefined < 1` nor `undefined > 100` is true — so the caller's range
			// check would wave it through and report a level of `undefined`.
			if (bytes.length <= PERCENT_MIRROR_INDEX) return null;

			return bytes;
		});
	}
}

function kindOf(usagePage: number | undefined, usage: number | undefined, label: string): DeviceKind {
	if (usagePage === 0x01) {
		if (usage === USAGE_KEYBOARD) return "keyboard";
		if (usage === USAGE_MOUSE) return "mouse";
		if (usage === USAGE_GAMEPAD || usage === USAGE_JOYSTICK) return "gamepad";
	}

	const name = label.toLowerCase();
	if (/keyboard|azoth|falchion|claymore|strix scope/.test(name)) return "keyboard";
	if (/mouse|gladius|chakram|keris|spatha|harpe/.test(name)) return "mouse";
	if (/headset|delta|cetra|fusion|theta/.test(name)) return "headset";
	if (/gamepad|raikiri|tessen/.test(name)) return "gamepad";

	return "other";
}
