// Probe for Razer battery reporting.
//
// Walks every Razer HID interface and every documented transaction id, sending
// the OpenRazer power commands and printing what comes back. Use it when a
// Razer device shows "no battery data": the transaction id is per-device and
// can't be asked for, so a device that answers on an id not in the list needs
// that id adding to TRANSACTION_IDS in src/providers/razer.ts.
//
//   node scripts/razer-probe.mjs
import HID from "node-hid";

const VENDOR_RAZER = 0x1532;
const REPORT_LENGTH = 90;
const REPORT_ID = 0x00;
const CLASS_POWER = 0x07;
const CMD_BATTERY = 0x80;
const CMD_CHARGING = 0x84;
const TRANSACTION_IDS = [0x1f, 0x3f, 0x08, 0x09, 0x00, 0x88, 0x1c];
const REPLY_DELAY_MS = 60;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hex = (b) => b.toString(16).padStart(2, "0");

function buildReport(transactionId, commandId) {
	const report = new Array(REPORT_LENGTH).fill(0);
	report[1] = transactionId;
	report[5] = 0x02;
	report[6] = CLASS_POWER;
	report[7] = commandId;
	let crc = 0;
	for (let i = 2; i < 88; i++) crc ^= report[i];
	report[88] = crc;
	return report;
}

async function ask(device, transactionId, commandId) {
	device.sendFeatureReport([REPORT_ID, ...buildReport(transactionId, commandId)]);
	await sleep(REPLY_DELAY_MS);
	const reply = device.getFeatureReport(REPORT_ID, REPORT_LENGTH + 1);
	if (!reply?.length) return null;
	// node-hid puts the report id in front, so every struct offset shifts by one.
	return { status: reply[1], commandClass: reply[7], commandId: reply[8], arg0: reply[9], arg1: reply[10] };
}

const devices = HID.devices().filter((d) => d.vendorId === VENDOR_RAZER && d.path);
console.log(`Found ${devices.length} Razer HID interface(s)\n`);

for (const info of devices) {
	const tag = `pid=0x${info.productId.toString(16)} usagePage=0x${(info.usagePage ?? 0).toString(16)} usage=0x${(info.usage ?? 0).toString(16)}`;
	console.log(`=== ${info.product ?? "?"}  ${tag}`);

	let device;
	try {
		device = new HID.HID(info.path);
	} catch (err) {
		console.log(`    ! open failed: ${err.message}\n`);
		continue;
	}

	for (const transactionId of TRANSACTION_IDS) {
		try {
			const battery = await ask(device, transactionId, CMD_BATTERY);
			if (!battery) continue;

			const ok = battery.status === 0x02 && battery.commandClass === CLASS_POWER;
			const percent = Math.round((battery.arg1 / 255) * 100);
			console.log(
				`    tid 0x${hex(transactionId)}: status=0x${hex(battery.status)} class=0x${hex(battery.commandClass)} ` +
					`id=0x${hex(battery.commandId)} arg1=${battery.arg1} -> ${percent}%${ok ? "  <-- answered" : ""}`,
			);

			if (ok) {
				const charging = await ask(device, transactionId, CMD_CHARGING);
				console.log(`        charging: arg1=${charging?.arg1}`);
			}
		} catch (err) {
			console.log(`    tid 0x${hex(transactionId)}: ${err.message}`);
		}
	}

	try {
		device.close();
	} catch {
		/* already closed */
	}
	console.log("");
}
