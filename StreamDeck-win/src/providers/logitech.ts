import type { Device as HidDeviceInfo, HID as HidDevice } from "node-hid";
import { hidDevices, loadHid } from "./hid";
import type { BatteryProvider, BatteryReading, DeviceKind, DiscoveredDevice } from "./types";
import { hex4 } from "./types";

const VENDOR_ID = 0x046d;

/**
 * The HID++ endpoint is a vendor-defined usage page (0xff00) exposing two
 * collections: usage 0x01 carries the 7-byte short reports, usage 0x02 the
 * 20-byte long ones. Windows hands out a separate handle per collection and
 * rejects a report id that the handle's collection doesn't declare, so both
 * have to be opened and each request written to the matching one.
 */
const HIDPP_USAGE_PAGE = 0xff00;
const HIDPP_USAGE_SHORT = 0x01;
const HIDPP_USAGE_LONG = 0x02;

const SHORT_REPORT_ID = 0x10;
const SHORT_LEN = 7;
const LONG_REPORT_ID = 0x11;
const LONG_LEN = 20;
const SW_ID = 0x0a; // arbitrary nonzero software id, echoed back in responses

const ERR_HIDPP10 = 0x8f;
const ERR_HIDPP20 = 0xff;

const FEATURE_ROOT = 0x0000;
const FEATURE_DEVICE_INFO = 0x0003;
const FEATURE_DEVICE_NAME = 0x0005;
const FEATURE_BATTERY_LEGACY = 0x1000;
const FEATURE_BATTERY_UNIFIED = 0x1004;

const RESPONSE_TIMEOUT_MS = 250;

/**
 * A device that's been sitting still is in power-save and answers its first
 * ping late, if at all — a mouse nobody has touched for a minute needs longer
 * than one that was just moved. Battery reads therefore wait longer and ask
 * twice, while everything else keeps the short timeout: discovery probes empty
 * receiver slots, and each of those costs a full timeout with nothing to show
 * for it.
 */
const BATTERY_TIMEOUT_MS = 700;
const BATTERY_ATTEMPTS = 2;
const PING_MARKER = 0x5a;

/**
 * Device indices to probe on each HID++ endpoint. 0xff addresses a directly
 * connected device (cable/Bluetooth); 1..6 are the pairing slots of a Unifying
 * or Lightspeed receiver. An absent slot costs one timeout, a present-but-empty
 * one answers with an error immediately.
 */
const DEVICE_INDICES = [0xff, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06];

/** Device type codes from feature 0x0005 getDeviceType. */
const DEVICE_TYPES: Record<number, { name: string; kind: DeviceKind }> = {
	0: { name: "Keyboard", kind: "keyboard" },
	1: { name: "Remote control", kind: "other" },
	2: { name: "Numpad", kind: "keyboard" },
	3: { name: "Mouse", kind: "mouse" },
	4: { name: "Touchpad", kind: "mouse" },
	5: { name: "Trackball", kind: "mouse" },
	6: { name: "Presenter", kind: "other" },
	7: { name: "Receiver", kind: "other" },
	8: { name: "Headset", kind: "headset" },
	9: { name: "Webcam", kind: "other" },
	10: { name: "Steering wheel", kind: "gamepad" },
	11: { name: "Joystick", kind: "gamepad" },
	12: { name: "Gamepad", kind: "gamepad" },
	13: { name: "Dock", kind: "other" },
	14: { name: "Speaker", kind: "speaker" },
	15: { name: "Microphone", kind: "microphone" },
	16: { name: "Illumination light", kind: "other" },
	17: { name: "Programmable controller", kind: "other" },
	18: { name: "Car sim pedals", kind: "gamepad" },
	19: { name: "Adapter", kind: "other" },
};

type BatteryFeature = { index: number; unified: boolean };

/** The pair of HID collections that together make up one HID++ endpoint. */
type HidppEndpoint = { key: string; productId: number; short?: HidDeviceInfo; long?: HidDeviceInfo };

/**
 * Logitech wireless peripherals speak HID++ 2.0 over their receiver or directly
 * over Bluetooth. There is no vendor API (G HUB / Options+ expose none), so this
 * implements the protocol directly, following the reverse-engineered spec
 * documented by the Solaar and libratbag projects:
 *
 *   0x0000 Root            . getFeature(id)  -> resolves a feature to its index
 *   0x0003 Device Info     . getDeviceInfo() -> unit id (stable per unit)
 *   0x0005 Device Name     . getDeviceName() -> the device's own product name
 *   0x1004 Unified Battery . getStatus()     -> level %, charging state
 *   0x1000 Battery (legacy). getLevelStatus() -> level %, charging state
 *
 * Every device paired to every Logitech receiver on the machine is enumerated;
 * names and form factors come from the devices themselves, so no model is
 * hard-coded here.
 */
