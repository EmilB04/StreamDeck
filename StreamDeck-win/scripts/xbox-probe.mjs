// Probe for Xbox Wireless Controller battery reporting.
//
// The pad sends its battery as input report 0x04 when the level changes, not on
// a schedule, so this listens for a while rather than reading once. Press a
// button or wiggle a stick while it runs — traffic often shakes the report
// loose — and plug/unplug the cable to see the charging bit flip.
//
//   node scripts/xbox-probe.mjs [seconds]
import HID from "node-hid";

const VENDOR_MICROSOFT = 0x045e;
const REPORT_BATTERY = 0x04;
const seconds = Number(process.argv[2] ?? 20);

const hex = (bytes) => Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join(" ");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function decode(flags) {
	const capacity = ["critical", "low", "medium", "full"][flags & 0x03];
	const kind = ["internal", "AA cells", "rechargeable pack", "reserved"][(flags >> 2) & 0x03];
	return `capacity=${capacity} kind=${kind} charging=${(flags & 0x10) !== 0} online=${(flags & 0x80) !== 0}`;
}

const devices = HID.devices().filter((d) => d.vendorId === VENDOR_MICROSOFT && d.path);
console.log(`Found ${devices.length} Microsoft HID interface(s)\n`);

for (const info of devices) {
	const bluetooth = /\{0000112[45]-0000-1000-8000-00805f9b34fb\}/i.test(info.path);
	console.log(
		`=== ${info.product ?? "?"}  pid=0x${info.productId.toString(16)} ` +
			`usagePage=0x${(info.usagePage ?? 0).toString(16)} usage=0x${(info.usage ?? 0).toString(16)} ` +
			`${bluetooth ? "[bluetooth]" : "[usb/dongle]"}`,
	);
	console.log(`    ${info.path}`);

	let device;
	try {
		device = new HID.HID(info.path);
	} catch (err) {
		console.log(`    ! open failed: ${err.message}\n`);
		continue;
	}

	// A feature read costs nothing and doesn't depend on the pad volunteering it.
	for (const id of [REPORT_BATTERY, 0x05, 0x06]) {
		try {
			const data = device.getFeatureReport(id, 8);
			if (data?.length) console.log(`    GET_FEATURE 0x${id.toString(16)}: ${hex(data)}`);
		} catch (err) {
			console.log(`    GET_FEATURE 0x${id.toString(16)} failed: ${err.message}`);
		}
	}

	const seen = new Map();
	device.on("data", (data) => {
		const bytes = Array.from(data);
		const id = bytes[0];
		seen.set(id, (seen.get(id) ?? 0) + 1);
		if (id === REPORT_BATTERY) {
			console.log(`    BATTERY ${hex(bytes.slice(0, 4))}  ->  ${decode(bytes[1])}`);
		}
	});
	device.on("error", () => {});

	console.log(`    listening ${seconds}s — press buttons, and try plugging the cable in and out…`);
	await sleep(seconds * 1000);

	console.log(`    report ids seen: ${[...seen.entries()].map(([id, n]) => `0x${id.toString(16)}×${n}`).join(", ") || "none"}`);
	if (!seen.has(REPORT_BATTERY)) {
		console.log("    no 0x04 report — paste the ids above into the issue so the offset can be found");
	}

	try {
		device.close();
	} catch {
		/* already closed */
	}
	console.log("");
}
