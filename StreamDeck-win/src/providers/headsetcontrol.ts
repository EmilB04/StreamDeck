import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { BatteryProvider, BatteryReading, DiscoveredDevice } from "./types";
import { slug } from "./types";

const execFileAsync = promisify(execFile);
const TIMEOUT_MS = 6000;

/**
 * Candidate locations for the HeadsetControl binary, tried in order. A bare
 * name ("headsetcontrol.exe") relies on PATH; the fully-qualified paths are the
 * default install locations so the plugin keeps working even when Stream Deck's
 * process environment doesn't have our PATH change (a fresh PATH entry isn't
 * picked up by the already-running, often-elevated Stream Deck app until the
 * user fully signs out/in).
 */
function candidateBinaries(): string[] {
	if (process.env.HEADSETCONTROL_PATH) return [process.env.HEADSETCONTROL_PATH];

	if (process.platform === "win32") {
		const localAppData = process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local");
		const paths = ["headsetcontrol.exe", join(localAppData, "Programs", "HeadsetControl", "headsetcontrol.exe")];
		if (process.env.ProgramFiles) paths.push(join(process.env.ProgramFiles, "HeadsetControl", "headsetcontrol.exe"));
		return paths;
	}

	return [
		"headsetcontrol",
		"/opt/homebrew/bin/headsetcontrol",
		"/usr/local/bin/headsetcontrol",
		"/usr/bin/headsetcontrol",
	];
}

/** Where to send someone who hasn't got the tool yet. */
export const HEADSETCONTROL_RELEASES = "https://github.com/Sapd/HeadsetControl/releases";

/**
 * Which binary is going to be used, or null when none of the candidates exist.
 *
 * The property inspector asks this so it can say whether headsets will report
 * anything at all — a missing HeadsetControl is the single most common reason
 * for a headset showing no level, and it looks identical to an unsupported
 * device unless the panel says so.
 */
export async function findHeadsetControl(): Promise<string | null> {
	for (const binary of candidateBinaries()) {
		try {
			await execFileAsync(binary, ["--help"], { timeout: TIMEOUT_MS });
			return binary;
		} catch (err: any) {
			// Anything other than "no such file" means it's there and answered.
			if (err?.code !== "ENOENT") return binary;
		}
	}
	return null;
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
export class HeadsetControlProvider implements BatteryProvider {
	readonly id = "headset";

	async discover(): Promise<DiscoveredDevice[]> {
		const output = await this.run();
		if (!output.ok) return [];
		return this.parse(output.stdout);
	}

	async read(device: DiscoveredDevice): Promise<BatteryReading> {
		const label = device.label;
		const output = await this.run();
		if (!output.ok) {
			return { deviceLabel: label, percent: null, status: "error", detail: output.detail };
		}

		const match = this.parse(output.stdout).find((d) => d.key === device.key);
		if (!match?.reading) {
			return { deviceLabel: label, percent: null, status: "not-found", detail: "Headset offline or asleep" };
		}
		return match.reading;
	}

	/** Runs the CLI at the first candidate path that exists. */
	private async run(): Promise<{ ok: true; stdout: string } | { ok: false; detail: string }> {
		let lastError: string | undefined;
		for (const binary of candidateBinaries()) {
			try {
				const { stdout } = await execFileAsync(binary, ["-o", "JSON", "-b"], { timeout: TIMEOUT_MS });
				return { ok: true, stdout };
			} catch (err: any) {
				// ENOENT just means this candidate path doesn't exist — try the next one.
				if (err?.code === "ENOENT") continue;
				// A non-zero exit still prints usable JSON on some versions.
				if (typeof err?.stdout === "string" && err.stdout.trim().startsWith("{")) {
					return { ok: true, stdout: err.stdout };
				}
				lastError = String(err?.message ?? err);
			}
		}

		return {
			ok: false,
			detail:
				lastError ?? "HeadsetControl not found. Install it: https://github.com/Sapd/HeadsetControl/releases",
		};
	}

	/**
	 * Accepts both the v3 shape (`{devices:[{device,vendor,product,battery:{...}}]}`)
	 * and the older nested one (`{devices:[{device,status:{battery:{...}}}]}`).
	 */
	private parse(stdout: string): DiscoveredDevice[] {
		let json: any;
		try {
			json = JSON.parse(stdout);
		} catch {
			// Very old builds print plain text like "Battery: 75%". No device name
			// to key off, so expose it as a single generic entry.
			const match = stdout.match(/(\d{1,3})\s*%/);
			if (!match) return [];
			const label = "Headset";
			return [
				{
					key: "headset:unknown",
					providerId: this.id,
					label,
					kind: "headset",
					supportsBattery: true,
					locator: {},
					reading: { deviceLabel: label, percent: Number(match[1]), status: "ok" },
				},
			];
		}

		const raw: any[] = Array.isArray(json?.devices) ? json.devices : Array.isArray(json) ? json : [json];

		return raw
			.filter((d) => d && typeof d === "object")
			.map((d) => this.toDevice(d))
			.filter((d): d is DiscoveredDevice => d !== null);
	}

	private toDevice(raw: any): DiscoveredDevice | null {
		const vendor: string | undefined = raw.vendor;
		const product: string | undefined = raw.product;
		const label: string =
			raw.device || [vendor, product].filter(Boolean).join(" ") || raw.name || "Headset";

		const idVendor: string | undefined = raw.id_vendor ?? raw.idVendor;
		const idProduct: string | undefined = raw.id_product ?? raw.idProduct;
		const key =
			idVendor && idProduct ? `headset:${idVendor}:${idProduct}` : `headset:${slug(label) || "unknown"}`;

		return {
			key,
			providerId: this.id,
			label,
			kind: "headset",
			supportsBattery: true,
			locator: { idVendor: idVendor ?? "", idProduct: idProduct ?? "" },
			reading: this.toReading(label, raw),
		};
	}

	private toReading(label: string, raw: any): BatteryReading | undefined {
		const battery = raw.battery ?? raw.status?.battery;
		if (!battery || battery.level === undefined || battery.level === null) return undefined;

		// HeadsetControl explains itself ("Device is offline or not responding"),
		// which beats anything we'd guess at.
		const offline = raw.errors?.battery
			? `Headset offline: ${raw.errors.battery}`
			: "Headset offline or asleep — the dongle is connected but the headset isn't answering";

		const status: string = String(battery.status ?? "");
		if (status === "BATTERY_UNAVAILABLE" || status === "BATTERY_TIMEOUT" || status === "BATTERY_HIDERROR") {
			return { deviceLabel: label, percent: null, status: "not-found", detail: offline };
		}

		const percent = Number(battery.level);
		if (!Number.isFinite(percent) || percent < 0) {
			return { deviceLabel: label, percent: null, status: "not-found", detail: offline };
		}

		return {
			deviceLabel: label,
			percent: Math.min(100, Math.round(percent)),
			status: status === "BATTERY_CHARGING" ? "charging" : "ok",
		};
	}
}
