// Installs native runtime deps (node-hid) straight into the .sdPlugin folder,
// so Stream Deck's Node.js runtime can `require("node-hid")` next to bin/plugin.js.
//
// Platform-independent: node-hid's tarball carries a prebuilt binary for every
// platform and its install step only verifies the host's, so the Windows one is
// present whatever OS this runs on. `.sdignore` drops the platforms the manifest
// doesn't declare when the plugin is packed.
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
