import type { Device as HidDeviceInfo } from "node-hid";
import { hidDevices } from "./hid";
import type { BatteryProvider, BatteryReading, DeviceKind, DiscoveredDevice } from "./types";
import { hex4 } from "./types";
import { isXboxPad } from "./xbox";

/** The Stream Deck running this plugin is not a device anyone wants on a key. */
const ELGATO = 0x0fd9;

/** HID usage page 0x01 (Generic Desktop) usages that identify a form factor. */
const USAGE_MOUSE = 0x02;
const USAGE_JOYSTICK = 0x04;
const USAGE_GAMEPAD = 0x05;
const USAGE_KEYBOARD = 0x06;

/** Bluetooth HID service UUIDs, which Windows puts in the device path. */
const BLUETOOTH_PATH = /\{0000112[45]-0000-1000-8000-00805f9b34fb\}/i;

/**
 * Names that suggest the USB thing enumerating is a radio for something else,
 * so its "plugged in" status says nothing about the peripheral's battery.
 */
const RECEIVER_NAME = /wireless|receiver|dongle|lightspeed|bolt|2\.4\s*g/i;

/**
 * Catch-all: lists every HID device so nothing is invisible, even though none of
 * them report a battery through a protocol this plugin knows.
 *
 * Cable-powered devices are reported as running on mains rather than as a
 * failure to read a battery — a wired keyboard has no battery to be missing.
 * Anything wireless, or anything whose name suggests it's a receiver for a
 * wireless peripheral, is left as "unsupported" instead: there may well be a
 * battery there, this plugin just can't see it.
 *
 * Vendors that have a dedicated provider are deliberately *not* skipped here.
 * They used to be, and that turned every way a dedicated provider can come up
 * empty — a vendor tool holding the interface open, an unfamiliar HID++ usage
 * page, a device asleep behind its dongle — into the device vanishing from the
 * picker entirely, for exactly the hardware most likely to hit those cases.
 * {@link mergeGeneric} drops these entries once a real provider has described
 * the same vendor/product, which is the narrower thing that was actually meant.
 */
export class GenericHidProvider implements BatteryProvider {
	readonly id = "hid";

	async discover(): Promise<DiscoveredDevice[]> {
		const devices = await hidDevices();
		if (!devices) return [];

		// One physical device exposes several HID interfaces; collapse to one entry
		// per vendor/product, preferring an interface that names a form factor.
		const byProduct = new Map<string, DiscoveredDevice>();

		for (const info of devices) {
			if (!info.path) continue;
			if (info.vendorId === ELGATO) continue;
			// Only the pad is claimed, not all of Microsoft's mice and keyboards.
			if (isXboxPad(info)) continue;

			const id = `${hex4(info.vendorId)}:${hex4(info.productId)}`;
			const kind = kindOf(info);
			const existing = byProduct.get(id);
			if (existing && (existing.kind !== "other" || kind === "other")) continue;

			const label = labelOf(info);
			byProduct.set(id, {
				key: `hid:${id}`,
				providerId: this.id,
				label,
				kind,
				supportsBattery: false,
				locator: { vendorId: info.vendorId, productId: info.productId },
				hardware: { vendorId: info.vendorId, productId: info.productId },
				reading: readingFor(info, label),
			});
		}

		return [...byProduct.values()];
	}

	async read(device: DiscoveredDevice): Promise<BatteryReading> {
		const devices = await hidDevices();
		const match = devices?.find(
			(d) => d.vendorId === Number(device.locator.vendorId) && d.productId === Number(device.locator.productId),
		);

		if (!match) {
			return { deviceLabel: device.label, percent: null, status: "not-found", detail: "Device not connected" };
		}
		return readingFor(match, device.label);
	}
}

function readingFor(info: HidDeviceInfo, label: string): BatteryReading {
	const wireless = BLUETOOTH_PATH.test(info.path ?? "") || RECEIVER_NAME.test(label);

	if (wireless) {
		return {
			deviceLabel: label,
			percent: null,
			status: "unsupported",
			detail: "Detected, but it reports no battery this plugin can read",
		};
	}

	return { deviceLabel: label, percent: null, status: "mains", detail: "Powered over its cable" };
}

function labelOf(info: HidDeviceInfo): string {
	const product = (info.product ?? "").trim();
	const manufacturer = (info.manufacturer ?? "").trim();

	if (product && manufacturer && !product.toLowerCase().startsWith(manufacturer.toLowerCase())) {
		return `${manufacturer} ${product}`;
	}
	return product || manufacturer || `HID device ${hex4(info.vendorId)}:${hex4(info.productId)}`;
}

function kindOf(info: HidDeviceInfo): DeviceKind {
	if (info.usagePage === 0x01) {
		if (info.usage === USAGE_KEYBOARD) return "keyboard";
		if (info.usage === USAGE_MOUSE) return "mouse";
		if (info.usage === USAGE_GAMEPAD || info.usage === USAGE_JOYSTICK) return "gamepad";
	}

	// Model names, since a gaming peripheral rarely says what it is: an "Arctis
	// Nova Pro" or a "Scimitar" names itself and nothing else.
	const name = (info.product ?? "").toLowerCase();
	if (/keyboard|keypad|k[0-9]{2,3}\b|apex|strafe|huntsman|blackwidow|keychron/.test(name)) return "keyboard";
	if (/mouse|trackball|rival|sensei|aerox|scimitar|harpoon|ironclaw|dark core|model o|model d/.test(name)) {
		return "mouse";
	}
	if (/buds|earbud|airpods|hammerhead/.test(name)) return "earbuds";
	if (/headset|headphone|cloud|arctis|virtuoso|void|kraken|barracuda|stealth|blackshark|nova\b/.test(name)) {
		return "headset";
	}
	if (/controller|gamepad|joystick|wolverine|raiju/.test(name)) return "gamepad";
	if (/mic\b|microphone|solocast|quadcast|yeti|wave|seiren|blue\b/.test(name)) return "microphone";
	if (/speaker|soundbar|nommo|leviathan/.test(name)) return "speaker";
	if (/watch|band\b/.test(name)) return "watch";

	return "other";
}
