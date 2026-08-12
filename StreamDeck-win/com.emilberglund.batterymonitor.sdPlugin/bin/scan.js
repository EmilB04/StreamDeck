'use strict';

var node_child_process = require('node:child_process');
var node_os = require('node:os');
var node_path = require('node:path');
var node_util = require('node:util');

const noop = { info: () => { }, warn: () => { } };
let current = noop;
function setLogger(logger) {
    current = logger;
}
const log = {
    info: (message, ...args) => current.info(message, ...args),
    warn: (message, ...args) => current.warn(message, ...args),
};

const HID_UNAVAILABLE = "node-hid not available. Run `npm run sync-deps` on the machine running Stream Deck.";
/**
 * node-hid is a native addon that only gets installed into the .sdPlugin folder
 * on the target machine (see scripts/sync-runtime-deps.mjs). Loading it lazily
 * means a missing/mismatched binary only disables the HID-based providers
 * instead of taking down the whole plugin.
 */
let cached;
async function loadHid() {
    if (cached !== undefined)
        return cached;
    try {
        const ns = await import('node-hid');
        cached = ns.default ?? ns;
    }
    catch (err) {
        // Every HID provider goes quiet when this happens, which otherwise looks
        // exactly like a desk with no supported devices on it.
        log.warn(`${HID_UNAVAILABLE} (${String(err)})`);
        cached = null;
    }
    return cached;
}
/**
 * Opens a HID interface, runs `use`, and closes it again whatever happens.
 *
 * Every provider had its own copy of this open/try/finally dance, and the
 * handles are exclusive on Windows — one early return that skipped the close
 * would lock the device out until Stream Deck restarted. Returns `fallback` if
 * the interface can't be opened or the work throws, because a provider must
 * never take down a scan.
 */
async function withHidDevice(path, fallback, use, context) {
    const HID = await loadHid();
    if (!HID)
        return fallback;
    let device;
    try {
        device = new HID.HID(path);
        return await use(device);
    }
    catch (err) {
        if (context)
            log.warn(`${context}: ${String(err)}`);
        return fallback;
    }
    finally {
        try {
            device?.close();
        }
        catch {
            // Already gone — unplugged mid-read, most likely.
        }
    }
}
/** Enumerates connected HID interfaces, optionally filtered by vendor. */
async function hidDevices(vendorId) {
    const HID = await loadHid();
    if (!HID)
        return null;
    try {
        const all = HID.devices();
        return vendorId === undefined ? all : all.filter((d) => d.vendorId === vendorId);
    }
    catch {
        return [];
    }
}

/**
 * A whole-number percentage inside 0-100.
 *
 * Every provider scales a raw value into a percentage, and each was clamping it
 * differently — a couple only capped the top, so a decode that went negative
 * could paint a key below empty.
 */
function clampPercent(value) {
    if (!Number.isFinite(value))
        return 0;
    return Math.max(0, Math.min(100, Math.round(value)));
}
/** The device isn't answering right now. It may well be back next poll. */
function notFound(deviceLabel, detail) {
    return { deviceLabel, percent: null, status: "not-found", detail };
}
/** The device is there, but nothing here knows how to read a battery from it. */
function unsupported(deviceLabel, detail) {
    return { deviceLabel, percent: null, status: "unsupported", detail };
}
function slug(value) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}
function hex4(value) {
    return value.toString(16).padStart(4, "0");
}

const VENDOR_ID$1 = 0x0b05; // ASUSTek
/** HID usage page 0x01 (Generic Desktop) usages that identify a form factor. */
const USAGE_KEYBOARD$2 = 0x06;
const USAGE_MOUSE$2 = 0x02;
const USAGE_GAMEPAD$2 = 0x05;
const USAGE_JOYSTICK$1 = 0x04;
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
const REPORT_LENGTH$1 = 64;
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
class AsusProvider {
    id = "asus";
    async discover() {
        const devices = await hidDevices(VENDOR_ID$1);
        if (!devices)
            return [];
        // One physical device exposes several HID interfaces; collapse to one entry
        // per productId, preferring the interface that names a form factor.
        const byProduct = new Map();
        for (const info of devices) {
            const label = (info.product ?? "").trim() || `Asus device ${hex4(info.productId)}`;
            const kind = kindOf$3(info.usagePage, info.usage, label);
            const existing = byProduct.get(info.productId);
            if (existing && (existing.kind !== "other" || kind === "other"))
                continue;
            byProduct.set(info.productId, {
                key: `asus:${hex4(info.productId)}`,
                providerId: this.id,
                label,
                kind,
                supportsBattery: false,
                locator: { productId: info.productId },
            });
        }
        // Only surface things that actually present as a peripheral. ASUSTek's
        // vendor id also covers motherboard gear ("AURA LED Controller" and
        // friends) that has no battery and no business in a device picker.
        const candidates = [...byProduct.values()].filter((d) => d.kind !== "other");
        for (const device of candidates) {
            const reading = await this.readPower(Number(device.locator.productId), device.label);
            if (reading) {
                device.supportsBattery = true;
                device.reading = reading;
            }
            else {
                // Silent, not batteryless: a ROG keyboard that's switched off still
                // leaves its dongle plugged in and answers nothing. "not-found" is
                // what a device that may come back looks like — and it lets the key
                // back off its polling instead of probing something that's asleep.
                device.reading = notFound(device.label, "Detected, but it didn't answer the ROG power command");
            }
        }
        return candidates;
    }
    async read(device) {
        const productId = Number(device.locator.productId);
        const reading = await this.readPower(productId, device.label);
        if (reading)
            return reading;
        const devices = await hidDevices(VENDOR_ID$1);
        const present = devices?.some((d) => d.productId === productId) ?? false;
        // Either way this is "not answering now", not "has no battery" — the
        // difference is only what to tell the user about why.
        return notFound(device.label, present ? "Device didn't answer the ROG power command" : "Device not connected");
    }
    /** Asks each vendor collection for the power frame; first valid answer wins. */
    async readPower(productId, label) {
        const devices = await hidDevices(VENDOR_ID$1);
        if (!devices)
            return null;
        const candidates = devices.filter((d) => d.productId === productId && d.path && REPORT_ID_BY_USAGE_PAGE.has(d.usagePage ?? 0));
        for (const info of candidates) {
            const reportId = REPORT_ID_BY_USAGE_PAGE.get(info.usagePage ?? 0);
            if (reportId === undefined)
                continue;
            const frame = await this.exchange(info, reportId);
            if (!frame)
                continue;
            const percent = frame[PERCENT_INDEX];
            const mirror = frame[PERCENT_MIRROR_INDEX];
            if (percent < 1 || percent > 100)
                continue;
            // The frame carries the level twice. They have always agreed on the
            // hardware this was derived from; if they ever don't, say so rather
            // than silently trusting one.
            if (mirror !== percent) {
                log.warn(`asus: power frame disagrees with itself ([${PERCENT_INDEX}]=${percent}, ` +
                    `[${PERCENT_MIRROR_INDEX}]=${mirror}, threshold=${frame[THRESHOLD_INDEX]}) — using ${percent}`);
            }
            return { deviceLabel: label, percent, status: "ok" };
        }
        return null;
    }
    /** Sends the power command on one collection and returns the reply frame. */
    exchange(info, reportId) {
        // null on a failure to open: the wrong collection for this id, or a busy
        // interface — either way the caller moves on to the next candidate.
        return withHidDevice(info.path, null, (device) => {
            const report = new Array(REPORT_LENGTH$1).fill(0);
            report[0] = reportId;
            report[1] = CMD_READ_INFO;
            report[2] = SUB_POWER;
            device.write(report);
            // The reply lands on the same handle that sent the command.
            const reply = device.readTimeout(REPLY_TIMEOUT_MS);
            if (!reply?.length)
                return null;
            const bytes = Array.from(reply);
            if (bytes[1] === ERROR_MARKER[0] && bytes[2] === ERROR_MARKER[1])
                return null;
            if (bytes[1] !== CMD_READ_INFO || bytes[2] !== SUB_POWER)
                return null;
            // A short frame reads as `undefined` at the level offsets, and neither
            // `undefined < 1` nor `undefined > 100` is true — so the caller's range
            // check would wave it through and report a level of `undefined`.
            if (bytes.length <= PERCENT_MIRROR_INDEX)
                return null;
            return bytes;
        });
    }
}
function kindOf$3(usagePage, usage, label) {
    if (usagePage === 0x01) {
        if (usage === USAGE_KEYBOARD$2)
            return "keyboard";
        if (usage === USAGE_MOUSE$2)
            return "mouse";
        if (usage === USAGE_GAMEPAD$2 || usage === USAGE_JOYSTICK$1)
            return "gamepad";
    }
    const name = label.toLowerCase();
    if (/keyboard|azoth|falchion|claymore|strix scope/.test(name))
        return "keyboard";
    if (/mouse|gladius|chakram|keris|spatha|harpe/.test(name))
        return "mouse";
    if (/headset|delta|cetra|fusion|theta/.test(name))
        return "headset";
    if (/gamepad|raikiri|tessen/.test(name))
        return "gamepad";
    return "other";
}

