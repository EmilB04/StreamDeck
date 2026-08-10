/**
 * Standalone device scan — the same discovery the plugin uses, printed to the
 * terminal. Run it on the machine that runs Stream Deck to check what actually
 * gets detected, without having to read the plugin logs:
 *
 *   npm run scan
 */
import { discovery } from "./providers/discovery";
import { setLogger } from "./providers/log";

setLogger({ info: (m, ...a) => console.log(m, ...a), warn: (m, ...a) => console.warn(m, ...a) });

async function main(): Promise<void> {
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
