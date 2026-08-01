import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * Correctness rules only. Formatting is Prettier's job, and style opinions
 * beyond that would mean rewriting a codebase that is already consistent.
 */
export default tseslint.config(
	{
		ignores: [
			"com.emilberglund.batterymonitor.sdPlugin/**",
			".test-build/**",
			"node_modules/**",
			"scripts/**",
			"rollup.config.mjs",
			"eslint.config.mjs",
		],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		languageOptions: {
			// Both, because the tests live outside the plugin's own tsconfig.
			parserOptions: {
				project: ["./tsconfig.json", "./tsconfig.test.json"],
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			// `_`-prefixed parameters are the established way of saying "required by
			// the signature, deliberately unused" throughout the actions layer.
			"@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],

			// The HeadsetControl and PowerShell payloads are genuinely untyped at the
			// boundary; they are validated on the way in instead (see providers).
			"@typescript-eslint/no-explicit-any": "warn",

			// An unawaited promise in a poll chain is a silently dropped update.
			"@typescript-eslint/no-floating-promises": "error",
			"@typescript-eslint/await-thenable": "error",
		},
	},
	{
		files: ["test/**/*.ts"],
		rules: {
			// Tests reach into protected members on purpose to exercise the base class.
			"@typescript-eslint/no-explicit-any": "off",
			// node:test's describe/it return promises nobody is meant to await.
			"@typescript-eslint/no-floating-promises": "off",
		},
	},
);
