import streamDeck, { action } from "@elgato/streamdeck";
import type { KeyAction, KeyDownEvent, SendToPluginEvent } from "@elgato/streamdeck";
import { discovery } from "../providers/discovery";
import { powerTier } from "../providers/types";
import type { BatteryReading, DeviceKind, DiscoveredDevice } from "../providers/types";
import { noticeKeyImage } from "../ui/battery-svg";
import type { Face, KeyState, Reading } from "./key-face";
import { KeyFaceAction } from "./key-face";
import { labelOf, withRenames } from "./renames";
import { nextChargeGuess } from "./charging";
import type { BatterySettings } from "./settings";
import type { UiListEntry, UiMessage } from "./ui-messages";
import { replyToPanel } from "./ui-messages";
import { estimateRemaining, faceColors, formatDuration, recordSample, resolved } from "./settings";

/** Shown on the key when it's pressed while its device isn't connected. */
const DISCONNECTED_NOTICE = "Device is Disconnected";
const NOTICE_MS = 2500;

/**
 * How long the persisted "last seen" stamp may drift before it's rewritten.
 *
 * The live age comes from memory and is exact; this copy exists so a key that
 * has just been restarted can still say roughly when the device was last there.
 * Rewriting it on every poll would be a settings write a minute, forever.
 */
const LAST_SEEN_TOUCH_MS = 5 * 60_000;

/**
 * Heading for each group in the device picker, in the order they appear.
 *
 * Index is the {@link powerTier}, so the headings and the sort can't disagree
 * about which devices belong under which. These replace the per-entry suffixes
 * the list used to carry ("… (mains powered)") — a heading says it once for the
 * whole block instead of repeating it on every line.
 */
const TIER_HEADINGS = ["Battery", "Mains powered", "No battery data"] as const;

/**
 * The device list as dropdown groups.
 *
 * Devices arrive already sorted by tier (see discovery.ts), but that order is
 * only visible as a boundary once each block is under its own heading. Empty
 * tiers are left out: an optgroup with no options still draws its heading.
 */
export function groupedDevices(devices: DiscoveredDevice[]): UiListEntry[] {
	return TIER_HEADINGS.map((label, tier) => ({
		label,
		children: devices.filter((d) => powerTier(d) === tier).map((d) => ({ label: pickerLabel(d), value: d.key })),
	})).filter((group) => group.children.length > 0);
}

/**
 * How a device reads in the picker.
 *
 * The group heading already says what it can report, so the only thing left to
 * add is where the protocol behind it has never met the hardware. Silence there
 * would be the worse choice: a wrong or missing level from an untested decoder
 * is indistinguishable from a broken plugin, and the person seeing it is the
 * only one who can confirm it either way.
 */
function pickerLabel(device: DiscoveredDevice): string {
	return device.unverified ? `${device.label} (untested — please report)` : device.label;
}

/** One line for the property inspector's status strip, in the user's terms. */
function statusWording(reading: BatteryReading): string {
	switch (reading.status) {
		case "charging":
			return reading.detail === "Charge complete" ? "On the charger, full" : "Charging";
		case "mains":
			return "Mains powered";
		case "stale":
			return "Disconnected — last known level";
		case "not-found":
			return "Not detected";
		case "unsupported":
			return "No battery to read";
		case "error":
			return "Couldn't be read";
		default:
			return "Connected";
	}
}

/** Which of the strip's three looks to use. */
function statusTone(status: BatteryReading["status"]): "charging" | "offline" | "ok" | "idle" {
	if (status === "charging") return "charging";
	if (status === "stale" || status === "not-found" || status === "error") return "offline";
	if (status === "ok" || status === "mains") return "ok";
	return "idle";
}

/**
 * Coarse "how long ago", e.g. "12m" / "3h" / "2d". Empty for anything under a
 * minute (and for a missing timestamp), where "0m ago" would say nothing.
 */
