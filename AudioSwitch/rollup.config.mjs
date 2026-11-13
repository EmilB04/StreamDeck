import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

const isWatch = !!process.env.ROLLUP_WATCH;

// Everything is bundled: the plugin has no native dependency, so nothing has to
// sit in node_modules next to bin/plugin.js at runtime.
export default {
	input: "src/plugin.ts",
	output: {
		file: "com.emilberglund.audioswitch.sdPlugin/bin/plugin.js",
		format: "cjs",
		sourcemap: isWatch,
	},
	plugins: [
		typescript({ tsconfig: "./tsconfig.json", sourceMap: isWatch }),
		nodeResolve({ preferBuiltins: true }),
		commonjs(),
		json(),
	],
};
