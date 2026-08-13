import streamDeck, { SingletonAction } from "@elgato/streamdeck";
import type {
	DidReceiveSettingsEvent,
	KeyAction,
	KeyDownEvent,
	SendToPluginEvent,
	WillAppearEvent,
	WillDisappearEvent,
} from "@elgato/streamdeck";
import { findHeadsetControl, HEADSETCONTROL_RELEASES } from "../providers/headsetcontrol";
import type { BatteryReading, DeviceKind } from "../providers/types";
import { batteryKeyImage } from "../ui/battery-svg";
import { applyAppearance, shareAppearance, sharedAppearance } from "./appearance";
import { listApps } from "./apps";
import { openTarget } from "./launch";
import type { ChargeGuess } from "./charging";
import type { Appearance, BatterySettings, PollMode } from "./settings";
import { extractAppearance, faceColors, migrate, nextPollSeconds, refreshSeconds, resolved } from "./settings";
import type { UiMessage } from "./ui-messages";
import { replyToPanel } from "./ui-messages";

/** Charging pulse: 8 steps of 450ms, i.e. a slow ~3.6s breath. */
const PULSE_INTERVAL_MS = 450;
const PULSE_STEPS = 8;

/** What a subclass hands back from a read. */
export type Reading<TSettings> = {
	reading: BatteryReading;
	kind: DeviceKind;
	/** Settings as they now stand — a read may persist something. */
	settings: TSettings;
};

/** What actually gets drawn, once the subclass has had its say. */
export type Face = {
	reading: BatteryReading;
	kind: DeviceKind;
	/** Text for the line under the meter; empty for none. */
	name: string;
	/** Marks the face as "emptiest of several" (see the lowest-battery action). */
	lowest?: boolean;
};

/**
 * Everything tracked for one visible key. A key's timers, its last reading and
 * the bookkeeping used to spot what changed all live and die together, so
 * they're one record rather than a map each.
 */
export type KeyState<TSettings> = {
	/**
	 * Polling is a chain of one-shot timers rather than an interval, because in
	 * adaptive mode the next wait depends on what the last reading said.
	 */
	pollTimer?: NodeJS.Timeout;
	/** Configured interval and mode the chain was armed with, to spot an edit. */
	pollBase?: number;
	pollMode?: PollMode;
	/** Consecutive readings that said the same thing; drives the adaptive backoff. */
	unchanged: number;
	/** Whether the warning has already fired for this trip below the threshold. */
	alerted?: boolean;
	pulseTimer?: NodeJS.Timeout;
	pulsePhase: number;
	/** Last thing drawn, enough to repaint without touching a device. */
	drawn?: { reading: BatteryReading; kind: DeviceKind; settings: TSettings };
	/**
	 * Last title written, boxed so "never written" is distinguishable from
	 * "written as undefined" — the latter hands the title back to Stream Deck.
	 */
	titleApplied?: { value: string | undefined };
	/** When a live reading last arrived, to the second. */
	lastLiveAt?: number;
	/** A message owns the key; painting is suspended until it clears. */
	showingNotice?: boolean;
	noticeTimer?: NodeJS.Timeout;
	/**
	 * Whether this key's device looks like it's charging, for a provider that
	 * can't say so itself. Lives here so it's discarded with everything else when
	 * the key goes away — see {@link ChargeGuess}.
	 */
	charge?: ChargeGuess;
};

/**
 * The machinery every battery key shares: a poll chain, the charging pulse, the
 * warning latch, title handling, and painting a face.
 *
 * Subclasses supply the two things that actually differ — where the reading
 * comes from ({@link read}) and how it's presented ({@link present}). Everything
 * else was duplicated across the actions before this existed, and had already
 * started to drift.
 */
export abstract class KeyFaceAction<TSettings extends BatterySettings> extends SingletonAction<TSettings> {
	protected readonly keys = new Map<string, KeyState<TSettings>>();

	/** Where the reading comes from. Called on every poll and on every press. */
	protected abstract read(
		action: KeyAction<TSettings>,
		settings: TSettings,
		force: boolean,
	): Promise<Reading<TSettings>>;

	/**
	 * How the reading is presented: the substitutions a subclass wants applied
	 * (last-known level, power source), the name line, and any face flags.
	 */
	protected abstract present(
		action: KeyAction<TSettings>,
		settings: TSettings,
		live: BatteryReading,
		kind: DeviceKind,
	): Face;

	/** The device's name for titles. Overridden where a nickname can apply. */
	protected label(_settings: TSettings, reading: BatteryReading): string {
		return reading.deviceLabel;
	}

