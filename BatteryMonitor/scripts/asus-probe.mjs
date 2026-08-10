// Reverse-engineering helper for ASUS ROG battery reporting.
//
// Phase 1 (default) is READ-ONLY: it opens every ASUSTek HID interface and asks
// for feature reports, then listens briefly for unsolicited input reports. No
// bytes are written to the device.
//
// Phase 2 (--write) sends candidate "get" commands. Only run it knowingly: these
// are guesses at a vendor protocol, and a wrong guess writes to the device.
//
//   node scripts/asus-probe.mjs            # read-only
//   node scripts/asus-probe.mjs --write    # also try candidate commands
import HID from "node-hid";

const VENDOR_ID = 0x0b05;
const doWrite = process.argv.includes("--write");
const doSweep = process.argv.includes("--sweep");
const doFeature = process.argv.includes("--feature");
const listenIndex = process.argv.indexOf("--listen");
const listenSeconds = listenIndex >= 0 ? Number(process.argv[listenIndex + 1] ?? 45) : 0;
const LISTEN_MS = 1200;

/**
 * Windows rejects a write whose buffer length doesn't exactly match the output
 * report length declared by the collection (ERROR_INVALID_PARAMETER, 0x57), and
 * node-hid can't read the report descriptor to tell us what that length is. So
 * sweep the plausible lengths and see which one the driver accepts.
 */
async function sweepLengths(info) {
	console.log(`    sweeping write lengths for usagePage 0x${(info.usagePage ?? 0).toString(16)}`);

	for (let len = 2; len <= 66; len++) {
		let device;
		try {
			device = new HID.HID(info.path);
		} catch {
			return;
		}

		const replies = [];
		device.on("data", (d) => replies.push(Array.from(d)));
		device.on("error", () => {});

		const report = new Array(len).fill(0);
		report[1] = 0x12;
		report[2] = 0x07;

		try {
			device.write(report);
			await sleep(300);
			console.log(`    len ${len}: ACCEPTED${replies.length ? "" : " (no reply)"}`);
			for (const bytes of replies.slice(0, 3)) {
				console.log(`        <- ${hex(bytes)}`);
				const p = plausible(bytes);
				if (p) console.log(`           candidates: ${p}`);
			}
		} catch {
			// Wrong length for this collection — keep going.
		}

		try {
			device.close();
		} catch {
			/* already closed */
		}
	}
}

const hex = (bytes) => Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join(" ");

