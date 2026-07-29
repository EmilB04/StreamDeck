import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { BatteryProvider, BatteryReading, DeviceKind, DiscoveredDevice } from "./types";
import { slug } from "./types";

const execFileAsync = promisify(execFile);
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
	"$out = $devices | Get-PnpDeviceProperty -KeyName $key |",
	"  Where-Object { $_.Data -ne $null } |",
	"  ForEach-Object { [pscustomobject]@{ id=$_.InstanceId; name=$names[$_.InstanceId]; level=[int]$_.Data } };",
	"ConvertTo-Json -InputObject @($out) -Compress",
].join(" ");

type PnpBattery = { id: string; name: string; level: number };

/**
 * Detects Bluetooth peripherals that report battery to Windows itself. This is
 * the only vendor-independent source of battery levels on the machine, so it
 * picks up keyboards, mice and controllers no dedicated provider knows about —
 * as long as they're paired over Bluetooth rather than a proprietary 2.4 GHz
 * dongle (dongle-connected devices are invisible to the OS battery property).
 */
export class WindowsBluetoothProvider implements BatteryProvider {
	readonly id = "winbt";

	async discover(): Promise<DiscoveredDevice[]> {
		const entries = await this.query();
		return entries.map((entry) => ({
			key: `winbt:${slug(entry.id)}`,
			providerId: this.id,
			label: entry.name?.trim() || "Bluetooth device",
			kind: kindOf(entry.name ?? ""),
			supportsBattery: true,
			locator: { instanceId: entry.id },
			reading: toReading(entry),
		}));
	}

	async read(device: DiscoveredDevice): Promise<BatteryReading> {
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

	private async query(): Promise<PnpBattery[]> {
		if (process.platform !== "win32") return [];

		try {
			const { stdout } = await execFileAsync(
				"powershell.exe",
				["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", SCRIPT],
				{ timeout: TIMEOUT_MS, windowsHide: true },
			);

			const parsed = JSON.parse(stdout.trim() || "[]");
			const list: PnpBattery[] = Array.isArray(parsed) ? parsed : [parsed];
			return list.filter((e) => e && typeof e.id === "string" && Number.isFinite(Number(e.level)));
		} catch {
			// PowerShell missing/blocked, or no Bluetooth stack — just contribute nothing.
			return [];
		}
	}
}

function toReading(entry: PnpBattery): BatteryReading {
	const label = entry.name?.trim() || "Bluetooth device";
	const percent = Math.max(0, Math.min(100, Math.round(Number(entry.level))));
	// Windows exposes the GATT level only; there is no charging flag in this property.
	return { deviceLabel: label, percent, status: "ok" };
}

function kindOf(name: string): DeviceKind {
	const value = name.toLowerCase();
	if (/keyboard|keychron|azoth|kbd/.test(value)) return "keyboard";
	if (/mouse|mx |trackball/.test(value)) return "mouse";
	if (/headset|headphone|buds|earbud|airpods|hyperx|arctis/.test(value)) return "headset";
	if (/controller|gamepad|dualsense|dualshock|xbox/.test(value)) return "gamepad";
	return "other";
}