	/**
	 * Extra defaults a subclass wants written into a brand-new key, on top of the
	 * migration every key gets. Empty for a key that has nothing of its own.
	 */
	protected freshDefaults(): Partial<TSettings> {
		return {};
	}

	/**
	 * Settings written the first time a key appears: the migration, plus the look
	 * already shared across the deck if there is one.
	 *
	 * A key dropped onto a deck that has a shared appearance should match it
	 * rather than arrive in the shipped defaults and need setting up again.
	 */
	protected async ensureDefaults(action: KeyAction<TSettings>, settings: TSettings): Promise<TSettings> {
		const migrated = migrate(settings);
		if (!migrated) return settings;

		const shared = settings.configured ? undefined : await sharedAppearance();
		const merged = { ...this.freshDefaults(), ...migrated, ...(shared ?? {}) };

		await action.setSettings(merged);
		return merged;
	}

	/**
	 * The panel requests both battery actions answer the same way. A subclass
	 * overrides this for its own events and calls `super` for the rest.
	 */
	override async onSendToPlugin(ev: SendToPluginEvent<UiMessage, TSettings>): Promise<void> {
		if (ev.payload?.event === "getApps") {
			await this.sendApps(ev.payload?.isRefresh === true);
			return;
		}

		// Both battery actions warn about a missing HeadsetControl, so both have to
		// be able to answer the question. Lowest Battery needs it at least as much
		// as Device Battery does: without the tool, headsets report nothing, and a
		// key that shows "whichever is emptiest" would quietly be answering that
		// question with every headset left out of the running.
		if (ev.payload?.event === "getHeadsetTool") {
			const binary = await findHeadsetControl();
			// Logged because the panel's answer and the headset provider's answer can
			// disagree, and when they do there is nothing on screen to say which
			// candidate path was tried or what it did.
			streamDeck.logger.info(`headset tool: ${binary ? `found at ${binary}` : "not found"}`);
			await replyToPanel({ event: "getHeadsetTool", installed: binary !== null, binary });
			return;
		}

		if (ev.payload?.event === "openHeadsetTool") {
			// Stream Deck opens it in the real browser; the inspector is a webview
			// with no place to put a page.
			await streamDeck.system.openUrl(HEADSETCONTROL_RELEASES);
			return;
		}

		if (ev.payload?.event === "shareAppearance") {
			const source = this.keys.get(ev.action.id)?.drawn?.settings;
			if (source) {
				await shareAppearance(extractAppearance(source));
				streamDeck.logger.info(`${this.constructor.name}: appearance shared with every key`);
			}
		}
	}

	override async onWillAppear(ev: WillAppearEvent<TSettings>): Promise<void> {
		if (!ev.action.isKey()) return;
		const settings = await this.ensureDefaults(ev.action, ev.payload.settings);
		await this.refresh(ev.action, settings);
		this.schedule(ev.action, settings);
	}

	override onWillDisappear(ev: WillDisappearEvent<TSettings>): void {
		const state = this.keys.get(ev.action.id);
		if (!state) return;
		clearTimeout(state.pollTimer);
		clearInterval(state.pulseTimer);
		clearTimeout(state.noticeTimer);
		this.keys.delete(ev.action.id);
	}

	override async onKeyDown(ev: KeyDownEvent<TSettings>): Promise<void> {
		// First, because it's the part the press is visibly for: waiting on a scan
		// before launching would make the app feel slow to open.
		this.openConfiguredTarget(ev.payload.settings);
		await this.onPress(ev);
	}

	/** A press reads immediately; subclasses extend this for their own extras. */
	protected async onPress(ev: KeyDownEvent<TSettings>): Promise<void> {
		await this.refresh(ev.action, ev.payload.settings, true);
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<TSettings>): Promise<void> {
		if (!ev.action.isKey()) return;
		const settings = ev.payload.settings;
		const state = this.state(ev.action.id);

		// Appearance edits repaint from the last reading with no device I/O, so
		// dragging a colour or a slider follows the pointer.
		if (state.drawn && !(await this.needsReread(ev.action, settings))) {
			state.drawn.settings = settings;
			await this.render(ev.action, settings, state.drawn.reading, state.drawn.kind);
		} else {
			await this.refresh(ev.action, settings);
		}

		// Restarting the timer on every keystroke would keep pushing the next poll
		// out of reach, so only do it when the interval or the mode changed.
		const mode = resolved(settings).pollMode;
		if (state.pollBase !== refreshSeconds(settings) || state.pollMode !== mode) {
			this.schedule(ev.action, settings);
		}
	}

