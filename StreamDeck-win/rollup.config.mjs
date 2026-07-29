import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

const isWatch = !!process.env.ROLLUP_WATCH;

/**
 * node-hid ships a compiled .node binary per-platform. It cannot be bundled,
 * so it stays external and must exist under node_modules next to bin/plugin.js
 * at runtime (see scripts/sync-runtime-deps.mjs).
 */
const external = ["node-hid"];

const plugins = () => [
	typescript({ tsconfig: "./tsconfig.json", sourceMap: isWatch }),
	nodeResolve({ preferBuiltins: true }),
	commonjs(),
	json(),
];

export default [
	{
		input: "src/plugin.ts",
		output: {
			file: "com.emilberglund.batterymonitor.sdPlugin/bin/plugin.js",
			format: "cjs",
			sourcemap: isWatch,
		},
		external,
		plugins: plugins(),
	},
	// Standalone device scan (`npm run scan`) — same discovery code, run from a
	// terminal so you can see what the machine actually exposes.
	{
		input: "src/scan.ts",
		output: {
			file: "com.emilberglund.batterymonitor.sdPlugin/bin/scan.js",
			format: "cjs",
			sourcemap: false,
		},
		external,
		plugins: plugins(),
	},
];