export class LogitechProvider implements BatteryProvider {
	readonly id = "logitech";

	async discover(): Promise<DiscoveredDevice[]> {
		const endpoints = await hidppEndpoints();
		const found: DiscoveredDevice[] = [];
		const seen = new Set<string>();

		for (const endpoint of endpoints) {
			await withLink(endpoint, async (link) => {
				for (const deviceIndex of DEVICE_INDICES) {
					const probed = await this.probe(link, deviceIndex, endpoint);
					if (probed && !seen.has(probed.key)) {
						seen.add(probed.key);
						found.push(probed);
					}
				}
			});
		}

		return found;
	}

	async read(device: DiscoveredDevice): Promise<BatteryReading> {
		const productId = Number(device.locator.productId);
		const deviceIndex = Number(device.locator.deviceIndex);
		const endpoints = (await hidppEndpoints()).filter((e) => e.productId === productId);

		if (endpoints.length === 0) {
			return { deviceLabel: device.label, percent: null, status: "not-found", detail: "Receiver not connected" };
		}

		let result: BatteryReading | null = null;
		for (const endpoint of endpoints) {
			if (result) break;
			await withLink(endpoint, async (link) => {
				if (!(await ping(link, deviceIndex, BATTERY_TIMEOUT_MS, BATTERY_ATTEMPTS))) return;
				const feature = await findBatteryFeature(link, deviceIndex);
				if (!feature) {
					result = {
						deviceLabel: device.label,
						percent: null,
						status: "unsupported",
						detail: "Device exposes no HID++ battery feature",
					};
					return;
				}
				result = await readBattery(link, deviceIndex, feature, device.label);
			});
		}

		return (
			result ?? {
				deviceLabel: device.label,
				percent: null,
				status: "not-found",
				detail: "No answer after two tries — powered off or out of range",
			}
		);
	}

	private async probe(link: HidppLink, deviceIndex: number, endpoint: HidppEndpoint): Promise<DiscoveredDevice | null> {
		if (!(await ping(link, deviceIndex))) return null;

		const nameIndex = await featureIndex(link, deviceIndex, FEATURE_DEVICE_NAME);
		const name = nameIndex ? await readName(link, deviceIndex, nameIndex) : null;
		const typeCode = nameIndex ? await readDeviceType(link, deviceIndex, nameIndex) : null;
		const type = typeCode !== null ? DEVICE_TYPES[typeCode] : undefined;

		// A receiver answering for itself isn't a battery-bearing peripheral.
		if (type?.name === "Receiver") return null;

		const feature = await findBatteryFeature(link, deviceIndex);
		if (!name && !feature) return null;

		const label = name ?? `Logitech device ${hex4(endpoint.productId)}:${deviceIndex}`;
		const unitId = await readUnitId(link, deviceIndex);
		const key = unitId ? `logitech:${unitId}` : `logitech:${hex4(endpoint.productId)}:${deviceIndex.toString(16)}`;

		const reading = feature
			? await readBattery(link, deviceIndex, feature, label)
			: {
					deviceLabel: label,
					percent: null,
					status: "unsupported" as const,
					detail: "Device exposes no HID++ battery feature",
				};

		return {
			key,
			providerId: this.id,
			label,
			kind: type?.kind ?? "other",
			supportsBattery: feature !== null,
			locator: { productId: endpoint.productId, deviceIndex },
			reading,
		};
	}
}

/**
 * Collapses the per-collection HID paths Windows reports back into one entry per
 * physical endpoint: `...&MI_02&Col01#9&1b0e509f&0&0000#{guid}` and its `Col02`
 * sibling differ only in the collection index and the trailing instance number.
 * Platforms that expose a single node per interface fall out as one group each.
 */
