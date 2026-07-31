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
	// Devices without the property are kept, with a null level: they're still
	// real paired peripherals worth listing, they just can't report a level.
	"$out = $devices | Get-PnpDeviceProperty -KeyName $key |",
	"  ForEach-Object { [pscustomobject]@{",
	"    id=$_.InstanceId; name=$names[$_.InstanceId];",
	"    level=$(if ($_.Data -ne $null) { [int]$_.Data } else { $null }) } };",
	"ConvertTo-Json -InputObject @($out) -Compress",
].join(" ");

type PnpBattery = { id: string; name: string; level: number | null };

/**
 * Detects Bluetooth peripherals that report battery to Windows itself. This is
 * the only vendor-independent source of battery levels on the machine, so it
 * picks up keyboards, mice and controllers no dedicated provider knows about —
 * as long as they're paired over Bluetooth rather than a proprietary 2.4 GHz
 * dongle (dongle-connected devices are invisible to the OS battery property).
 */
export class WindowsBluetoothProvider implements BatteryProvider {
	readonly id = "winbt";

	/**
	 * The PnP property is a bare percentage. Windows keeps a Boolean next to it
	 * ({104EA319-…} 3) that looks like it should be a charging flag, but it stays
	 * False on a phone whose level is visibly climbing, so it isn't one.
	 */
	readonly reportsCharging = false;

	async discover(): Promise<DiscoveredDevice[]> {
		const entries = await this.query();
		return entries.map((entry) => ({
			key: `winbt:${slug(entry.id)}`,
			providerId: this.id,
			label: entry.name?.trim() || "Bluetooth device",
			kind: kindOf(entry.name ?? ""),
			supportsBattery: entry.level !== null,
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
			// A missing property comes back as JSON null, and Number(null) is 0 —
			// which would report a healthy device as flat. Only a real number counts.
			return list
				.filter((e) => e && typeof e.id === "string")
				.map((e) => ({ ...e, level: typeof e.level === "number" && Number.isFinite(e.level) ? e.level : null }));
		} catch {
			// PowerShell missing/blocked, or no Bluetooth stack — just contribute nothing.
			return [];
		}
	}
}

function toReading(entry: PnpBattery): BatteryReading {
	const label = entry.name?.trim() || "Bluetooth device";

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

	const percent = Math.max(0, Math.min(100, Math.round(entry.level)));
	// Windows exposes the GATT level only; there is no charging flag in this property.
	return { deviceLabel: label, percent, status: "ok" };
}

/**
 * Best guess at a form factor from the name Windows shows. A Bluetooth device
 * does advertise a class-of-device code, but the PnP property that carries it
 * isn't exposed here, and the name is what the user recognises anyway.
 */
function kindOf(name: string): DeviceKind {
	const value = name.toLowerCase();
	if (/keyboard|keychron|azoth|kbd/.test(value)) return "keyboard";
	if (/mouse|mx |trackball/.test(value)) return "mouse";
	if (/buds|earbud|airpods|pods\b|freebuds/.test(value)) return "earbuds";
	if (/headset|headphone|arctis|cloud|wh-|beats|bose|jbl tune/.test(value)) return "headset";
	if (/controller|gamepad|dualsense|dualshock|xbox|joy-con/.test(value)) return "gamepad";
	if (/watch|band\b|fitbit|garmin/.test(value)) return "watch";
	if (/ipad|tab\b|tablet/.test(value)) return "tablet";
	if (/iphone|phone|pixel|galaxy s|oneplus|xperia/.test(value)) return "phone";
	if (/speaker|nest|echo|sonos|soundbar|homepod|boom|flip\b/.test(value)) return "speaker";
	if (/mic\b|microphone|solocast|quadcast|yeti|podcast|wave:/.test(value)) return "microphone";
	return "other";
}