	/** Whether an edit changed what's watched, rather than how it looks. */
	protected async needsReread(_action: KeyAction<TSettings>, _settings: TSettings): Promise<boolean> {
		return false;
	}

	/** Adopts a shared look. Called for every key when global settings change. */
	async applyShared(appearance: Appearance): Promise<void> {
		await applyAppearance(this.actions, appearance);
	}

	protected state(actionId: string): KeyState<TSettings> {
		let state = this.keys.get(actionId);
		if (!state) {
			state = { pulsePhase: 0, unchanged: 0 };
			this.keys.set(actionId, state);
		}
		return state;
	}

	/** Feeds an app picker; both battery actions offer one. */
	protected async sendApps(force: boolean): Promise<void> {
		const apps = await listApps(force);
		const items = apps.map((app) => ({ label: app.name, value: app.target }));
		items.unshift({ label: "Don't open anything", value: "" });
		await replyToPanel({ event: "getApps", items });
	}

	/**
	 * Arms the next poll. Each tick re-arms itself, so an adaptive key can widen
	 * or narrow its own interval as the reading changes.
	 */
	protected schedule(action: KeyAction<TSettings>, settings: TSettings): void {
		const state = this.state(action.id);
		clearTimeout(state.pollTimer);

		state.pollBase = refreshSeconds(settings);
		state.pollMode = resolved(settings).pollMode;

		const seconds = nextPollSeconds(settings, state.drawn?.reading, state.unchanged);
		state.pollTimer = setTimeout(() => {
			// Read the settings fresh on every tick. Closing over the settings from
			// when the timer was created would repaint with a stale appearance,
			// silently undoing any edit made since.
			// Whatever the tick managed to read, so a failure after the fetch still
			// rearms from current settings rather than the ones this timer was
			// created with — reviving a poll interval the user has since changed.
			let latest = settings;
			action
				.getSettings()
				.then(async (current) => {
					latest = current;
					await this.refresh(action, current);
				})
				.catch((err) => {
					streamDeck.logger.error(`${this.constructor.name}: scheduled refresh failed`, err);
				})
				// Keep the chain alive; a failed tick shouldn't stop the key updating.
				.finally(() => this.schedule(action, latest));
		}, seconds * 1000);
	}

	protected async refresh(action: KeyAction<TSettings>, settings: TSettings, force = false): Promise<void> {
		try {
			const result = await this.read(action, settings, force);
			await this.draw(action, result.settings, result.reading, result.kind);
			await this.warnOnCrossing(action, result.settings, result.reading);
		} catch (err) {
			streamDeck.logger.error(`${this.constructor.name}: refresh threw`, err);
			await this.draw(
				action,
				settings,
				{ deviceLabel: settings.deviceLabel ?? "Error", percent: null, status: "error" },
				settings.deviceKind ?? "other",
			);
		}
	}

	/**
	 * Flashes the warning when the level crosses below the threshold — once per
	 * trip, not once per poll.
	 *
	 * Firing on every reading under the threshold is six flashes a minute at a 10s
	 * interval, which is enough to make anyone turn the warning off entirely and
	 * lose the one alert that mattered. A last-known level never counts: a device
	 * left off below the threshold would warn forever.
	 */
	protected async warnOnCrossing(
		action: KeyAction<TSettings>,
		settings: TSettings,
		reading: BatteryReading,
	): Promise<void> {
		const alertBelow = resolved(settings).alertBelow;
		const state = this.state(action.id);

		if (alertBelow <= 0 || reading.percent === null || reading.status === "stale") return;

		if (reading.percent >= alertBelow || reading.status === "charging") {
			state.alerted = false;
			return;
		}

		if (state.alerted) return;
		state.alerted = true;
		await action.showAlert();
	}

	/**
	 * Renders and remembers the reading, so later edits can repaint it for free.
	 * What's cached is the live reading, before any substitution a subclass makes
	 * at render time — that's what lets toggling those settings repaint without
	 * touching the device.
	 */
	protected async draw(
		action: KeyAction<TSettings>,
		settings: TSettings,
		reading: BatteryReading,
		kind: DeviceKind,
	): Promise<void> {
		const state = this.state(action.id);

		// A number that came off the device just now — the moment worth reporting
		// as "last connected", regardless of whether the level moved.
		if (reading.percent !== null && reading.status !== "stale") state.lastLiveAt = Date.now();

		const previous = state.drawn?.reading;
		const same = previous?.percent === reading.percent && previous?.deviceLabel === reading.deviceLabel;
		state.unchanged = same ? state.unchanged + 1 : 0;

		state.drawn = { reading, kind, settings };

		if (reading.status === "charging") this.startPulse(action);
		else this.stopPulse(action.id);

		await this.render(action, settings, reading, kind);
	}

