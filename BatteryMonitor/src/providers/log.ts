/**
 * Tiny logging seam so the discovery/provider layer doesn't import the Stream
 * Deck SDK — that keeps it runnable outside Stream Deck (see src/scan.ts).
 * plugin.ts wires this to streamDeck.logger at startup.
 */
export type Log = {
	info(message: string, ...args: unknown[]): void;
	warn(message: string, ...args: unknown[]): void;
};

const noop: Log = { info: () => {}, warn: () => {} };

let current: Log = noop;

export function setLogger(logger: Log): void {
	current = logger;
}

export const log: Log = {
	info: (message, ...args) => current.info(message, ...args),
	warn: (message, ...args) => current.warn(message, ...args),
};
