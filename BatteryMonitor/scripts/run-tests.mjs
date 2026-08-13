// Runs the compiled tests under `node --test`.
//
// This exists because there is no argument to `node --test` that every supported
// Node understands. Up to Node 20 the arguments are file or directory paths and a
// glob is taken literally; from Node 22 on they are glob patterns and a bare
// directory is taken as a file to execute. CI runs Node 20 (the version Stream
// Deck's runtime declares) while a dev machine may be far newer, so the file list
// is expanded here and passed explicitly — which every version accepts.
//
// Run `npm test`, which compiles into .test-build first.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const compiled = path.join(root, ".test-build", "test");

if (!fs.existsSync(compiled)) {
	console.error(`run-tests: ${compiled} does not exist — run \`tsc -p tsconfig.test.json\` first`);
	process.exit(1);
}

const files = fs
	.readdirSync(compiled)
	.filter((name) => name.endsWith(".test.js"))
	.map((name) => path.join(compiled, name));

// An empty run is a pass as far as `node --test` is concerned, which would let a
// broken compile step look like a green build.
if (files.length === 0) {
	console.error(`run-tests: no *.test.js under ${compiled} — the compile step produced nothing to run`);
	process.exit(1);
}

try {
	execFileSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
} catch (error) {
	// node --test already printed the failures; propagate its status without
	// burying them under a spawn stack trace.
	process.exit(error.status ?? 1);
}