/** Bytes that could plausibly be a percentage, to eyeball against Armoury Crate. */
function plausible(bytes) {
	const hits = [];
	bytes.forEach((b, i) => {
		if (b >= 1 && b <= 100) hits.push(`[${i}]=${b}`);
	});
	return hits.join(" ");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const devices = HID.devices().filter((d) => d.vendorId === VENDOR_ID && d.path);
console.log(`Found ${devices.length} ASUSTek HID interface(s)\n`);

// --paths writes the interface paths out for tools that can't enumerate HID
// themselves (see scripts/asus-input-report.ps1).
if (process.argv.includes("--paths")) {
	const { writeFileSync } = await import("node:fs");
	const out = process.argv[process.argv.indexOf("--paths") + 1];
	writeFileSync(out, devices.map((d) => d.path).join("\n"));
	console.log(`wrote ${devices.length} paths to ${out}`);
	process.exit(0);
}

/**
 * Windows delivers HID input reports to every open handle, so anything Armoury
 * Crate asks the device for shows up here too. Open every interface at once and
 * watch — with Armoury Crate's Azoth page open, its battery poll should appear.
 */
if (listenSeconds > 0) {
	const open = [];
	for (const info of devices) {
		try {
			const device = new HID.HID(info.path);
			const tag = `pid=0x${info.productId.toString(16)} up=0x${(info.usagePage ?? 0).toString(16)} u=0x${(info.usage ?? 0).toString(16)}`;
			device.on("data", (d) => {
				console.log(`${new Date().toISOString().slice(11, 23)}  ${tag}  ${hex(d)}`);
				const p = plausible(Array.from(d));
				if (p) console.log(`     candidates: ${p}`);
			});
			device.on("error", () => {});
			open.push(device);
		} catch {
			// Busy or unreadable — skip.
		}
	}

	console.log(`Listening on ${open.length} interface(s) for ${listenSeconds}s.`);
	console.log("Open Armoury Crate on the Azoth's battery page now to make it poll.\n");
	await sleep(listenSeconds * 1000);

	for (const device of open) {
		try {
			device.close();
		} catch {
			/* already closed */
		}
	}
	console.log("\nDone listening.");
	process.exit(0);
}

for (const info of devices) {
	const tag = `pid=0x${info.productId.toString(16)} usagePage=0x${(info.usagePage ?? 0).toString(16)} usage=0x${(info.usage ?? 0).toString(16)}`;
	console.log(`=== ${info.product ?? "?"}  ${tag}`);
	console.log(`    ${info.path}`);

	/**
	 * If a collection declares no output report, writes fail at every length and
	 * the command channel is feature reports instead. GET_FEATURE is a read, so
	 * this sweep is safe to run blind; it just needs the right id and length.
	 */
	if (doFeature) {
		let device;
		try {
			device = new HID.HID(info.path);
		} catch (err) {
			console.log(`    ! open failed: ${err.message}\n`);
			continue;
		}

		const ids = [...Array(0x21).keys(), 0x5a, 0x5d, 0x60, 0x80, 0xa1];
		for (const reportId of ids) {
			for (let len = 2; len <= 66; len++) {
				try {
					const data = device.getFeatureReport(reportId, len);
					if (data?.length) {
						console.log(`    GET_FEATURE id=0x${reportId.toString(16)} len=${len}: ${hex(data)}`);
						const p = plausible(data);
						if (p) console.log(`        candidates: ${p}`);
						break; // found this id's length; move to the next id
					}
				} catch {
					// Wrong id/length pair.
				}
			}
		}

		try {
			device.close();
		} catch {
			/* already closed */
		}
		console.log("");
		continue;
	}

	// Vendor collections are the only ones that accept these commands; the
	// keyboard collections are blocked by Windows and MI_03 has no output reports.
	if (doSweep) {
		if ((info.usagePage ?? 0) >= 0xff00) await sweepLengths(info);
		console.log("");
		continue;
	}

	let device;
	try {
		device = new HID.HID(info.path);
	} catch (err) {
		console.log(`    ! open failed: ${err.message}\n`);
		continue;
	}

	// --- feature reports (read-only)
	for (let reportId = 0x00; reportId <= 0x20; reportId++) {
		try {
			const data = device.getFeatureReport(reportId, 65);
			if (data?.length && data.some((b) => b !== 0)) {
				console.log(`    FEATURE 0x${reportId.toString(16).padStart(2, "0")}: ${hex(data)}`);
				const p = plausible(data);
				if (p) console.log(`        candidates: ${p}`);
			}
		} catch {
			// Unsupported report id — expected for most.
		}
	}

	// --- unsolicited input reports
	const seen = [];
	device.on("data", (d) => seen.push(Array.from(d)));
	device.on("error", () => {});
	await sleep(LISTEN_MS);
	for (const bytes of seen.slice(0, 8)) {
		console.log(`    INPUT: ${hex(bytes)}`);
		const p = plausible(bytes);
		if (p) console.log(`        candidates: ${p}`);
	}

	// --- candidate commands (writes)
	if (doWrite) {
		// Patterns reported for ASUS ROG peripherals: 0x12 is the "read info"
		// opcode, with a sub-command selecting what to read.
		const candidates = [
			[0x00, 0x12, 0x07],
			[0x00, 0x12, 0x00],
			[0x5a, 0x12, 0x07],
			[0x00, 0x0d, 0x00],
			[0x00, 0x50, 0x12],
		];

		for (const head of candidates) {
			const report = new Array(65).fill(0);
			head.forEach((b, i) => (report[i] = b));
			const replies = [];
			const onData = (d) => replies.push(Array.from(d));
			device.on("data", onData);
			try {
				device.write(report);
				await sleep(250);
				try {
					const fr = device.getFeatureReport(head[0], 65);
					if (fr?.some((b) => b !== 0)) replies.push(Array.from(fr));
				} catch {
					/* no feature read available */
				}
			} catch (err) {
				console.log(`    write ${hex(head)} failed: ${err.message}`);
			}
			device.removeListener("data", onData);

			for (const bytes of replies.slice(0, 3)) {
				console.log(`    ${hex(head)} -> ${hex(bytes)}`);
				const p = plausible(bytes);
				if (p) console.log(`        candidates: ${p}`);
			}
		}
	}

	try {
		device.close();
	} catch {
		/* already closed */
	}
	console.log("");
}