function endpointKey(path: string): string {
	return path
		.replace(/&Col\d+/i, "")
		.replace(/#\{[0-9a-f-]+\}$/i, "")
		.replace(/&\d{4}$/, "");
}

/** Every Logitech HID++ endpoint on the machine. */
async function hidppEndpoints(): Promise<HidppEndpoint[]> {
	const devices = await hidDevices(VENDOR_ID);
	if (!devices) return [];

	const withPath = devices.filter((d) => !!d.path);
	const vendorCollections = withPath.filter((d) => d.usagePage === HIDPP_USAGE_PAGE);
	// Some platforms/drivers don't report usagePage; then try every interface.
	const pool = vendorCollections.length > 0 ? vendorCollections : withPath.filter((d) => d.usagePage === undefined);

	const endpoints = new Map<string, HidppEndpoint>();
	for (const info of pool) {
		const key = endpointKey(info.path!);
		const endpoint = endpoints.get(key) ?? { key, productId: info.productId };
		if (info.usage === HIDPP_USAGE_LONG) endpoint.long = info;
		else if (info.usage === HIDPP_USAGE_SHORT) endpoint.short = info;
		else endpoint.short ??= info; // platform doesn't split collections
		endpoints.set(key, endpoint);
	}

	// A real HID++ endpoint always offers the long-report collection. Requiring it
	// discards other 0xff00 vendor interfaces that would otherwise cost a timeout
	// per probed device index (a Logitech webcam, for instance).
	const all = [...endpoints.values()];
	return all.some((e) => e.long) ? all.filter((e) => e.long) : all;
}

/**
 * A HID++ endpoint with both collections open. Requests go out on the handle
 * whose collection declares the report id; replies are accepted from either,
 * since a short request can be answered with a long report.
 */
class HidppLink {
	constructor(
		private readonly short: HidDevice | undefined,
		private readonly long: HidDevice | undefined,
	) {}

	get usable(): boolean {
		return !!(this.short || this.long);
	}

	/**
	 * Sends one request and waits for the matching response. Resolves null on an
	 * error response or timeout, so callers can treat "unsupported" and "absent"
	 * the same way.
	 */
	request(
		deviceIndex: number,
		featureIdx: number,
		functionId: number,
		params: number[] = [],
		preferLong = false,
		timeoutMs: number = RESPONSE_TIMEOUT_MS,
	): Promise<number[] | null> {
		const target = preferLong ? (this.long ?? this.short) : (this.short ?? this.long);
		if (!target) return Promise.resolve(null);

		const long = target === this.long;
		const length = long ? LONG_LEN : SHORT_LEN;
		const report = new Array<number>(length).fill(0);
		const funcByte = ((functionId & 0x0f) << 4) | SW_ID;

		report[0] = long ? LONG_REPORT_ID : SHORT_REPORT_ID;
		report[1] = deviceIndex;
		report[2] = featureIdx;
		report[3] = funcByte;
		for (let i = 0; i < params.length && 4 + i < length; i++) report[4 + i] = params[i] & 0xff;

		const listeners = [this.short, this.long].filter((d): d is HidDevice => !!d);

		return new Promise((resolve) => {
			let settled = false;
			// Declared up here because `finish` below closes over it, and `finish`
			// has to exist before the listener that can call it is registered.
			// eslint-disable-next-line prefer-const
			let timer: NodeJS.Timeout | undefined;

			const finish = (value: number[] | null): void => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				for (const device of listeners) device.removeListener("data", onData);
				resolve(value);
			};

			const onData = (data: Buffer): void => {
				const bytes = Array.from(data);
				if (bytes[1] !== deviceIndex) return;
				// Success: same feature index and same function/software id echoed back.
				if (bytes[2] === featureIdx && bytes[3] === funcByte) finish(bytes);
				// Error: 0x8f (HID++ 1.0) / 0xff (HID++ 2.0), original request in bytes 3-4.
				else if (
					(bytes[2] === ERR_HIDPP20 || bytes[2] === ERR_HIDPP10) &&
					bytes[3] === featureIdx &&
					bytes[4] === funcByte
				)
					finish(null);
			};

			for (const device of listeners) device.on("data", onData);
			timer = setTimeout(() => finish(null), timeoutMs);

			try {
				target.write(report);
			} catch {
				finish(null);
			}
		});
	}
}

async function withLink(endpoint: HidppEndpoint, fn: (link: HidppLink) => Promise<void>): Promise<void> {
	const HID = await loadHid();
	if (!HID) return;

	const open = (info: HidDeviceInfo | undefined): HidDevice | undefined => {
		if (!info?.path) return undefined;
		try {
			return new HID.HID(info.path);
		} catch {
			// Interface busy (G HUB holds some exclusively) or gone.
			return undefined;
		}
	};

	const short = open(endpoint.short);
	const long = open(endpoint.long);

	try {
		const link = new HidppLink(short, long);
		if (link.usable) await fn(link);
	} catch {
		// A provider must never take down a scan.
	} finally {
		for (const device of [short, long]) {
			try {
				device?.close();
			} catch {
				/* already closed */
			}
		}
	}
}

/** Root.getProtocolVersion, used as a cheap "is anything on this index?" probe. */
/**
 * Checks a device is there and awake.
 *
 * Discovery uses the default short timeout, because it pings all seven slots on
 * every endpoint and an empty one can only be identified by the timeout. Reading
 * a device we already know exists is the opposite case: it's worth waiting, and
 * worth asking twice, since the first ping is often what wakes the radio.
 */
async function ping(
	link: HidppLink,
	deviceIndex: number,
	timeoutMs: number = RESPONSE_TIMEOUT_MS,
	attempts = 1,
): Promise<boolean> {
	for (let attempt = 0; attempt < attempts; attempt++) {
		const resp = await link.request(deviceIndex, FEATURE_ROOT, 0x01, [0x00, 0x00, PING_MARKER], false, timeoutMs);
		if (resp !== null && resp[6] === PING_MARKER) return true;
	}
	return false;
}

