import { spawn } from "node:child_process";
import { encodedCommand } from "./host-script";
import { log } from "./log";

/**
 * The slice of a child process the host uses. Narrow on purpose: a test can
 * stand in for PowerShell with two streams and an emitter.
 */
export type HostProcess = {
	stdin: { write(chunk: string): unknown };
	stdout: { on(event: "data", listener: (chunk: Buffer | string) => void): unknown };
	on(event: "exit" | "error", listener: (...args: unknown[]) => void): unknown;
	kill(): unknown;
};

/** Compiling the C# takes about a second; antivirus scanning the compiler's output can add several more. */
const START_TIMEOUT_MS = 20_000;
/** A request is a few COM calls, around 15 ms. Anything near this is a hung host. */
const REQUEST_TIMEOUT_MS = 5_000;

function spawnPowerShell(): HostProcess {
	return spawn(
		"powershell.exe",
		// -InputFormat None keeps PowerShell's own hands off stdin, which the C#
		// reads directly. No -ExecutionPolicy: it governs script files, and this
		// is an inline command.
		["-NoProfile", "-NonInteractive", "-InputFormat", "None", "-EncodedCommand", encodedCommand()],
		{ windowsHide: true, stdio: ["pipe", "pipe", "ignore"] },
	);
}

type Waiter = { resolve: (line: string) => void; reject: (error: Error) => void; timer: NodeJS.Timeout };

/**
 * One long-lived PowerShell process that answers audio requests.
 *
 * Long-lived because starting PowerShell and compiling the C# costs about a
 * second, which is fine once and unusable on every key press. Kept alive, a
 * press is a line written to a pipe and a line read back.
 *
 * Requests run strictly one at a time. The protocol has no request ids, so the
 * only way to know which reply belongs to which request is never to have two
 * outstanding.
 */
export class AudioHost {
	/** False where there is nothing to talk to; callers treat that as "no devices". */
	readonly available: boolean;

	private child?: HostProcess;
	private buffer = "";
	private waiter?: Waiter;
	private queue: Promise<unknown> = Promise.resolve();

	constructor(
		private readonly spawnChild: () => HostProcess = spawnPowerShell,
		private readonly timeouts: { start: number; request: number } = {
			start: START_TIMEOUT_MS,
			request: REQUEST_TIMEOUT_MS,
		},
		available: boolean = process.platform === "win32",
	) {
		this.available = available;
	}

	/** Sends one request line and resolves with the host's reply line. */
	request(line: string): Promise<string> {
		const run = this.queue.then(() => this.exchange(line));
		// The queue must survive a failed request, or one timeout would reject
		// every request made after it.
		this.queue = run.catch(() => undefined);
		return run;
	}

	/** Stops the host. The next request starts a new one. */
	dispose(): void {
		this.drop(new Error("audio host stopped"));
	}

	private async exchange(line: string): Promise<string> {
		const child = this.child ?? (await this.start());
		const reply = this.nextLine(this.timeouts.request, `no reply to "${line.split(" ")[0]}"`);
		child.stdin.write(`${line}\n`);
		return reply;
	}

	private async start(): Promise<HostProcess> {
		const child = this.spawnChild();
		this.child = child;
		this.buffer = "";

		child.stdout.on("data", (chunk) => {
			if (this.child === child) this.receive(chunk.toString());
		});
		// A host that dies takes any pending request with it, and is replaced on
		// the next one. Both events can fire for one death; the second is a no-op.
		const gone = (what: string) => {
			if (this.child !== child) return;
			log.warn(`audio-host: ${what}`);
			this.child = undefined;
			this.fail(new Error(`audio host ${what}`));
		};
		child.on("exit", (code) => gone(`exited with code ${String(code)}`));
		child.on("error", (err) => gone(`could not run: ${String(err)}`));

		const first = await this.nextLine(this.timeouts.start, "did not start");
		if (!first.includes('"ready"')) {
			this.drop(new Error(`audio host failed to start: ${first}`));
			throw new Error(`audio host failed to start: ${first}`);
		}
		log.info("audio-host: ready");
		return child;
	}

	private nextLine(timeoutMs: number, what: string): Promise<string> {
		return new Promise<string>((resolve, reject) => {
			const timer = setTimeout(() => {
				// A host that missed a deadline can't be trusted to be in step any
				// more: its late reply would be read as the answer to the next request.
				const error = new Error(`audio host ${what} within ${timeoutMs} ms`);
				log.warn(`audio-host: ${error.message}`);
				this.drop(error);
			}, timeoutMs);
			this.waiter = { resolve, reject, timer };
			this.deliver();
		});
	}

	private receive(text: string): void {
		this.buffer += text;
		this.deliver();
	}

	/** Hands the oldest complete line to whoever is waiting for one. */
	private deliver(): void {
		if (!this.waiter) return;
		const end = this.buffer.indexOf("\n");
		if (end < 0) return;

		const line = this.buffer.slice(0, end).trim();
		this.buffer = this.buffer.slice(end + 1);
		if (!line) return this.deliver();

		const { resolve, timer } = this.waiter;
		this.waiter = undefined;
		clearTimeout(timer);
		resolve(line);
	}

	private fail(error: Error): void {
		if (!this.waiter) return;
		const { reject, timer } = this.waiter;
		this.waiter = undefined;
		clearTimeout(timer);
		reject(error);
	}

	private drop(error: Error): void {
		const child = this.child;
		this.child = undefined;
		this.buffer = "";
		this.fail(error);
		try {
			child?.kill();
		} catch {
			// Already gone, which is the state being asked for.
		}
	}
}
