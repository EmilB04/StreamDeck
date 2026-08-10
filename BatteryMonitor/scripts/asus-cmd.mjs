// Sends commands to the ROG receiver's vendor collections and prints replies.
//
// Two facts make this work, both established with scripts/asus-caps.ps1 and
// scripts/asus-write.ps1 -IdSweep:
//   * MI_02's collections use 64-byte output reports (length includes the ID).
//   * Each collection accepts exactly ONE report ID: 0xff02 -> 0x01,
//     0xff00 -> 0x02, 0xff01 -> 0x03. Any other id fails with 87/1.
//
// Replies can surface on a different collection than the one written to, so this
// listens on every ASUS interface while sending.
//
//   node scripts/asus-cmd.mjs               # sweep candidate battery commands
//   node scripts/asus-cmd.mjs 12 07         # send one payload (after the report id)
import HID from "node-hid";

const VENDOR_ID = 0x0b05;
const PRODUCT_ID = 0x1ace;
const REPORT_LEN = 64;
const REPLY_MS = 500;

/** Output report id per vendor collection. */
const REPORT_ID_BY_USAGE_PAGE = new Map([
	[0xff02, 0x01],
	[0xff00, 0x02],
	[0xff01, 0x03],
]);

const hex = (bytes, n = 20) => Array.from(bytes).slice(0, n).map((b) => b.toString(16).padStart(2, "0")).join(" ");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Armoury Crate reads 86% right now; 219 is 86% encoded as 0..255. */
const TARGETS = new Map([
	[86, "86 = Armoury Crate's percentage"],
	[219, "219 = 86% scaled to 0..255"],
	[220, "220 ~ 86% scaled to 0..255"],
]);

function highlight(bytes) {
	const out = [];
	bytes.forEach((b, i) => {
		if (TARGETS.has(b)) out.push(`  >>> [${i}] = ${b}  (${TARGETS.get(b)})`);
	});
	return out;
}

// Sweep the sub-command of the 0x12 "read info" family. Staying inside 0x12
// keeps this to reads rather than blindly poking write opcodes.
const sweep12 = process.argv.includes("--sweep12");

const explicit = process.argv.slice(2).filter((a) => /^[0-9a-f]{1,2}$/i.test(a)).map((a) => parseInt(a, 16));
const payloads = sweep12
	? Array.from({ length: 256 }, (_, i) => [0x12, i])
	: explicit.length
	? [explicit]
	: [
			[0x12, 0x07], // battery on ROG mice (g-helper)
			[0x12, 0x00],
			[0x12, 0x02],
			[0x51, 0x12],
			[0x0d, 0x00],
			[0x5a, 0x12, 0x07],
			[0x12, 0x07, 0x00, 0x00],
		];

const all = HID.devices().filter((d) => d.vendorId === VENDOR_ID && d.productId === PRODUCT_ID && d.path);

// Listen everywhere first.
const listeners = [];
for (const info of all) {
	try {
		const device = new HID.HID(info.path);
		const tag = `up=0x${(info.usagePage ?? 0).toString(16)}`;
		device.on("data", (d) => {
			const bytes = Array.from(d);
			console.log(`        <- ${tag}  ${hex(bytes)}`);
			for (const line of highlight(bytes)) console.log(line);
		});
		device.on("error", () => {});
		listeners.push(device);
	} catch {
		// Busy — skip.
	}
}
console.log(`Listening on ${listeners.length} interface(s)\n`);

for (const info of all) {
	const reportId = REPORT_ID_BY_USAGE_PAGE.get(info.usagePage ?? 0);
	if (reportId === undefined) continue;

	console.log(`=== usagePage 0x${info.usagePage.toString(16)}  reportId 0x${reportId.toString(16)}`);

	let device;
	try {
		device = new HID.HID(info.path);
	} catch (err) {
		console.log(`    open failed: ${err.message}`);
		continue;
	}

	for (const payload of payloads) {
		const report = new Array(REPORT_LEN).fill(0);
		report[0] = reportId;
		payload.forEach((b, i) => (report[i + 1] = b));

		try {
			device.write(report);
		} catch (err) {
			console.log(`    sent ${hex(payload, 8)} -> write failed: ${err.message}`);
			continue;
		}

		// Read on the same handle that sent the command: a reply to an interrupt
		// OUT comes back on that handle's own input queue, not necessarily to the
		// other handles listening on the same path.
		let reply;
		try {
			reply = device.readTimeout(REPLY_MS);
		} catch (err) {
			reply = null;
		}

		const bytes = reply?.length ? Array.from(reply) : null;
		// 02 ff aa is the device's "unsupported command" answer; skip the noise
		// when sweeping so real responses stand out.
		const unsupported = bytes && bytes[1] === 0xff && bytes[2] === 0xaa;

		if (bytes && !(sweep12 && (unsupported || bytes.every((b, i) => i < 3 || b === 0)))) {
			console.log(`    sent ${hex(payload, 8)} -> ${hex(bytes)}`);
			for (const line of highlight(bytes)) console.log(line);
		} else if (!sweep12) {
			console.log(`    sent ${hex(payload, 8)} -> ${bytes ? "unsupported" : "no reply"}`);
		}
	}

	try {
		device.close();
	} catch {
		/* already closed */
	}
	console.log("");
}

await sleep(600);
for (const device of listeners) {
	try {
		device.close();
	} catch {
		/* already closed */
	}
}