async function featureIndex(link: HidppLink, deviceIndex: number, featureId: number): Promise<number | null> {
	const resp = await link.request(deviceIndex, FEATURE_ROOT, 0x00, [(featureId >> 8) & 0xff, featureId & 0xff, 0x00]);
	if (!resp) return null;
	const index = resp[4];
	return index > 0 ? index : null;
}

async function findBatteryFeature(link: HidppLink, deviceIndex: number): Promise<BatteryFeature | null> {
	const unified = await featureIndex(link, deviceIndex, FEATURE_BATTERY_UNIFIED);
	if (unified) return { index: unified, unified: true };

	const legacy = await featureIndex(link, deviceIndex, FEATURE_BATTERY_LEGACY);
	if (legacy) return { index: legacy, unified: false };

	return null;
}

async function readBattery(
	link: HidppLink,
	deviceIndex: number,
	feature: BatteryFeature,
	label: string,
): Promise<BatteryReading> {
	if (feature.unified) {
		// getStatus() -> stateOfCharge, batteryLevel, chargingStatus, externalPower
		const resp = await requestBattery(link, deviceIndex, feature.index, 0x01);
		if (resp) {
			const percent = resp[4];
			const chargingStatus = resp[6];
			if (percent >= 0 && percent <= 100) {
				return {
					deviceLabel: label,
					percent,
					// 0 discharging, 1 charging, 2 charging slow, 3 charge complete, 4 error
					status: chargingStatus >= 1 && chargingStatus <= 3 ? "charging" : "ok",
				};
			}
		}
	} else {
		// getBatteryLevelStatus() -> level%, nextLevel%, status
		const resp = await requestBattery(link, deviceIndex, feature.index, 0x00);
		if (resp) {
			const percent = resp[4];
			const status = resp[6];
			if (percent > 0 && percent <= 100) {
				// 0 discharging, 1 recharging, 2 almost full, 3 full, 4 slow recharge
				return {
					deviceLabel: label,
					percent,
					status: status >= 1 && status <= 4 ? "charging" : "ok",
				};
			}
		}
	}

	return {
		deviceLabel: label,
		percent: null,
		status: "not-found",
		detail: "No answer after two tries — powered off or out of range",
	};
}

/**
 * Asks for the battery, giving a sleeping device a second chance.
 *
 * The first request often doubles as the thing that wakes the radio: an idle
 * mouse misses it and answers the next one. Without the retry, a mouse that was
 * simply sitting still read as "powered off or out of range".
 */
async function requestBattery(
	link: HidppLink,
	deviceIndex: number,
	featureIdx: number,
	functionId: number,
): Promise<number[] | null> {
	for (let attempt = 0; attempt < BATTERY_ATTEMPTS; attempt++) {
		const resp = await link.request(deviceIndex, featureIdx, functionId, [], false, BATTERY_TIMEOUT_MS);
		if (resp) return resp;
	}
	return null;
}

/** Feature 0x0005: the device's own product name, read in chunks. */
async function readName(link: HidppLink, deviceIndex: number, nameIndex: number): Promise<string | null> {
	const count = await link.request(deviceIndex, nameIndex, 0x00);
	const length = count?.[4] ?? 0;
	if (!length) return null;

	let name = "";
	while (name.length < length && name.length < 64) {
		const before = name.length;
		const chunk = await link.request(deviceIndex, nameIndex, 0x01, [name.length], true);
		if (!chunk) break;
		for (let i = 4; i < chunk.length && name.length < length; i++) {
			const code = chunk[i];
			if (code === 0) break;
			name += String.fromCharCode(code);
		}
		if (name.length === before) break;
	}

	return name.trim() || null;
}

/** Feature 0x0005 getDeviceType. */
async function readDeviceType(link: HidppLink, deviceIndex: number, nameIndex: number): Promise<number | null> {
	const resp = await link.request(deviceIndex, nameIndex, 0x02);
	return resp ? resp[4] : null;
}

/**
 * Feature 0x0003 getDeviceInfo: the 4-byte unit id is unique per physical unit,
 * which makes it the right thing to persist in settings — unlike the HID path,
 * it survives replugging and rebooting.
 */
async function readUnitId(link: HidppLink, deviceIndex: number): Promise<string | null> {
	const infoIndex = await featureIndex(link, deviceIndex, FEATURE_DEVICE_INFO);
	if (!infoIndex) return null;

	const resp = await link.request(deviceIndex, infoIndex, 0x00, [], true);
	if (!resp || resp.length < 9) return null;

	const unit = resp
		.slice(5, 9)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");

	return unit === "00000000" ? null : unit;
}