const VENDOR_SONY = 0x054c;
const PRODUCTS = new Map([
    [0x0ce6, { label: "DualSense Wireless Controller", family: "dualsense" }],
    [0x0df2, { label: "DualSense Edge Wireless Controller", family: "dualsense" }],
    [0x05c4, { label: "DualShock 4 Wireless Controller", family: "dualshock4" }],
    [0x09cc, { label: "DualShock 4 Wireless Controller", family: "dualshock4" }],
    [0x0ba0, { label: "DualShock 4 USB Wireless Adaptor", family: "dualshock4" }],
]);
/**
 * DualShock 4 input reports: 0x01 over USB, 0x11 over Bluetooth (which carries
 * two extra header bytes). One byte holds both the level and whether the cable
 * is in — the same idea as the PS5's status byte, in a different place.
 *
 *   [0..3] level, 0-10 on battery and 0-11 while charging
 *   [4]    cable state
 */
const REPORT_DS4_USB = 0x01;
const REPORT_DS4_BT = 0x11;
const STATUS_INDEX_DS4_USB = 30;
const STATUS_INDEX_DS4_BT = 32;
const DS4_CABLE = 0x10;
const DS4_LEVEL = 0x0f;
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
const READ_TIMEOUT_MS$1 = 120;
const READ_ATTEMPTS$1 = 8;
/** Bluetooth HID service UUIDs, which Windows puts in the device path. */
const BLUETOOTH_PATH$2 = /\{0000112[45]-0000-1000-8000-00805f9b34fb\}/i;
/** Charge state, from the status byte's high nibble. */
const CHARGING$1 = 0x1;
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
class DualSenseProvider {
    id = "dualsense";
    async discover() {
        const devices = await hidDevices(VENDOR_SONY);
        if (!devices)
            return [];
        const found = [];
        for (const info of devices) {
            if (!info.path || !PRODUCTS.has(info.productId))
                continue;
            const product = PRODUCTS.get(info.productId);
            const label = (info.product ?? "").trim() || product.label;
            const device = {
                // The serial number is the pad's MAC address over Bluetooth, so it
                // survives a reconnect and a reboot. USB doesn't always report one.
                key: `dualsense:${hex4(info.productId)}:${slug(info.serialNumber || info.path)}`,
                providerId: this.id,
                label,
                kind: "gamepad",
                supportsBattery: true,
                locator: {
                    productId: info.productId,
                    serialNumber: info.serialNumber ?? "",
                    family: product.family,
                },
            };
            device.reading = await this.readFrom(info, label, product.family);
            found.push(device);
        }
        return found;
    }
    async read(device) {
        const info = await this.locate(device);
        if (!info) {
            return {
                deviceLabel: device.label,
                percent: null,
                status: "not-found",
                detail: "Controller not connected",
            };
        }
        return this.readFrom(info, device.label, familyOf(info.productId));
    }
    /** Finds the pad again by serial, falling back to the product id. */
    async locate(device) {
        const devices = await hidDevices(VENDOR_SONY);
        if (!devices)
            return undefined;
        const productId = Number(device.locator.productId);
        const serialNumber = String(device.locator.serialNumber ?? "");
        const candidates = devices.filter((d) => d.path && d.productId === productId);
        return candidates.find((d) => serialNumber !== "" && d.serialNumber === serialNumber) ?? candidates[0];
    }
    async readFrom(info, label, family) {
        const status = await this.readStatusByte(info, family);
        if (status === null) {
            return {
                deviceLabel: label,
                percent: null,
                status: "error",
                detail: "Controller didn't send a full input report",
            };
        }
        return family === "dualsense" ? decodeStatus(status, label) : decodeDualShock4(status, label);
    }
    /**
     * Opens the pad, waits for a report that actually carries the battery, and
     * returns its status byte.
     */
    async readStatusByte(info, family) {
        const overBluetooth = BLUETOOTH_PATH$2.test(info.path ?? "");
        // null on a failure to open: busy, disconnected mid-read, or no permission
        // for this interface.
        return withHidDevice(info.path, null, (device) => {
            let askedForFullReports = false;
            for (let attempt = 0; attempt < READ_ATTEMPTS$1; attempt++) {
                const report = device.readTimeout(READ_TIMEOUT_MS$1);
                if (!report?.length)
                    continue;
                const bytes = Array.from(report);
                const index = statusIndexOf(bytes, overBluetooth, family);
                if (index !== null && bytes.length > index)
                    return bytes[index];
                // A Bluetooth pad in compatibility mode pads its short report out to
                // the full length, so length alone can't tell them apart — the report
                // id can. Ask for the calibration data once; that flips it to the full
                // report (0x31 on a DualSense, 0x11 on a DualShock 4).
                if (overBluetooth && !askedForFullReports) {
                    askedForFullReports = true;
                    try {
                        device.getFeatureReport(FEATURE_CALIBRATION, FEATURE_CALIBRATION_LENGTH);
                    }
                    catch {
                        // Some stacks refuse feature reads; the next attempts still stand
                        // a chance if something else already switched the pad over.
                    }
                }
            }
            return null;
        });
    }
}
function familyOf(productId) {
    return PRODUCTS.get(productId)?.family ?? "dualsense";
}
/** Which byte holds the status, or null when this report doesn't carry one. */
function statusIndexOf(bytes, overBluetooth, family) {
    if (family === "dualshock4") {
        if (overBluetooth)
            return bytes[0] === REPORT_DS4_BT ? STATUS_INDEX_DS4_BT : null;
        return bytes[0] === REPORT_DS4_USB ? STATUS_INDEX_DS4_USB : null;
    }
    if (overBluetooth)
        return bytes[0] === REPORT_BT ? STATUS_INDEX_BT : null;
    return bytes[0] === REPORT_USB ? STATUS_INDEX_USB : null;
}
/**
 * DualShock 4: one nibble for the level, one bit for the cable.
 *
 * The scale changes with the cable — 0-10 on battery, 0-11 while charging —
 * which is why the two cases divide by different totals. Unverified against
 * hardware; the layout is the one Linux's hid-sony driver uses.
 */
