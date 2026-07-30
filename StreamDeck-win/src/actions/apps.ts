import { execFile } from "node:child_process";
import { promisify } from "node:util";
import streamDeck from "@elgato/streamdeck";

const execFileAsync = promisify(execFile);
const TIMEOUT_MS = 20_000;

/** The installed-apps list changes rarely, and enumerating it costs ~1s. */
const CACHE_TTL_MS = 5 * 60_000;

/**
 * Lists what the Start menu can launch, as something that can actually be
 * launched later.
 *
 * Two sources, because one route doesn't cover both kinds of app:
 *
 *  - Store apps have an AppID like `Pkg_hash!App`, which only the shell's
 *    AppsFolder resolves. Those are taken from Get-StartApps.
 *  - Desktop apps appear in Get-StartApps too, but with an AppID of the form
 *    `{KnownFolderGuid}\relative\path.exe`, and AppsFolder does *not* resolve
 *    those — tested, it silently does nothing. Their Start-menu shortcut is
 *    what's launchable, so those come from the .lnk files directly.
 */
const SCRIPT = [
	"$ErrorActionPreference='SilentlyContinue';",
	"$out = New-Object System.Collections.ArrayList;",
	// Shortcuts first, so a desktop app is preferred over a same-named Store entry.
	"$roots = @(\"$env:ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\", \"$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs\");",
	"foreach ($lnk in Get-ChildItem -Path $roots -Filter *.lnk -Recurse -ErrorAction SilentlyContinue) {",
	"  [void]$out.Add([pscustomobject]@{ name=$lnk.BaseName; value=$lnk.FullName }) };",
	"foreach ($app in Get-StartApps | Where-Object { $_.AppID -like '*!*' }) {",
	"  [void]$out.Add([pscustomobject]@{ name=$app.Name; value=('app:' + $app.AppID) }) };",
	"ConvertTo-Json -InputObject @($out) -Compress",
].join(" ");

/**
 * Entries the Start menu carries that aren't applications anyone wants a key
 * bound to — uninstallers, readmes, links to a vendor's website.
 */
const NOISE = /^(uninstall|readme|release notes|documentation|help|manual|website|visit )|uninstall$/i;

export type InstalledApp = {
	name: string;
	/**
	 * What to open: a Start-menu shortcut path, or `app:<AppID>` for a Store app.
	 * Ready to store in settings and hand to `openTarget` as-is.
	 */
	target: string;
};

let cache: { at: number; apps: InstalledApp[] } | undefined;
let inflight: Promise<InstalledApp[]> | undefined;

/**
 * Marks a Store app's AppID, which needs the AppsFolder route rather than the
 * shell's usual "open this" handling. Anything without it is a path or a URL.
 */
export const APP_PREFIX = "app:";

/** Lists installed applications. Never throws; an empty list just means none. */
export async function listApps(force = false): Promise<InstalledApp[]> {
	if (force) cache = undefined;
	if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.apps;

	// Serialize: the property inspector can ask twice while the first run is out.
	inflight ??= query().finally(() => {
		inflight = undefined;
	});
	return inflight;
}

async function query(): Promise<InstalledApp[]> {
	if (process.platform !== "win32") return [];

	const started = Date.now();
	try {
		const { stdout } = await execFileAsync(
			"powershell.exe",
			["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", SCRIPT],
			{ timeout: TIMEOUT_MS, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
		);

		const parsed = JSON.parse(stdout.trim() || "[]");
		const list: { name?: string; value?: string }[] = Array.isArray(parsed) ? parsed : [parsed];

		const apps = list
			.filter((e) => e?.name && e?.value && !NOISE.test(e.name.trim()))
			.map((e) => ({ name: e.name!.trim(), target: e.value!.trim() }));

		// A name can appear more than once (a shortcut in both the machine-wide and
		// per-user Start menu, or a Store entry alongside a desktop one). The
		// script emits shortcuts first, so keeping the first wins for those.
		const byName = new Map<string, InstalledApp>();
		for (const app of apps) {
			const key = app.name.toLowerCase();
			if (!byName.has(key)) byName.set(key, app);
		}

		const unique = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));

		streamDeck.logger.info(`apps: found ${unique.length} installed app(s) in ${Date.now() - started}ms`);
		cache = { at: Date.now(), apps: unique };
		return unique;
	} catch (err) {
		streamDeck.logger.warn("apps: could not enumerate installed applications", err);
		return [];
	}
}
