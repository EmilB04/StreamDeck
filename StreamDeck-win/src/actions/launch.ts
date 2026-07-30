import { spawn } from "node:child_process";
import { APP_PREFIX } from "./apps";

/**
 * Opens whatever the user pointed the key at: an executable, a shortcut, a
 * document, or a URL/protocol like `steam://` — the shell decides, the same way
 * it would from Explorer or Finder.
 *
 * The child is detached and unreferenced so the app it starts outlives the
 * plugin process and doesn't hold Node's event loop open. Nothing is piped back:
 * a launched app's output isn't ours to collect.
 */
export function openTarget(target: string): void {
	const value = target.trim();
	if (value === "") return;

	// An app picked from the installed list is addressed by its Start-menu AppID,
	// which only the shell's AppsFolder can resolve — `start` can't. This is the
	// same route the Start menu takes, so Store apps and desktop apps both work.
	if (value.startsWith(APP_PREFIX)) {
		const appId = value.slice(APP_PREFIX.length);
		const child = spawn("explorer.exe", [`shell:AppsFolder\\${appId}`], {
			detached: true,
			stdio: "ignore",
			windowsHide: true,
		});
		child.unref();
		return;
	}

	const [command, args] =
		process.platform === "win32"
			? // `start` needs its first quoted argument as the window title, or it
				// treats a quoted path as one.
				["cmd.exe", ["/c", "start", "", value]]
			: process.platform === "darwin"
				? ["open", [value]]
				: ["xdg-open", [value]];

	const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
	child.unref();
}
