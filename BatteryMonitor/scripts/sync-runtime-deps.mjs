// Installs native runtime deps (node-hid) straight into the .sdPlugin folder,
// so Stream Deck's Node.js runtime can `require("node-hid")` next to bin/plugin.js.
//
// IMPORTANT: run this on the same OS/arch that will run the plugin (Windows,
// most likely) - node-hid ships a prebuilt native binary per platform, and
// whatever gets installed here is what ships. Running it in WSL/Linux produces
// a Linux binary that will fail to load inside Stream Deck on Windows.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sdPlugin = path.join(root, "com.emilberglund.batterymonitor.sdPlugin");

console.log(`Installing node-hid into ${sdPlugin} for ${process.platform}/${process.arch} ...`);
execFileSync("npm", ["install", "node-hid", "--no-save", "--no-package-lock", "--omit=dev", "--prefix", sdPlugin], {
	stdio: "inherit",
	shell: process.platform === "win32",
});
console.log("Done.");