function decodeDualShock4(status, label) {
    const level = status & DS4_LEVEL;
    const cable = (status & DS4_CABLE) !== 0;
    if (cable) {
        if (level >= 11) {
            return { deviceLabel: label, percent: 100, status: "charging", detail: "Charge complete" };
        }
        return { deviceLabel: label, percent: clampPercent((level / 11) * 100), status: "charging" };
    }
    return { deviceLabel: label, percent: clampPercent((level / 10) * 100), status: "ok" };
}
/**
 * Low nibble is the level in units of 10%, high nibble is the charge state.
 * Sony reports the level in 11 steps (0-10), which the +5 centres on the middle
 * of each step rather than its floor.
 */
function decodeStatus(status, label) {
    const level = status & 0x0f;
    const state = (status >> 4) & 0x0f;
    const percent = clampPercent(level * 10 + 5);
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
    if (state === CHARGING$1) {
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

const VENDOR_MICROSOFT = 0x045e;
/** HID usage page 0x01 (Generic Desktop), gamepad. */
const USAGE_PAGE_DESKTOP = 0x01;
const USAGE_GAMEPAD$1 = 0x05;
/** Bluetooth HID service UUIDs, which Windows puts in the device path. */
const BLUETOOTH_PATH$1 = /\{0000112[45]-0000-1000-8000-00805f9b34fb\}/i;
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
class XboxProvider {
    id = "xbox";
    async discover() {
        const devices = await hidDevices(VENDOR_MICROSOFT);
        if (!devices)
            return [];
        const found = [];
        for (const info of devices) {
            if (!isXboxPad(info))
                continue;
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
    async read(device) {
        const devices = await hidDevices(VENDOR_MICROSOFT);
        const serialNumber = String(device.locator.serialNumber ?? "");
        const pads = devices?.filter(isXboxPad) ?? [];
        const info = pads.find((d) => serialNumber !== "" && d.serialNumber === serialNumber) ?? pads[0];
        if (!info) {
            return notFound(device.label, "Controller not connected");
        }
        return this.readFrom(info, device.label);
    }
    async readFrom(info, label) {
        const failed = {
            deviceLabel: label,
            percent: null,
            status: "error",
            detail: "Controller couldn't be opened",
        };
        return withHidDevice(info.path, failed, (device) => {
            // Ask outright first: it costs nothing and doesn't depend on the pad
            // happening to send an update while we listen.
            try {
                const feature = device.getFeatureReport(REPORT_BATTERY, 2);
                if (feature?.length >= 2)
                    return decodeBattery(feature[1], label);
            }
            catch {
                // Not every firmware answers a feature read for this report.
            }
            for (let attempt = 0; attempt < READ_ATTEMPTS; attempt++) {
                const report = device.readTimeout(READ_TIMEOUT_MS);
                if (report?.length && report[0] === REPORT_BATTERY && report.length >= 2) {
                    return decodeBattery(report[1], label);
                }
            }
            return unsupported(label, "Connected, but it didn't send a battery report");
        }, `xbox: ${label}`);
    }
}
/** A Microsoft gamepad on a Bluetooth path — no model list involved. */
function isXboxPad(info) {
    return (info.path !== undefined &&
        info.vendorId === VENDOR_MICROSOFT &&
        info.usagePage === USAGE_PAGE_DESKTOP &&
        info.usage === USAGE_GAMEPAD$1 &&
        BLUETOOTH_PATH$1.test(info.path));
}
function decodeBattery(flags, label) {
    if ((flags & ONLINE) === 0) {
        return notFound(label, "Controller is offline");
    }
    const step = CAPACITY_STEPS[flags & CAPACITY];
    return {
        deviceLabel: label,
        percent: step.percent,
        status: (flags & CHARGING) !== 0 ? "charging" : "ok",
        detail: `${step.word} — the pad reports four steps, not a percentage`,
    };
}

/** Vendors a dedicated provider already enumerates, with its own battery protocol. */
const CLAIMED_VENDORS = new Set([
    0x046d, // Logitech — logitech.ts
    0x0b05, // ASUSTek — asus.ts
    0x054c, // Sony — dualsense.ts
    0x1532, // Razer — razer.ts
]);
/** The Stream Deck running this plugin is not a device anyone wants on a key. */
const ELGATO = 0x0fd9;
/** HID usage page 0x01 (Generic Desktop) usages that identify a form factor. */
const USAGE_MOUSE$1 = 0x02;
const USAGE_JOYSTICK = 0x04;
const USAGE_GAMEPAD = 0x05;
const USAGE_KEYBOARD$1 = 0x06;
/** Bluetooth HID service UUIDs, which Windows puts in the device path. */
const BLUETOOTH_PATH = /\{0000112[45]-0000-1000-8000-00805f9b34fb\}/i;
/**
 * Names that suggest the USB thing enumerating is a radio for something else,
 * so its "plugged in" status says nothing about the peripheral's battery.
 */
const RECEIVER_NAME = /wireless|receiver|dongle|lightspeed|bolt|2\.4\s*g/i;
/**
 * Catch-all: lists every remaining HID device so nothing is invisible, even
 * though none of them report a battery through a protocol this plugin knows.
 *
 * Cable-powered devices are reported as running on mains rather than as a
 * failure to read a battery — a wired keyboard has no battery to be missing.
 * Anything wireless, or anything whose name suggests it's a receiver for a
 * wireless peripheral, is left as "unsupported" instead: there may well be a
 * battery there, this plugin just can't see it.
 */
class GenericHidProvider {
    id = "hid";
    async discover() {
        const devices = await hidDevices();
        if (!devices)
            return [];
        // One physical device exposes several HID interfaces; collapse to one entry
        // per vendor/product, preferring an interface that names a form factor.
        const byProduct = new Map();
        for (const info of devices) {
            if (!info.path)
                continue;
            if (CLAIMED_VENDORS.has(info.vendorId) || info.vendorId === ELGATO)
                continue;
            // Only the pad is claimed, not all of Microsoft's mice and keyboards.
            if (isXboxPad(info))
                continue;
            const id = `${hex4(info.vendorId)}:${hex4(info.productId)}`;
            const kind = kindOf$2(info);
            const existing = byProduct.get(id);
            if (existing && (existing.kind !== "other" || kind === "other"))
                continue;
            const label = labelOf(info);
            byProduct.set(id, {
                key: `hid:${id}`,
                providerId: this.id,
                label,
                kind,
                supportsBattery: false,
                locator: { vendorId: info.vendorId, productId: info.productId },
                reading: readingFor(info, label),
            });
        }
        return [...byProduct.values()];
    }
    async read(device) {
        const devices = await hidDevices();
        const match = devices?.find((d) => d.vendorId === Number(device.locator.vendorId) && d.productId === Number(device.locator.productId));
        if (!match) {
            return { deviceLabel: device.label, percent: null, status: "not-found", detail: "Device not connected" };
        }
        return readingFor(match, device.label);
    }
}
function readingFor(info, label) {
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
function labelOf(info) {
    const product = (info.product ?? "").trim();
    const manufacturer = (info.manufacturer ?? "").trim();
    if (product && manufacturer && !product.toLowerCase().startsWith(manufacturer.toLowerCase())) {
        return `${manufacturer} ${product}`;
    }
    return product || manufacturer || `HID device ${hex4(info.vendorId)}:${hex4(info.productId)}`;
}
function kindOf$2(info) {
    if (info.usagePage === 0x01) {
        if (info.usage === USAGE_KEYBOARD$1)
            return "keyboard";
        if (info.usage === USAGE_MOUSE$1)
            return "mouse";
        if (info.usage === USAGE_GAMEPAD || info.usage === USAGE_JOYSTICK)
            return "gamepad";
    }
    // Model names, since a gaming peripheral rarely says what it is: an "Arctis
    // Nova Pro" or a "Scimitar" names itself and nothing else.
    const name = (info.product ?? "").toLowerCase();
    if (/keyboard|keypad|k[0-9]{2,3}\b|apex|strafe|huntsman|blackwidow|keychron/.test(name))
        return "keyboard";
    if (/mouse|trackball|rival|sensei|aerox|scimitar|harpoon|ironclaw|dark core|model o|model d/.test(name)) {
        return "mouse";
    }
    if (/buds|earbud|airpods|hammerhead/.test(name))
        return "earbuds";
    if (/headset|headphone|cloud|arctis|virtuoso|void|kraken|barracuda|stealth|blackshark|nova\b/.test(name)) {
        return "headset";
    }
    if (/controller|gamepad|joystick|wolverine|raiju/.test(name))
        return "gamepad";
    if (/mic\b|microphone|solocast|quadcast|yeti|wave|seiren|blue\b/.test(name))
        return "microphone";
    if (/speaker|soundbar|nommo|leviathan/.test(name))
        return "speaker";
    if (/watch|band\b/.test(name))
        return "watch";
    return "other";
}

/**
 * Turns an expensive fetch into one that several callers can share.
 *
 * The two exec-based providers each run a command that already returns *every*
 * device it knows about, but they were called once per key: eight keys bound to
 * the same provider meant eight `powershell.exe` processes on every poll tick,
 * all asking the same question. This holds the answer for a moment and hands the
 * same in-flight promise to anyone who asks while it's still running.
 *
 * The same shape as the cache in {@link DeviceDiscovery}, extracted because a
 * second and third copy of it were about to be written.
 */
function coalesce(fetch, ttlMs) {
    let cache;
    let inflight;
    return () => {
        if (cache && Date.now() - cache.at < ttlMs)
            return Promise.resolve(cache.value);
        inflight ??= fetch()
            .then((value) => {
            cache = { at: Date.now(), value };
            return value;
        })
            .finally(() => {
            inflight = undefined;
        });
        return inflight;
    };
}

/** Shared by the provider and the free functions its parsing was split into. */
const PROVIDER_ID = "headset";
const execFileAsync$1 = node_util.promisify(node_child_process.execFile);
const TIMEOUT_MS$1 = 6000;
/**
 * How long one CLI result is reused. Short for the same reason as its Bluetooth
 * counterpart: it collapses the rescan-then-read pair a single key press causes,
 * without holding a level long enough for anyone to see it go stale.
 *
 * {@link findHeadsetControl} deliberately doesn't share this — the panel calls it
 * to answer "is the tool installed?", and someone who has just installed it and
 * hit refresh needs a real answer, not a cached "no".
 */
const RUN_TTL_MS = 2000;
/**
 * Candidate locations for the HeadsetControl binary, tried in order. A bare
 * name ("headsetcontrol.exe") relies on PATH; the fully-qualified paths are the
 * default install locations so the plugin keeps working even when Stream Deck's
 * process environment doesn't have our PATH change (a fresh PATH entry isn't
 * picked up by the already-running, often-elevated Stream Deck app until the
 * user fully signs out/in).
 */
function candidateBinaries() {
    if (process.env.HEADSETCONTROL_PATH)
        return [process.env.HEADSETCONTROL_PATH];
    if (process.platform === "win32") {
        const localAppData = process.env.LOCALAPPDATA ?? node_path.join(node_os.homedir(), "AppData", "Local");
        const paths = ["headsetcontrol.exe", node_path.join(localAppData, "Programs", "HeadsetControl", "headsetcontrol.exe")];
        if (process.env.ProgramFiles)
            paths.push(node_path.join(process.env.ProgramFiles, "HeadsetControl", "headsetcontrol.exe"));
        return paths;
    }
    return [
        "headsetcontrol",
        "/opt/homebrew/bin/headsetcontrol",
        "/usr/local/bin/headsetcontrol",
        "/usr/bin/headsetcontrol",
    ];
}
/**
 * A JSON field as a string, or "" for anything that isn't one.
 *
 * HeadsetControl's output shape has changed across releases (see {@link
 * HeadsetControlProvider.parse}), so a field that's a string today may be an
 * object or a number tomorrow. Coercing here keeps a surprise from reaching
 * `slug()` or a `.trim()` further down, where it would throw.
 */
function text(value) {
    return typeof value === "string" ? value : "";
}
/**
 * Wireless headsets have no public API/SDK (NGENUITY and friends don't expose
 * one), so we shell out to HeadsetControl — https://github.com/Sapd/HeadsetControl —
 * an open-source CLI that has already reverse-engineered the battery HID report
 * for ~100 headsets and ships prebuilt Windows/macOS/Linux binaries.
 *
 * Whatever HeadsetControl reports is what we list: no headset model is hard-coded
 * here, so plugging in a different supported headset just makes it show up.
 */
class HeadsetControlProvider {
    id = PROVIDER_ID;
    async discover() {
        const output = await this.run();
        if (!output.ok)
            return [];
        try {
            return parseDevices(output.stdout);
        }
        catch (err) {
            // The contract is that a scan never throws: one provider tripping over an
            // unfamiliar payload must not cost the user every other device.
            log.warn(`headsetcontrol: could not read the device list: ${String(err)}`);
            return [];
        }
    }
    async read(device) {
        const label = device.label;
        const output = await this.run();
        if (!output.ok) {
            return { deviceLabel: label, percent: null, status: "error", detail: output.detail };
        }
        let match;
        try {
            match = parseDevices(output.stdout).find((d) => d.key === device.key);
        }
        catch (err) {
            log.warn(`headsetcontrol: could not read ${device.key}: ${String(err)}`);
            return { deviceLabel: label, percent: null, status: "error", detail: "Unreadable HeadsetControl output" };
        }
        if (!match?.reading) {
            return { deviceLabel: label, percent: null, status: "not-found", detail: "Headset offline or asleep" };
        }
        return match.reading;
    }
    /**
     * One CLI run serves every key. `-b` already reports every headset it can
     * see, so asking once per key only multiplied the process count — and each
     * ask re-probed the candidate paths before it could even start.
     */
    run = coalesce(() => this.exec(), RUN_TTL_MS);
    /** Runs the CLI at the first candidate path that exists. */
    async exec() {
        let lastError;
        for (const binary of candidateBinaries()) {
            try {
                const { stdout } = await execFileAsync$1(binary, ["-o", "JSON", "-b"], {
                    timeout: TIMEOUT_MS$1,
                    windowsHide: true,
                });
                return { ok: true, stdout };
            }
            catch (err) {
                // ENOENT just means this candidate path doesn't exist — try the next one.
                if (err?.code === "ENOENT")
                    continue;
                // A non-zero exit still prints usable JSON on some versions.
                if (typeof err?.stdout === "string" && err.stdout.trim().startsWith("{")) {
                    return { ok: true, stdout: err.stdout };
                }
                lastError = String(err?.message ?? err);
            }
        }
        return {
            ok: false,
            detail: lastError ?? "HeadsetControl not found. Install it: https://github.com/Sapd/HeadsetControl/releases",
        };
    }
}
/**
 * Accepts both the v3 shape (`{devices:[{device,vendor,product,battery:{...}}]}`)
 * and the older nested one (`{devices:[{device,status:{battery:{...}}}]}`).
 */
function parseDevices(stdout) {
    let json;
    try {
        json = JSON.parse(stdout);
    }
    catch {
        // Very old builds print plain text like "Battery: 75%". No device name
        // to key off, so expose it as a single generic entry.
        const match = stdout.match(/(\d{1,3})\s*%/);
        if (!match)
            return [];
        const label = "Headset";
        return [
            {
                key: "headset:unknown",
                providerId: PROVIDER_ID,
                label,
                kind: "headset",
                supportsBattery: true,
                locator: {},
                reading: { deviceLabel: label, percent: Number(match[1]), status: "ok" },
            },
        ];
    }
    const raw = Array.isArray(json?.devices) ? json.devices : Array.isArray(json) ? json : [json];
    return raw
        .filter((d) => d && typeof d === "object")
        .map((d) => toDevice(d))
        .filter((d) => d !== null);
}
function toDevice(raw) {
    const vendor = text(raw.vendor);
    const product = text(raw.product);
    const label = text(raw.device) || [vendor, product].filter(Boolean).join(" ") || text(raw.name) || "Headset";
    const idVendor = text(raw.id_vendor ?? raw.idVendor);
    const idProduct = text(raw.id_product ?? raw.idProduct);
    const key = idVendor && idProduct ? `headset:${idVendor}:${idProduct}` : `headset:${slug(label) || "unknown"}`;
    return {
        key,
        providerId: PROVIDER_ID,
        label,
        kind: "headset",
        supportsBattery: true,
        locator: { idVendor, idProduct },
        reading: toReading$1(label, raw),
    };
}
function toReading$1(label, raw) {
    const battery = raw.battery ?? raw.status?.battery;
    if (!battery || typeof battery !== "object")
        return undefined;
    if (battery.level === undefined || battery.level === null)
        return undefined;
    // HeadsetControl explains itself ("Device is offline or not responding"),
    // which beats anything we'd guess at.
    const reported = text(raw.errors?.battery);
    const offline = reported
        ? `Headset offline: ${reported}`
        : "Headset offline or asleep — the dongle is connected but the headset isn't answering";
    const status = String(battery.status ?? "");
    if (status === "BATTERY_UNAVAILABLE" || status === "BATTERY_TIMEOUT" || status === "BATTERY_HIDERROR") {
        return { deviceLabel: label, percent: null, status: "not-found", detail: offline };
    }
    const percent = Number(battery.level);
    if (!Number.isFinite(percent) || percent < 0) {
        return { deviceLabel: label, percent: null, status: "not-found", detail: offline };
    }
    return {
        deviceLabel: label,
        percent: clampPercent(percent),
        status: status === "BATTERY_CHARGING" ? "charging" : "ok",
    };
}

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
const DEVICE_TYPES = {
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
class LogitechProvider {
    id = "logitech";
    async discover() {
        const endpoints = await hidppEndpoints();
        const found = [];
        const seen = new Set();
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
    async read(device) {
        const productId = Number(device.locator.productId);
        const deviceIndex = Number(device.locator.deviceIndex);
        const endpoints = (await hidppEndpoints()).filter((e) => e.productId === productId);
        if (endpoints.length === 0) {
            return { deviceLabel: device.label, percent: null, status: "not-found", detail: "Receiver not connected" };
        }
        let result = null;
        for (const endpoint of endpoints) {
            if (result)
                break;
            await withLink(endpoint, async (link) => {
                if (!(await ping(link, deviceIndex, BATTERY_TIMEOUT_MS, BATTERY_ATTEMPTS)))
                    return;
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
        return (result ?? {
            deviceLabel: device.label,
            percent: null,
            status: "not-found",
            detail: "No answer after two tries — powered off or out of range",
        });
    }
    async probe(link, deviceIndex, endpoint) {
        if (!(await ping(link, deviceIndex)))
            return null;
        const nameIndex = await featureIndex(link, deviceIndex, FEATURE_DEVICE_NAME);
        const name = nameIndex ? await readName(link, deviceIndex, nameIndex) : null;
        const typeCode = nameIndex ? await readDeviceType(link, deviceIndex, nameIndex) : null;
        const type = typeCode !== null ? DEVICE_TYPES[typeCode] : undefined;
        // A receiver answering for itself isn't a battery-bearing peripheral.
        if (type?.name === "Receiver")
            return null;
        const feature = await findBatteryFeature(link, deviceIndex);
        if (!name && !feature)
            return null;
        const label = name ?? `Logitech device ${hex4(endpoint.productId)}:${deviceIndex}`;
        const unitId = await readUnitId(link, deviceIndex);
        const key = unitId ? `logitech:${unitId}` : `logitech:${hex4(endpoint.productId)}:${deviceIndex.toString(16)}`;
        const reading = feature
            ? await readBattery(link, deviceIndex, feature, label)
            : {
                deviceLabel: label,
                percent: null,
                status: "unsupported",
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
function endpointKey(path) {
    return path
        .replace(/&Col\d+/i, "")
        .replace(/#\{[0-9a-f-]+\}$/i, "")
        .replace(/&\d{4}$/, "");
}
/** Every Logitech HID++ endpoint on the machine. */
async function hidppEndpoints() {
    const devices = await hidDevices(VENDOR_ID);
    if (!devices)
        return [];
    const withPath = devices.filter((d) => !!d.path);
    const vendorCollections = withPath.filter((d) => d.usagePage === HIDPP_USAGE_PAGE);
    // Some platforms/drivers don't report usagePage; then try every interface.
    const pool = vendorCollections.length > 0 ? vendorCollections : withPath.filter((d) => d.usagePage === undefined);
    const endpoints = new Map();
    for (const info of pool) {
        const key = endpointKey(info.path);
        const endpoint = endpoints.get(key) ?? { key, productId: info.productId };
        if (info.usage === HIDPP_USAGE_LONG)
            endpoint.long = info;
        else if (info.usage === HIDPP_USAGE_SHORT)
            endpoint.short = info;
        else
            endpoint.short ??= info; // platform doesn't split collections
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
    short;
    long;
    constructor(short, long) {
        this.short = short;
        this.long = long;
    }
    get usable() {
        return !!(this.short || this.long);
    }
    /**
     * Sends one request and waits for the matching response. Resolves null on an
     * error response or timeout, so callers can treat "unsupported" and "absent"
     * the same way.
     */
    request(deviceIndex, featureIdx, functionId, params = [], preferLong = false, timeoutMs = RESPONSE_TIMEOUT_MS) {
        const target = preferLong ? (this.long ?? this.short) : (this.short ?? this.long);
        if (!target)
            return Promise.resolve(null);
        const long = target === this.long;
        const length = long ? LONG_LEN : SHORT_LEN;
        const report = new Array(length).fill(0);
        const funcByte = ((functionId & 0x0f) << 4) | SW_ID;
        report[0] = long ? LONG_REPORT_ID : SHORT_REPORT_ID;
        report[1] = deviceIndex;
        report[2] = featureIdx;
        report[3] = funcByte;
        for (let i = 0; i < params.length && 4 + i < length; i++)
            report[4 + i] = params[i] & 0xff;
        const listeners = [this.short, this.long].filter((d) => !!d);
        return new Promise((resolve) => {
            let settled = false;
            // Declared up here because `finish` below closes over it, and `finish`
            // has to exist before the listener that can call it is registered.
            // eslint-disable-next-line prefer-const
            let timer;
            const finish = (value) => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(timer);
                for (const device of listeners)
                    device.removeListener("data", onData);
                resolve(value);
            };
            const onData = (data) => {
                const bytes = Array.from(data);
                if (bytes[1] !== deviceIndex)
                    return;
                // Success: same feature index and same function/software id echoed back.
                if (bytes[2] === featureIdx && bytes[3] === funcByte)
                    finish(bytes);
                // Error: 0x8f (HID++ 1.0) / 0xff (HID++ 2.0), original request in bytes 3-4.
                else if ((bytes[2] === ERR_HIDPP20 || bytes[2] === ERR_HIDPP10) &&
                    bytes[3] === featureIdx &&
                    bytes[4] === funcByte)
                    finish(null);
            };
            for (const device of listeners)
                device.on("data", onData);
            timer = setTimeout(() => finish(null), timeoutMs);
            try {
                target.write(report);
            }
            catch {
                finish(null);
            }
        });
    }
}
async function withLink(endpoint, fn) {
    const HID = await loadHid();
    if (!HID)
        return;
    const open = (info) => {
        if (!info?.path)
            return undefined;
        try {
            return new HID.HID(info.path);
        }
        catch {
            // Interface busy (G HUB holds some exclusively) or gone.
            return undefined;
        }
    };
    const short = open(endpoint.short);
    const long = open(endpoint.long);
    try {
        const link = new HidppLink(short, long);
        if (link.usable)
            await fn(link);
    }
    catch {
        // A provider must never take down a scan.
    }
    finally {
        for (const device of [short, long]) {
            try {
                device?.close();
            }
            catch {
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
async function ping(link, deviceIndex, timeoutMs = RESPONSE_TIMEOUT_MS, attempts = 1) {
    for (let attempt = 0; attempt < attempts; attempt++) {
        const resp = await link.request(deviceIndex, FEATURE_ROOT, 0x01, [0x00, 0x00, PING_MARKER], false, timeoutMs);
        if (resp !== null && resp[6] === PING_MARKER)
            return true;
    }
    return false;
}
async function featureIndex(link, deviceIndex, featureId) {
    const resp = await link.request(deviceIndex, FEATURE_ROOT, 0x00, [(featureId >> 8) & 0xff, featureId & 0xff, 0x00]);
    if (!resp)
        return null;
    const index = resp[4];
    return index > 0 ? index : null;
}
async function findBatteryFeature(link, deviceIndex) {
    const unified = await featureIndex(link, deviceIndex, FEATURE_BATTERY_UNIFIED);
    if (unified)
        return { index: unified, unified: true };
    const legacy = await featureIndex(link, deviceIndex, FEATURE_BATTERY_LEGACY);
    if (legacy)
        return { index: legacy, unified: false };
    return null;
}
async function readBattery(link, deviceIndex, feature, label) {
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
    }
    else {
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
async function requestBattery(link, deviceIndex, featureIdx, functionId) {
    for (let attempt = 0; attempt < BATTERY_ATTEMPTS; attempt++) {
        const resp = await link.request(deviceIndex, featureIdx, functionId, [], false, BATTERY_TIMEOUT_MS);
        if (resp)
            return resp;
    }
    return null;
}
/** Feature 0x0005: the device's own product name, read in chunks. */
async function readName(link, deviceIndex, nameIndex) {
    const count = await link.request(deviceIndex, nameIndex, 0x00);
    const length = count?.[4] ?? 0;
    if (!length)
        return null;
    let name = "";
    while (name.length < length && name.length < 64) {
        const before = name.length;
        const chunk = await link.request(deviceIndex, nameIndex, 0x01, [name.length], true);
        if (!chunk)
            break;
        for (let i = 4; i < chunk.length && name.length < length; i++) {
            const code = chunk[i];
            if (code === 0)
                break;
            name += String.fromCharCode(code);
        }
        if (name.length === before)
            break;
    }
    return name.trim() || null;
}
/** Feature 0x0005 getDeviceType. */
async function readDeviceType(link, deviceIndex, nameIndex) {
    const resp = await link.request(deviceIndex, nameIndex, 0x02);
    return resp ? resp[4] : null;
}
/**
 * Feature 0x0003 getDeviceInfo: the 4-byte unit id is unique per physical unit,
 * which makes it the right thing to persist in settings — unlike the HID path,
 * it survives replugging and rebooting.
 */
async function readUnitId(link, deviceIndex) {
    const infoIndex = await featureIndex(link, deviceIndex, FEATURE_DEVICE_INFO);
    if (!infoIndex)
        return null;
    const resp = await link.request(deviceIndex, infoIndex, 0x00, [], true);
    if (!resp || resp.length < 9)
        return null;
    const unit = resp
        .slice(5, 9)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    return unit === "00000000" ? null : unit;
}

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
class RazerProvider {
    id = "razer";
    async discover() {
        const devices = await hidDevices(VENDOR_RAZER);
        if (!devices)
            return [];
        // One device exposes several interfaces; only some accept the control
        // protocol, so each product is tried once and its working interface kept.
        const byProduct = new Map();
        for (const info of devices) {
            if (!info.path)
                continue;
            const list = byProduct.get(info.productId) ?? [];
            list.push(info);
            byProduct.set(info.productId, list);
        }
        const found = [];
        for (const [productId, interfaces] of byProduct) {
            const label = (interfaces.find((i) => i.product)?.product ?? "").trim() || `Razer device ${hex4(productId)}`;
            const answer = await this.findChannel(interfaces);
            const device = {
                key: `razer:${hex4(productId)}`,
                providerId: this.id,
                label,
                kind: kindOf$1(interfaces, label),
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
    async read(device) {
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
    async findChannel(interfaces, transactionIds = TRANSACTION_IDS) {
        const label = (interfaces.find((i) => i.product)?.product ?? "Razer device").trim();
        for (const info of interfaces) {
            for (const transactionId of transactionIds) {
                const level = await this.exchange(info, transactionId, CMD_BATTERY);
                if (level === undefined)
                    continue;
                // A sleeping device answers 0; that's "no reading", not "flat".
                const percent = clampPercent((level / 255) * 100);
                if (percent <= 0)
                    continue;
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
    async exchange(info, transactionId, commandId) {
        // undefined on a failure to open: the wrong interface for this protocol,
        // or a device busy elsewhere, which is what the probe loop expects.
        return withHidDevice(info.path, undefined, async (device) => {
            device.sendFeatureReport([REPORT_ID, ...buildReport(transactionId, commandId)]);
            await sleep(REPLY_DELAY_MS);
            const reply = device.getFeatureReport(REPORT_ID, REPORT_LENGTH + 1);
            if (!reply?.length)
                return undefined;
            // Offsets shift by one: node-hid puts the report id in front.
            const status = reply[1];
            const commandClass = reply[7];
            const answeredId = reply[8];
            if (status !== STATUS_OK || commandClass !== CLASS_POWER || answeredId !== commandId)
                return undefined;
            return reply[10];
        });
    }
}
function buildReport(transactionId, commandId) {
    const report = new Array(REPORT_LENGTH).fill(0);
    report[1] = transactionId;
    report[5] = 0x02; // data size
    report[6] = CLASS_POWER;
    report[7] = commandId;
    let crc = 0;
    for (let i = 2; i < 88; i++)
        crc ^= report[i];
    report[88] = crc;
    return report;
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function kindOf$1(interfaces, label) {
    for (const info of interfaces) {
        if (info.usagePage !== 0x01)
            continue;
        if (info.usage === USAGE_MOUSE)
            return "mouse";
        if (info.usage === USAGE_KEYBOARD)
            return "keyboard";
    }
    const name = label.toLowerCase();
    if (/kraken|barracuda|nari|thresher|blackshark|headset/.test(name))
        return "headset";
    if (/hammerhead|earbud/.test(name))
        return "earbuds";
    if (/basilisk|deathadder|viper|naga|orochi|lancehead|mamba|pro click|mouse/.test(name))
        return "mouse";
    if (/blackwidow|huntsman|ornata|cynosa|deathstalker|keyboard/.test(name))
        return "keyboard";
    if (/seiren|microphone/.test(name))
        return "microphone";
    if (/leviathan|nommo|speaker/.test(name))
        return "speaker";
    if (/wolverine|raiju|kishi|controller/.test(name))
        return "gamepad";
    if (/tartarus|orbweaver|nostromo/.test(name))
        return "keyboard";
    log.info(`razer: no form factor matched for "${label}"`);
    return "other";
}

const execFileAsync = node_util.promisify(node_child_process.execFile);
const TIMEOUT_MS = 20000;
/**
 * DEVPKEY_Bluetooth_Battery. Windows mirrors the GATT Battery Service level of a
 * connected Bluetooth LE device into this PnP device property, which is how the
 * Settings app shows peripheral battery percentages.
 */
const BATTERY_PROPERTY = "{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2";
/**
 * Two things here are performance-critical, because this runs while the property
 * inspector waits on the device list:
 *
 *  - Only the top-level `BTHENUM\DEV_*` / `BTHLE\DEV_*` nodes can carry the
 *    battery property. The Bluetooth class also contains a service node per
 *    profile per device (49 nodes vs 8 real devices on the dev machine), and
 *    each property read is a separate CIM round-trip at ~0.7s.
 *  - Piping into Get-PnpDeviceProperty is far cheaper than calling it per
 *    device in a loop.
 *
 * Together those take the scan from ~34s to ~2s.
 */
const SCRIPT = [
    "$ErrorActionPreference='SilentlyContinue';",
    `$key='${BATTERY_PROPERTY}';`,
    "$devices = Get-PnpDevice -Class Bluetooth -PresentOnly |",
    "  Where-Object { $_.InstanceId -like 'BTHLE\\DEV_*' -or $_.InstanceId -like 'BTHENUM\\DEV_*' };",
    "$names = @{};",
    "foreach ($d in $devices) { $names[$d.InstanceId] = $d.FriendlyName }",
    // Devices without the property are kept, with a null level: they're still
    // real paired peripherals worth listing, they just can't report a level.
    "$out = $devices | Get-PnpDeviceProperty -KeyName $key |",
    "  ForEach-Object { [pscustomobject]@{",
    "    id=$_.InstanceId; name=$names[$_.InstanceId];",
    "    level=$(if ($_.Data -ne $null) { [int]$_.Data } else { $null }) } };",
    "ConvertTo-Json -InputObject @($out) -Compress",
].join(" ");
/**
 * How long one PowerShell result is reused.
 *
 * Deliberately short. A single key press already asks twice — the rescan behind
 * `discovery.list(force)` and then the direct `read()` for that one device — and
 * this collapses that pair into one process without letting a later poll be
 * served anything a user would notice as stale.
 */
const QUERY_TTL_MS = 2000;
/**
 * Detects Bluetooth peripherals that report battery to Windows itself. This is
 * the only vendor-independent source of battery levels on the machine, so it
 * picks up keyboards, mice and controllers no dedicated provider knows about —
 * as long as they're paired over Bluetooth rather than a proprietary 2.4 GHz
 * dongle (dongle-connected devices are invisible to the OS battery property).
 */
class WindowsBluetoothProvider {
    id = "winbt";
    /**
     * The PnP property is a bare percentage. Windows keeps a Boolean next to it
     * ({104EA319-…} 3) that looks like it should be a charging flag, but it stays
     * False on a phone whose level is visibly climbing, so it isn't one.
     */
    reportsCharging = false;
    async discover() {
        const entries = await this.query();
        return entries.map((entry) => ({
            key: `winbt:${slug(entry.id)}`,
            providerId: this.id,
            label: entry.name.trim() || "Bluetooth device",
            kind: kindOf(entry.name),
            supportsBattery: entry.level !== null,
            locator: { instanceId: entry.id },
            reading: toReading(entry),
        }));
    }
    async read(device) {
        if (process.platform !== "win32") {
            return { deviceLabel: device.label, percent: null, status: "unsupported", detail: "Windows only" };
        }
        const entries = await this.query();
        const match = entries.find((e) => `winbt:${slug(e.id)}` === device.key);
        if (!match) {
            return {
                deviceLabel: device.label,
                percent: null,
                status: "not-found",
                detail: "Bluetooth device disconnected",
            };
        }
        return toReading(match);
    }
    /**
     * One PowerShell run serves every key. The script already enumerates all
     * paired devices, so asking once per key only multiplied the process count.
     */
    query = coalesce(() => this.runScript(), QUERY_TTL_MS);
    async runScript() {
        if (process.platform !== "win32")
            return [];
        try {
            const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", SCRIPT], { timeout: TIMEOUT_MS, windowsHide: true });
            const parsed = JSON.parse(stdout.trim() || "[]");
            const list = Array.isArray(parsed) ? parsed : [parsed];
            // Everything downstream trusts these three fields, so they're pinned to
            // their types here rather than checked again at each use. A missing
            // property comes back as JSON null, and Number(null) is 0 — which would
            // report a healthy device as flat. Only a real number counts.
            return list
                .filter((e) => !!e && typeof e === "object")
                .filter((e) => typeof e.id === "string")
                .map((e) => ({
                id: e.id,
                name: typeof e.name === "string" ? e.name : "",
                level: typeof e.level === "number" && Number.isFinite(e.level) ? e.level : null,
            }));
        }
        catch (err) {
            // PowerShell missing/blocked, or no Bluetooth stack — just contribute
            // nothing. Logged because an empty list is otherwise indistinguishable
            // from a machine that genuinely has no paired devices.
            log.warn(`windows-bluetooth: could not read paired devices: ${String(err)}`);
            return [];
        }
    }
}
function toReading(entry) {
    const label = entry.name.trim() || "Bluetooth device";
    // Only Bluetooth LE devices that implement the GATT battery service get the
    // property. A Classic device without it may well have a battery Windows can't
    // see (AirPods report theirs over Apple's own protocol), so this says
    // "unreadable", not "mains" — the key's power-source setting is how you tell
    // it the thing is permanently plugged in.
    if (entry.level === null) {
        return {
            deviceLabel: label,
            percent: null,
            status: "unsupported",
            detail: "Paired, but Windows has no battery level for it",
        };
    }
    const percent = clampPercent(entry.level);
    // Windows exposes the GATT level only; there is no charging flag in this property.
    return { deviceLabel: label, percent, status: "ok" };
}
/**
 * Best guess at a form factor from the name Windows shows. A Bluetooth device
 * does advertise a class-of-device code, but the PnP property that carries it
 * isn't exposed here, and the name is what the user recognises anyway.
 */
function kindOf(name) {
    const value = name.toLowerCase();
    if (/keyboard|keychron|azoth|kbd/.test(value))
        return "keyboard";
    if (/mouse|mx |trackball/.test(value))
        return "mouse";
    if (/buds|earbud|airpods|pods\b|freebuds/.test(value))
        return "earbuds";
    if (/headset|headphone|arctis|cloud|wh-|beats|bose|jbl tune/.test(value))
        return "headset";
    if (/controller|gamepad|dualsense|dualshock|xbox|joy-con/.test(value))
        return "gamepad";
    if (/watch|band\b|fitbit|garmin/.test(value))
        return "watch";
    if (/ipad|tab\b|tablet/.test(value))
        return "tablet";
    if (/iphone|phone|pixel|galaxy s|oneplus|xperia/.test(value))
        return "phone";
    if (/speaker|nest|echo|sonos|soundbar|homepod|boom|flip\b/.test(value))
        return "speaker";
    if (/mic\b|microphone|solocast|quadcast|yeti|podcast|wave:/.test(value))
        return "microphone";
    return "other";
}

/**
 * Every provider is asked to enumerate what it can see; nothing is registered
 * per-model. Adding support for a new device family means adding a provider
 * here, not adding an entry to a device list.
 */
const providers = [
    new HeadsetControlProvider(),
    new LogitechProvider(),
    new AsusProvider(),
    new RazerProvider(),
    new DualSenseProvider(),
    new XboxProvider(),
    new WindowsBluetoothProvider(),
    // Last: its entries are dropped wherever a real provider covers the same
    // hardware (see mergeGeneric).
    new GenericHidProvider(),
];
const providersById = new Map(providers.map((p) => [p.id, p]));
/** A scan opens HID interfaces and shells out, so results are reused briefly. */
const CACHE_TTL_MS = 10_000;
/** Desk peripherals first, then things that merely happen to be paired. */
const KIND_ORDER = {
    headset: 0,
    earbuds: 1,
    mouse: 2,
    keyboard: 3,
    gamepad: 4,
    microphone: 5,
    speaker: 6,
    phone: 7,
    tablet: 8,
    watch: 9,
    other: 10,
};
class DeviceDiscovery {
    cache;
    inflight;
    /** Lists everything detected on this machine, right now. */
    async list(force = false) {
        if (force)
            this.invalidate();
        if (this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) {
            return this.cache.devices;
        }
        // Serialize: concurrent scans would fight over exclusive HID handles.
        this.inflight ??= this.scan().finally(() => {
            this.inflight = undefined;
        });
        return this.inflight;
    }
    async find(key, force = false) {
        return (await this.list(force)).find((d) => d.key === key);
    }
    invalidate() {
        this.cache = undefined;
    }
    provider(id) {
        return providersById.get(id);
    }
    async scan() {
        const started = Date.now();
        const results = await Promise.allSettled(providers.map((p) => p.discover()));
        const found = [];
        results.forEach((result, i) => {
            if (result.status === "fulfilled")
                found.push(...result.value);
            else
                log.warn(`discovery: provider ${providers[i].id} failed`, result.reason);
        });
        const devices = mergeGeneric(found);
        // Devices that can actually report a level come first: the picker defaults
        // to the top entry, and the catch-all list is long.
        devices.sort((a, b) => Number(b.supportsBattery) - Number(a.supportsBattery) ||
            KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
            a.label.localeCompare(b.label));
        log.info(`discovery: found ${devices.length} device(s) in ${Date.now() - started}ms`);
        this.cache = { at: Date.now(), devices };
        return devices;
    }
}
const discovery = new DeviceDiscovery();
/**
 * Drops entries for hardware another provider described better.
 *
 * One device can legitimately reach two providers: a DualSense is both a Sony
 * HID device and a paired Bluetooth node, and a HyperX headset is both a
 * HeadsetControl device and a plain HID interface. Only one of those knows how
 * to read its battery, and the picker shouldn't offer the other.
 *
 * Names are what's available to match on — they all come from the device's own
 * product string — so they're compared loosely: the HID layer prefixes the
 * manufacturer ("HP, Inc HyperX Cloud Alpha Wireless") where HeadsetControl
 * doesn't. A false match only costs a duplicate entry that said less than the
 * one it was dropped for.
 */
function mergeGeneric(devices) {
    const readable = devices.filter((d) => d.supportsBattery).map((d) => normalize(d.label));
    return devices.filter((device) => {
        if (device.supportsBattery)
            return true;
        // Fallback entries lose to anything; a provider-specific entry only loses
        // to one that can actually report a level.
        const name = normalize(device.label);
        return !readable.some((other) => sameDevice(name, other));
    });
}
/**
 * Loose name match, but only loose enough to survive a manufacturer prefix.
 * Substring matching on a short name would collide with anything ("4" is a real
 * Bluetooth friendly name on the dev machine), so that falls back to equality.
 */
const MIN_SUBSTRING_MATCH = 6;
function sameDevice(a, b) {
    if (a === b)
        return true;
    const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
    return shorter.length >= MIN_SUBSTRING_MATCH && longer.includes(shorter);
}
function normalize(label) {
    return label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

/**
 * Standalone device scan — the same discovery the plugin uses, printed to the
 * terminal. Run it on the machine that runs Stream Deck to check what actually
 * gets detected, without having to read the plugin logs:
 *
 *   npm run scan
 */
setLogger({ info: (m, ...a) => console.log(m, ...a), warn: (m, ...a) => console.warn(m, ...a) });
async function main() {
    const devices = await discovery.list(true);
    if (devices.length === 0) {
        console.log("\nNo devices detected.");
        console.log("- Headsets need HeadsetControl on PATH (or HEADSETCONTROL_PATH set).");
        console.log("- HID providers need node-hid: run `npm run sync-deps`.");
        return;
    }
    console.log("");
    for (const device of devices) {
        const reading = device.reading ?? (await discovery.provider(device.providerId)?.read(device));
        const level = reading?.percent !== null && reading?.percent !== undefined ? `${reading.percent}%` : "--";
        console.log(`${device.label}`);
        console.log(`  key      ${device.key}`);
        console.log(`  provider ${device.providerId}   kind ${device.kind}`);
        console.log(`  battery  ${level} (${reading?.status ?? "unknown"})${reading?.detail ? ` — ${reading.detail}` : ""}`);
        console.log("");
    }
}
main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