function ageLabel(at: number | undefined): string {
	if (at === undefined) return "";
	const minutes = Math.floor((Date.now() - at) / 60_000);
	if (minutes < 1) return "";
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h`;
	return `${Math.floor(hours / 24)}d`;
}

/**
 * One device on one key: its level, and what it's doing.
 *
 * The polling, pulsing, titles and warnings live in {@link KeyFaceAction}. What
 * belongs here is everything specific to watching one chosen device — resolving
 * it, remembering what it last said, and the substitutions that make a missing
 * reading useful rather than blank.
 */
@action({ UUID: "com.emilberglund.batterymonitor.battery-status" })
export class BatteryStatusAction extends KeyFaceAction<BatterySettings> {
	/**
	 * The charge guess for a key, created on first use. Lives on {@link KeyState}
	 * so it's discarded with the rest of the key's state when the key goes away.
	 */
	private charge(actionId: string): NonNullable<KeyState<BatterySettings>["charge"]> {
		const state = this.state(actionId);
		return (state.charge ??= { rising: false });
	}

	protected async read(
		action: KeyAction<BatterySettings>,
		settings: BatterySettings,
		force: boolean,
	): Promise<Reading<BatterySettings>> {
		const charge = this.charge(action.id);
		charge.deviceKey = settings.deviceKey;

		const device = await this.resolve(action, settings, force);
		if (!device) {
			// A device that comes back at a higher level was charged somewhere else,
			// which isn't the same as charging now.
			charge.rising = false;
			charge.risingSince = undefined;
			return {
				settings,
				kind: settings.deviceKind ?? "other",
				reading: {
					deviceLabel: settings.deviceLabel ?? "No device",
					percent: null,
					status: "not-found",
					detail: settings.deviceKey
						? `${settings.deviceLabel ?? settings.deviceKey} not detected`
						: "No battery-capable device detected",
				},
			};
		}

		// discover() already read the battery for most providers; only pay for a
		// second round-trip when the scan didn't produce one (or it's stale).
		const reported = !force && device.reading ? device.reading : await this.readDevice(device);

		// Compared against the stored level, so this has to happen before
		// `remember` overwrites it with the new one.
		const live = this.inferCharging(action.id, settings, device, reported);

		// Persist first: a fresh percentage becomes the fallback for the next time
		// the device is gone, and `remember` may correct the label/kind.
		const current = await this.remember(action, settings, device, live);

		if (live.status === "error") {
			streamDeck.logger.warn(`battery-status: ${device.key} error: ${live.detail}`);
		}

		return { settings: current, reading: live, kind: device.kind };
	}

	/**
	 * Applies this key's substitutions at render time rather than at read time, so
	 * toggling any of them repaints from the cached reading without touching the
	 * device.
	 */
	protected present(
		action: KeyAction<BatterySettings>,
		settings: BatterySettings,
		live: BatteryReading,
		kind: DeviceKind,
	): Face {
		const reading = this.forPowerSource(settings, this.withLastKnown(settings, live));
		const lastLiveAt = this.state(action.id).lastLiveAt;

		// "auto" believes the provider; anything else is the user saying they know
		// better, which for a device the OS calls "Bluetooth device" they do.
		const drawnKind = settings.iconKind && settings.iconKind !== "auto" ? settings.iconKind : kind;

		return { reading, kind: drawnKind, name: this.nameLine(settings, reading, lastLiveAt) };
	}

	/**
	 * What to call the device. A nickname typed on this key wins over the one it
	 * reports — Windows names one phone on the dev machine "4", and no amount of
	 * probing improves on a name the owner chose.
	 */
	protected override label(settings: BatterySettings, reading: BatteryReading): string {
		// Nickname is this key's own answer and wins; a rename is the plugin-wide
		// one; the device's own name is the fallback.
		return settings.displayName?.trim() || labelOf(settings.deviceKey, reading.deviceLabel);
	}

	/** Only a changed device needs a lookup; appearance edits repaint for free. */
	protected override async needsReread(
		action: KeyAction<BatterySettings>,
		settings: BatterySettings,
	): Promise<boolean> {
		return this.state(action.id).charge?.deviceKey !== settings.deviceKey;
	}

	/**
	 * A press means "tell me now", so it bypasses the discovery cache — and a
	 * forced scan takes a couple of seconds.
	 *
	 * The warning therefore goes up *before* the scan rather than after it. The
	 * key already knows the device was missing a moment ago, and that's what the
	 * press is asking about; waiting for the rescan to confirm it would leave the
	 * press looking ignored for as long as the scan takes.
	 */
	protected override async onPress(ev: KeyDownEvent<BatterySettings>): Promise<void> {
		const known = this.state(ev.action.id).drawn;
		const wasDisconnected = known?.reading.status === "not-found";
		if (wasDisconnected && known) await this.notify(ev.action, known.settings);

		await this.refresh(ev.action, ev.payload.settings, true);

		// The scan can also be what discovers the device is gone, in which case
		// this is the first chance to say so.
		const now = this.state(ev.action.id).drawn;
		if (!wasDisconnected && now?.reading.status === "not-found") {
			await this.notify(ev.action, now.settings);
		}
	}

	override async onSendToPlugin(ev: SendToPluginEvent<UiMessage, BatterySettings>): Promise<void> {
		if (ev.payload?.event === "getStatus") {
			await this.sendStatus(ev.action.id);
			return;
		}
		// getApps, shareAppearance and the HeadsetControl pair are answered
		// identically by both battery actions, so they're handled once in the base
		// class.
		if (ev.payload?.event !== "getDevices") {
			await super.onSendToPlugin(ev);
			return;
		}

		const force = ev.payload?.isRefresh === true;
		streamDeck.logger.info(`battery-status: property inspector requested devices (force=${force})`);

		const devices = withRenames(await discovery.list(force));
		const settings = await ev.action.getSettings();
		const items: UiListEntry[] = groupedDevices(devices);

		// Keep a previously chosen but currently absent device selectable, otherwise
		// the dropdown would silently clear the user's configuration.
		if (settings.deviceKey && !devices.some((d) => d.key === settings.deviceKey)) {
			items.push({
				label: "Not detected",
				children: [{ label: settings.deviceLabel ?? settings.deviceKey, value: settings.deviceKey }],
			});
		}

		if (items.length === 0) {
			items.push({ label: "No devices detected — press the refresh button", value: "" });
		}

		await replyToPanel({ event: "getDevices", items });
	}

	/**
	 * Tells the property inspector what the key is currently showing, so the panel
	 * opens with an answer rather than only questions. It reports the reading
	 * already drawn — no device is touched — so the panel can ask as often as it
	 * likes.
	 */
	private async sendStatus(actionId: string): Promise<void> {
		const drawn = this.keys.get(actionId)?.drawn;
		if (!drawn) {
			await replyToPanel({ event: "getStatus", status: null });
			return;
		}

		const settings = drawn.settings;
		const reading = this.forPowerSource(settings, this.withLastKnown(settings, drawn.reading));
		const age = ageLabel(this.keys.get(actionId)?.lastLiveAt ?? settings.lastSeenAt);

		await replyToPanel({
			event: "getStatus",
			status: {
				label: this.label(settings, reading),
				percent: reading.percent,
				state: reading.status === "stale" && age ? `Disconnected — last seen ${age} ago` : statusWording(reading),
				tone: statusTone(reading.status),
			},
		});
	}

	/**
	 * Puts a message on the key for a moment. Painting is suspended while it's up
	 * — the refresh running behind it would otherwise replace it with the face
	 * mid-message — and resumes when the face is restored.
	 */
	private async notify(action: KeyAction<BatterySettings>, settings: BatterySettings): Promise<void> {
		const state = this.state(action.id);
		clearTimeout(state.noticeTimer);
		state.showingNotice = true;

		await action.showAlert();
		await action.setImage(noticeKeyImage(DISCONNECTED_NOTICE, faceColors(settings)));

		state.noticeTimer = setTimeout(() => {
			state.showingNotice = false;
			const current = state.drawn;
			if (!current) return;
			this.render(action, current.settings, current.reading, current.kind).catch((err) =>
				streamDeck.logger.error("battery-status: restoring the face after a notice failed", err),
			);
		}, NOTICE_MS);
	}

	/** Maps the stored device key to a currently-detected device. */
	private async resolve(
		action: KeyAction<BatterySettings>,
		settings: BatterySettings,
		force: boolean,
	): Promise<DiscoveredDevice | undefined> {
		if (settings.deviceKey) return discovery.find(settings.deviceKey, force);

		// Nothing configured yet: pick something useful so a freshly dropped key
		// isn't blank, and persist it so the property inspector agrees.
		const devices = await discovery.list(force);
		const pick = devices.find((d) => d.supportsBattery) ?? devices[0];
		if (pick) await action.setSettings({ ...settings, deviceKey: pick.key });
		return pick;
	}

	private async readDevice(device: DiscoveredDevice): Promise<BatteryReading> {
		const provider = discovery.provider(device.providerId);
		if (!provider) {
			return {
				deviceLabel: device.label,
				percent: null,
				status: "error",
				detail: `Unknown provider ${device.providerId}`,
			};
		}
		return provider.read(device);
	}

	/**
	 * Marks a device as charging when its level is going up, for providers that
	 * can't tell us directly.
	 *
	 * A source like the Windows PnP battery property gives a percentage and
	 * nothing else, so a phone on a charger looks exactly like one in a pocket. A
	 * level that has risen since the last reading is the one thing that can't
	 * happen off a charger, so that's the signal; it stays set while the level
	 * holds (a phone parked at 100% is still plugged in) and clears when the level
	 * drops. It's a guess, and below 100% it's time-boxed too — see
	 * CHARGE_HOLD_MS — otherwise unplugging at a level the device then holds
	 * would keep the bolt for as long as the device is slow to lose that level.
	 */
	private inferCharging(
		actionId: string,
		settings: BatterySettings,
		device: DiscoveredDevice,
		reading: BatteryReading,
	): BatteryReading {
		const provider = discovery.provider(device.providerId);
		if (provider?.reportsCharging !== false) return reading;
		if (reading.status !== "ok" || reading.percent === null) return reading;

		const state = this.state(actionId);
		const next = nextChargeGuess(this.charge(actionId), settings.lastPercent, reading.percent, Date.now());
		state.charge = next;

		if (!next.rising) return reading;

		return { ...reading, status: "charging", detail: "Level rising — assumed to be charging" };
	}

	/**
	 * Substitutes the last known level when the live reading has no number of its
	 * own, so a device that's off or out of range shows where it was rather than a
	 * dash. The result is marked "stale" so the face renders it faded — the level
	 * is still useful, it just isn't current.
	 */
	private withLastKnown(settings: BatterySettings, reading: BatteryReading): BatteryReading {
		if (reading.percent !== null) return reading;
		if (!resolved(settings).showLastKnown) return reading;
		if (reading.status === "mains") return reading;

		// A stored level is the proof that matters. "unsupported" normally means
		// the device has no battery to read — but a ROG receiver whose keyboard is
		// switched off says exactly that, because the dongle is still plugged in
		// and only the device behind it went quiet. If this key has read a
		// percentage from it before, the battery is real and the provider is
		// saying "no answer just now", which is what being offline looks like.
		const percent = settings.lastPercent;
		if (percent === undefined) return reading;

		const age = ageLabel(settings.lastSeenAt);
		return {
			...reading,
			percent,
			status: "stale",
			detail: `${reading.detail ?? reading.deviceLabel} — last known ${percent}%${age ? ` (${age} ago)` : ""}`,
		};
	}

	/**
	 * Applies the key's power-source setting. Telling a key its device is always
	 * plugged in wins over whatever came back: a Bluetooth speaker that reports no
	 * level is indistinguishable from a headset whose battery can't be read, and
	 * only the user knows which one is on the desk.
	 */
	private forPowerSource(settings: BatterySettings, reading: BatteryReading): BatteryReading {
		if (resolved(settings).powerSource !== "mains") return reading;
		if (reading.status === "mains") return reading;
		return { deviceLabel: reading.deviceLabel, percent: null, status: "mains", detail: "Always plugged in" };
	}

	/**
	 * Caches what a disconnected device still needs to render: its label and kind,
	 * plus the last percentage it actually reported. Both go out in one write, so
	 * neither can overwrite the other with a stale copy of the settings.
	 */
	private async remember(
		action: KeyAction<BatterySettings>,
		settings: BatterySettings,
		device: DiscoveredDevice,
		reading: BatteryReading,
	): Promise<BatterySettings> {
		const patch: BatterySettings = {};

		if (settings.deviceLabel !== device.label || settings.deviceKind !== device.kind) {
			patch.deviceKey = device.key;
			patch.deviceLabel = device.label;
			patch.deviceKind = device.kind;
		}

		if (reading.percent !== null) {
			const drifted = Date.now() - (settings.lastSeenAt ?? 0) > LAST_SEEN_TOUCH_MS;
			if (settings.lastPercent !== reading.percent || drifted) {
				patch.lastPercent = reading.percent;
				patch.lastSeenAt = Date.now();
			}

			// Only a changed level is worth a sample; repeats say nothing about the
			// rate and would just push real history out of the window.
			if (settings.lastPercent !== reading.percent) {
				patch.history = recordSample(settings.history, reading.percent, Date.now());
			}
		}

		if (Object.keys(patch).length === 0) return settings;

		const merged = { ...settings, ...patch };
		await action.setSettings(merged);
		return merged;
	}

	/**
	 * Text for the small line under the meter — empty when there shouldn't be one.
	 *
	 * There's no user-typed title to defer to: the actions set
	 * `UserTitleEnabled: false`, so Stream Deck hides its Title field and
	 * "Nickname" is the single place a key is named.
	 */
	private nameLine(settings: BatterySettings, reading: BatteryReading, lastLiveAt?: number): string {
		if (!resolved(settings).showName) return "";
		return this.deviceLine(settings, reading, lastLiveAt);
	}

	/**
	 * The device's own line: its label, prefixed with how long ago the level was
	 * read while it's offline. The age goes first because the line is truncated
	 * from the right, and "how old is this number" is the part worth keeping.
	 *
	 * With "time left" on, the estimate takes the line instead: on a 72px key
	 * there's room for one of the two, and "2h 40m" is the more useful of them
	 * once you already know which key is which.
	 */
	private deviceLine(settings: BatterySettings, reading: BatteryReading, lastLiveAt?: number): string {
		const label = this.label(settings, reading);

		if (settings.showTimeLeft && reading.status === "ok" && reading.percent !== null) {
			const remaining = estimateRemaining(settings.history, reading.percent, Date.now());
			if (remaining !== null) return formatDuration(remaining);

			// Say so rather than quietly falling back to the device name: an estimate
			// needs a real fall over a real interval, and a key that looks unchanged
			// is indistinguishable from a setting that did nothing.
			return "measuring…";
		}

		if (reading.status !== "stale") return label;
		if (!resolved(settings).showOfflineAge) return label;

		// In-memory first: it's exact. The persisted stamp is the fallback after a
		// restart, when nothing in memory knows when the device was last seen.
		const age = ageLabel(lastLiveAt ?? settings.lastSeenAt);
		return age ? `${age} · ${label}` : label;
	}
}
