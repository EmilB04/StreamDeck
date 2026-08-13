/**
 * Standalone device scan — the same discovery the plugin uses, printed to the
 * terminal. Run it on the machine that runs Stream Deck to check what actually
 * gets detected, without having to read the plugin logs:
 *
 *   npm run scan
 */
import { discovery } from "./providers/discovery";
import { hidDevices } from "./providers/hid";
import { setLogger } from "./providers/log";
import { hex4 } from "./providers/types";

setLogger({ info: (m, ...a) => console.log(m, ...a), warn: (m, ...a) => console.warn(m, ...a) });

/**
 * Every HID interface on the machine, before any provider has had an opinion.
 *
 * This is the part worth pasting into a bug report about a device that isn't
 * listed: whether it enumerates at all, and on which usage page, is what decides
 * which provider should have picked it up.
 */
async function printHidInterfaces(): Promise<void> {
	const devices = await hidDevices();

	console.log("HID interfaces");
	if (!devices) {
		console.log("  node-hid did not load — every HID provider is disabled.");
		console.log("  Run `npm run sync-deps` on the machine running Stream Deck.\n");
		return;
	}
	if (devices.length === 0) {
		console.log("  none reported\n");
		return;
	}

	for (const d of devices) {
		console.log(
			`  ${hex4(d.vendorId)}:${hex4(d.productId)} ` +
				`usagePage=0x${(d.usagePage ?? 0).toString(16)} usage=0x${(d.usage ?? 0).toString(16)} ` +
				`"${(d.product ?? "").trim()}"`,
		);
	}
	console.log("");
}

async function main(): Promise<void> {
	await printHidInterfaces();

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
		console.log(
			`  battery  ${level} (${reading?.status ?? "unknown"})${reading?.detail ? ` — ${reading.detail}` : ""}`,
		);
		console.log("");
	}
}

main().catch((err) => {
	console.error(err);
	process.exitCode = 1;
});
