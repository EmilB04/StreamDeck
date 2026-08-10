// Read-only probe for Sony DualSense battery reporting.
//
// Opens every Sony HID interface, listens for input reports, and decodes the
// byte that should hold the battery level so it can be checked against what the
// controller actually shows. Nothing is written to the device: the one request
// it makes is GET_FEATURE 0x05, which is a read (over Bluetooth it also makes
// the controller switch from its 10-byte minimal reports to the full 78-byte
// ones — the same thing every game does when it grabs the pad).
//
//   node scripts/dualsense-probe.mjs
import HID from "node-hid";

const VENDOR_SONY = 0x054c;
const LISTEN_MS = 1500;

const hex = (bytes) => Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join(" ");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Sony's status byte: low nibble is the level in units of 10%, high nibble is
 * the charging state. This is the layout hid-playstation uses on Linux.
 */
function decodeStatus(status) {
	const raw = status & 0x0f;
	const charging = (status >> 4) & 0x0f;
	const percent = Math.min(raw * 10 + 5, 100);
	const state =
		{ 0x0: "discharging", 0x1: "charging", 0x2: "full", 0xa: "temp error", 0xb: "temp error", 0xf: "error" }[
			charging
		] ?? `unknown (0x${charging.toString(16)})`;
	return `raw=${raw} -> ${percent}%, ${state}`;
}

function report(bytes) {
	const id = bytes[0];
	console.log(`    INPUT id=0x${id.toString(16).padStart(2, "0")} len=${bytes.length}: ${hex(bytes.slice(0, 16))} …`);

	// Both offsets are printed rather than assumed: the struct is the same over
	// USB and Bluetooth, but the Bluetooth report carries one extra header byte.
	for (const [transport, index] of [
		["USB (id 0x01)", 53],
		["BT (id 0x31)", 54],
	]) {
		const status = bytes[index];
		if (status === undefined) continue;
		console.log(`        [${index}] = 0x${status.toString(16).padStart(2, "0")}  ${transport}: ${decodeStatus(status)}`);
	}
}

const devices = HID.devices().filter((d) => d.vendorId === VENDOR_SONY && d.path);
console.log(`Found ${devices.length} Sony HID interface(s)\n`);

for (const info of devices) {
	const overBluetooth = /\{0000112[45]-0000-1000-8000-00805f9b34fb\}/i.test(info.path);
	console.log(`=== ${info.product ?? "?"}  pid=0x${info.productId.toString(16)} ${overBluetooth ? "[bluetooth]" : "[usb]"}`);
	console.log(`    ${info.path}`);

	let device;
	try {
		device = new HID.HID(info.path);
	} catch (err) {
		console.log(`    ! open failed: ${err.message}\n`);
		continue;
	}

	const seen = [];
	device.on("data", (d) => seen.push(Array.from(d)));
	device.on("error", () => {});

	await sleep(LISTEN_MS);
	console.log(`    before GET_FEATURE 0x05: ${seen.length} report(s)`);
	for (const bytes of seen.slice(0, 2)) report(bytes);

	// Over Bluetooth the pad starts in a compatibility mode whose report carries
	// no battery byte. Feature reads are safe to try blind, so sweep the ids that
	// are documented for this device and see if any of them flips it to the full
	// 0x31 report.
	for (const [id, length] of [
		[0x05, 41],
		[0x02, 37],
		[0x09, 20],
		[0x20, 64],
		[0x22, 64],
		[0x81, 7],
	]) {
		try {
			const feature = device.getFeatureReport(id, length);
			console.log(`    GET_FEATURE 0x${id.toString(16)} -> ${feature?.length ?? 0} bytes: ${hex((feature ?? []).slice(0, 12))}`);
		} catch (err) {
			console.log(`    GET_FEATURE 0x${id.toString(16)} failed: ${err.message}`);
		}

		seen.length = 0;
		await sleep(400);
		const ids = new Set(seen.map((b) => b[0]));
		console.log(`        input report ids now: ${[...ids].map((i) => `0x${i.toString(16)}`).join(", ") || "none"}`);
		if (ids.has(0x31)) {
			console.log("        -> switched to full reports");
			break;
		}
	}

	seen.length = 0;
	await sleep(LISTEN_MS);
	console.log(`    after feature sweep: ${seen.length} report(s)`);
	for (const bytes of seen.slice(0, 2)) report(bytes);

	try {
		device.close();
	} catch {
		/* already closed */
	}
	console.log("");
}
