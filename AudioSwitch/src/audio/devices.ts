import { AudioHost } from "./host";
import { log } from "./log";

/** Which way the sound goes: "output" is playback, "input" is recording. */
export type Flow = "output" | "input";

/**
 * Which of Windows' two defaults a switch changes. "default" is what games,
 * browsers and music players use; "communications" is what call software
 * (Discord, Teams) picks up. "both" is what most people mean by switching.
 */
export type Role = "both" | "default" | "communications";

export type AudioDevice = {
	/** Windows' endpoint id. Stable across reboots; can change with a driver reinstall. */
	id: string;
	flow: Flow;
	/** The full name Windows shows: "Speakers (Realtek Audio)". */
	name: string;
	/** The part before the brackets. Often generic: three microphones all called "Microphone". */
	description: string;
	/** The part inside the brackets: the hardware the endpoint belongs to. */
	adapter: string;
	/**
	 * Windows' own idea of what the endpoint is (`EndpointFormFactor`): 1 speakers,
	 * 2 line level, 3 headphones, 4 microphone, 5 headset, 8 S/PDIF, 9 display.
	 * -1 when the driver doesn't say.
	 */
	formFactor: number;
	isDefault: boolean;
	isCommunications: boolean;
};

const ROLES: readonly Role[] = ["both", "default", "communications"];

/**
 * Reads a host reply into a device list.
 *
 * The host is another process speaking a hand-written JSON, so nothing is taken
 * on trust: a reply that isn't the expected shape throws, and a device without
 * a usable id or flow is dropped, since everything downstream keys on those.
 */
export function parseReply(raw: string): AudioDevice[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new Error(`audio host sent something that isn't JSON: ${raw.slice(0, 120)}`);
	}
	if (!parsed || typeof parsed !== "object") throw new Error("audio host sent an empty reply");

	const reply = parsed as Record<string, unknown>;
	if (reply.ok !== true) {
		throw new Error(typeof reply.error === "string" ? reply.error : "audio host reported a failure");
	}
	if (!Array.isArray(reply.devices)) throw new Error("audio host reply has no device list");

	const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

	return reply.devices
		.filter((d): d is Record<string, unknown> => !!d && typeof d === "object")
		.filter((d) => typeof d.id === "string" && d.id !== "" && (d.flow === "output" || d.flow === "input"))
		.map((d) => {
			const description = text(d.description);
			const adapter = text(d.adapter);
			return {
				id: d.id as string,
				flow: d.flow as Flow,
				name: text(d.name) || description || adapter || "Audio device",
				description,
				adapter,
				formFactor: typeof d.formFactor === "number" && Number.isInteger(d.formFactor) ? d.formFactor : -1,
				isDefault: d.isDefault === true,
				isCommunications: d.isCommunications === true,
			};
		});
}

/** How often the list is re-read while a key is on screen. A read is about 15 ms. */
const POLL_MS = 2000;

/**
 * The plugin's view of the machine's audio devices: the last list read, and a
 * way to hear when it changes.
 *
 * Keys never talk to the host themselves. They draw from this list and are told
 * when it changes, so a switch made by one key, or in Windows' own settings,
 * reaches every key the same way.
 */
export class DeviceStore {
	private current: AudioDevice[] = [];
	private signature = "[]";
	private loaded = false;
	private readonly listeners = new Set<() => void>();
	private watchers = 0;
	private timer?: NodeJS.Timeout;
	/** Last poll failure logged, so a host that stays broken says so once, not every two seconds. */
	private lastFailure?: string;

	constructor(
		private readonly host: AudioHost,
		private readonly pollMs: number = POLL_MS,
	) {}

	/** The last list read. Empty until the first read finishes; see {@link isLoaded}. */
	list(): AudioDevice[] {
		return this.current;
	}

	/** Whether any read has finished, to tell "no devices" from "not asked yet". */
	isLoaded(): boolean {
		return this.loaded;
	}

	/** Reads the list from Windows now. */
	async refresh(): Promise<AudioDevice[]> {
		if (!this.host.available) return this.adopt([]);
		return this.adopt(parseReply(await this.host.request("list")));
	}

	/** Makes a device the default for the given role, and returns the list as it stands afterwards. */
	async setDefault(id: string, role: Role): Promise<AudioDevice[]> {
		// Both end up on the host's command line of sorts: a line-based protocol
		// where a space or a newline in the wrong place is a different request.
		if (!ROLES.includes(role)) throw new Error(`unknown role "${String(role)}"`);
		if (!id || /\s/.test(id)) throw new Error("not a valid device id");
		if (!this.host.available) throw new Error("audio switching needs Windows");

		return this.adopt(parseReply(await this.host.request(`set ${role} ${id}`)));
	}

	/** Calls back whenever the list changes. Returns the way to stop. */
	onChange(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/**
	 * Keeps the list fresh for as long as someone is looking. Each visible key
	 * holds one of these; polling runs while any are held and stops with the last.
	 */
	watch(): () => void {
		this.watchers += 1;
		if (!this.timer && this.host.available) {
			this.timer = setInterval(() => this.poll(), this.pollMs);
			// A key on screen is no reason to keep a finished process alive.
			this.timer.unref?.();
		}

		let released = false;
		return () => {
			if (released) return;
			released = true;
			this.watchers -= 1;
			if (this.watchers === 0 && this.timer) {
				clearInterval(this.timer);
				this.timer = undefined;
			}
		};
	}

	private poll(): void {
		this.refresh().then(
			() => {
				this.lastFailure = undefined;
			},
			(err) => {
				const message = String(err);
				if (message !== this.lastFailure) log.warn(`devices: could not read the device list: ${message}`);
				this.lastFailure = message;
			},
		);
	}

	private adopt(list: AudioDevice[]): AudioDevice[] {
		const signature = JSON.stringify(list);
		const changed = signature !== this.signature || !this.loaded;
		this.current = list;
		this.signature = signature;
		this.loaded = true;

		if (changed) {
			for (const listener of [...this.listeners]) {
				try {
					listener();
				} catch (err) {
					log.warn(`devices: a change listener failed: ${String(err)}`);
				}
			}
		}
		return list;
	}
}

export const audioHost = new AudioHost();
export const devices = new DeviceStore(audioHost);
