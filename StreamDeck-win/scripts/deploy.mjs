// Copies the built .sdPlugin folder to wherever Stream Deck actually loads it
// from, and restarts the plugin.
//
// This exists because the repo lives in WSL while Stream Deck is a Windows app:
// the plugin folder under %APPDATA% is a symlink to a *Windows* path, which a
// WSL path can't back, and `streamdeck restart` can't be driven from here at all
// (cmd.exe refuses a UNC working directory, after which the CLI decides Stream
// Deck isn't running and does nothing). So: rsync to the Windows copy, then kill
// the plugin's node.exe and let Stream Deck respawn it, which it does within a
// couple of seconds.
//
// Run `npm run build` first, or `npm run deploy` which does both.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

const UUID = "com.emilberglund.batterymonitor";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = path.join(root, `${UUID}.sdPlugin`);

const POWERSHELL = "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";

/** Everything Stream Deck loads, minus what only belongs to the working copy. */
const EXCLUDES = ["logs/", ".claude/"];

function fail(message) {
	console.error(`deploy: ${message}`);
	process.exit(1);
}

function powershell(script) {
	return execFileSync(POWERSHELL, ["-NoProfile", "-Command", script], { encoding: "utf8" }).trim();
}

/**
 * Where Stream Deck reads the plugin from. Resolved through the link under
 * %APPDATA% rather than hard-coded, so this follows a re-`link` instead of
 * quietly deploying to a folder nothing loads.
 */
function resolveTarget() {
	if (process.env.SD_PLUGIN_DIR) return process.env.SD_PLUGIN_DIR;

	const appData = powershell("[Environment]::GetFolderPath('ApplicationData')");
	const drive = appData.match(/^([A-Za-z]):\\(.*)$/);
	if (!drive) fail(`could not read %APPDATA% (got "${appData}")`);

	const installed = path.join(
		"/mnt",
		drive[1].toLowerCase(),
		drive[2].replace(/\\/g, "/"),
		"Elgato/StreamDeck/Plugins",
		`${UUID}.sdPlugin`,
	);

	if (!fs.existsSync(installed)) {
		fail(`${installed} does not exist — run \`npx @elgato/cli link\` on Windows first`);
	}

	// A real directory means the plugin was copied rather than linked; deploying
	// into it is still correct, it just isn't a link to follow.
	const stat = fs.lstatSync(installed);
	const target = stat.isSymbolicLink() ? fs.realpathSync(installed) : installed;

	if (target.startsWith(source)) fail("the installed plugin already points at this working copy — nothing to sync");
	return target;
}

/**
 * Kills the plugin's node process; Stream Deck restarts it on its own, though
 * not instantly. Kill and wait happen inside one PowerShell run because each
 * powershell.exe launch from WSL costs the best part of a second.
 */
function restartPlugin() {
	const result = powershell(`
		$pids = { (Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
			Where-Object { $_.CommandLine -like '*${UUID}*' }).ProcessId }
		$before = @(& $pids)
		if ($before.Count -eq 0) { 'not-running'; exit }
		$before | ForEach-Object { Stop-Process -Id $_ -Force }
		for ($i = 0; $i -lt 20; $i++) {
			Start-Sleep -Milliseconds 500
			$fresh = @(& $pids) | Where-Object { $before -notcontains $_ }
			if ($fresh) { "restarted $($before -join ',') -> $($fresh -join ',')"; exit }
		}
		"stalled $($before -join ',')"
	`);

	if (result === "not-running") {
		console.log("Plugin is not running; Stream Deck will pick up the new build when it starts it.");
	} else if (result.startsWith("restarted")) {
		console.log(result);
	} else {
		console.warn(`Old plugin process was killed, but Stream Deck hasn't restarted it (${result}).`);
	}
}

if (!fs.existsSync(path.join(source, "bin/plugin.js"))) fail("bin/plugin.js is missing — run `npm run build` first");
if (!fs.existsSync(POWERSHELL)) fail("this only works from WSL alongside a Windows Stream Deck install");

const target = resolveTarget();
console.log(`Deploying ${source} -> ${target}`);

// -t matters: without preserved timestamps rsync can't tell an unchanged file
// from a new one, and every deploy would re-copy the whole plugin.
execFileSync("rsync", ["-rt", "--info=name", ...EXCLUDES.flatMap((e) => ["--exclude", e]), `${source}/`, `${target}/`], {
	stdio: "inherit",
});

restartPlugin();