	/**
	 * Drives the charging animation. Stream Deck rasterises the SVG once per
	 * setImage, so animation means re-sending the image; each frame is a pure
	 * re-render off the cached reading, with no device I/O.
	 */
	protected startPulse(action: KeyAction<TSettings>): void {
		const state = this.state(action.id);
		if (state.pulseTimer) return;

		state.pulseTimer = setInterval(() => {
			const drawn = state.drawn;
			if (!drawn || drawn.reading.status !== "charging") {
				this.stopPulse(action.id);
				return;
			}

			state.pulsePhase = (state.pulsePhase + 1) % PULSE_STEPS;
			this.render(action, drawn.settings, drawn.reading, drawn.kind, state.pulsePhase).catch((err) =>
				streamDeck.logger.error(`${this.constructor.name}: pulse frame failed`, err),
			);
		}, PULSE_INTERVAL_MS);
	}

	protected stopPulse(actionId: string): void {
		const state = this.keys.get(actionId);
		if (!state?.pulseTimer) return;
		clearInterval(state.pulseTimer);
		state.pulseTimer = undefined;
		state.pulsePhase = 0;
	}

	/** Paints the key from a live reading; `live` is what came off the device. */
	protected async render(
		action: KeyAction<TSettings>,
		settings: TSettings,
		live: BatteryReading,
		kind: DeviceKind,
		phase = 0,
	): Promise<void> {
		// A message owns the key while it's up; the reading behind it is cached
		// and gets drawn when the message clears.
		if (this.state(action.id).showingNotice) return;

		const face = this.present(action, settings, live, kind);
		const look = resolved(settings);

		await action.setImage(
			batteryKeyImage({
				percent: face.reading.percent,
				status: face.reading.status,
				kind: face.kind,
				name: face.name,
				style: look.style,
				showIcon: look.showIcon,
				showPercent: look.showPercent,
				showName: face.name !== "",
				lowThreshold: look.lowThreshold,
				mediumThreshold: look.mediumThreshold,
				colors: faceColors(settings),
				lowest: face.lowest,
				// Sine so the breath eases at both ends instead of ramping linearly.
				pulse: (Math.sin((2 * Math.PI * phase) / PULSE_STEPS) + 1) / 2,
			}),
		);

		await this.applyTitle(action, settings, face.reading);
	}

	/**
	 * Writes the key's title, or gives it back.
	 *
	 * Switching away from a title has to actively undo what was written, or the
	 * last one stays on the key for good. `setTitle()` with no argument is the
	 * undo: Stream Deck restores the manifest's title.
	 *
	 * The applied value is remembered so a repaint doesn't re-send an unchanged
	 * title, and it starts unset so the first paint after a restart always writes
	 * — which is what clears a title left by a previous run.
	 */
	protected async applyTitle(
		action: KeyAction<TSettings>,
		settings: TSettings,
		reading: BatteryReading,
	): Promise<void> {
		const mode = resolved(settings).titleMode;

		let wanted: string | undefined;
		if (mode === "device") {
			wanted = this.label(settings, reading);
		} else if (mode === "percent") {
			// A last-known level gets a "~" so the title doesn't claim to be current.
			const prefix = reading.status === "stale" ? "~" : "";
			wanted = reading.percent === null ? "" : `${prefix}${reading.percent}%`;
		}

		const state = this.state(action.id);
		if (state.titleApplied?.value === wanted) return;

		await action.setTitle(wanted);
		state.titleApplied = { value: wanted };
	}

	/**
	 * Opens the app, file or URL the key is pointed at, if it's set to.
	 *
	 * A failure is logged rather than shown: the key's warning means "your device
	 * is gone", and giving it a second meaning would blunt both.
	 */
	protected openConfiguredTarget(settings: TSettings): void {
		// A typed path beats the picker, so the text box can override without
		// having to clear the list first.
		const target = settings.pressCustomTarget?.trim() || settings.pressTarget?.trim();
		if (!target) return;

		try {
			streamDeck.logger.info(`${this.constructor.name}: press opens ${target}`);
			openTarget(target);
		} catch (err) {
			streamDeck.logger.error(`${this.constructor.name}: couldn't open ${target}`, err);
		}
	}
}
