import streamDeck, { SingletonAction } from "@elgato/streamdeck";
import type {
	DidReceiveSettingsEvent,
	KeyAction,
	KeyDownEvent,
	SendToPluginEvent,
	WillAppearEvent,
	WillDisappearEvent,
} from "@elgato/streamdeck";
import type { AudioDevice, Flow } from "../audio/devices";
import { devices } from "../audio/devices";
import { keyImage } from "../ui/key-svg";
import type { DeviceKeySettings } from "./settings";
import { resolved } from "./settings";
import { faceFor, ofFlow, pickerItems, planPress, rememberedFor } from "./switching";
import type { UiMessage } from "./ui-messages";
import { replyToPanel } from "./ui-messages";

/** Everything tracked for one key on screen. */
type KeyState = {
	action: KeyAction<DeviceKeySettings>;
	settings: DeviceKeySettings;
	/** Last image sent, so a poll that changes nothing sends nothing. */
	image?: string;
	/** Releases this key's hold on device polling. */
	unwatch: () => void;
};

/**
 * A key that switches the default device for one flow. The output and input
 * actions are this class twice; the flow is the only thing that differs.
 *
 * The class itself only moves things between Stream Deck and the device store.
 * What a press does and what a key shows are decided in `switching.ts`.
 */
export abstract class DeviceKeyAction extends SingletonAction<DeviceKeySettings> {
	protected abstract readonly flow: Flow;

	private readonly keys = new Map<string, KeyState>();

	constructor() {
		super();
		// One subscription for the action, not one per key: every key redraws
		// from the same list, whoever changed it.
		devices.onChange(() => this.paintAll());
	}

	override async onWillAppear(ev: WillAppearEvent<DeviceKeySettings>): Promise<void> {
		if (!ev.action.isKey()) return;

		this.keys.get(ev.action.id)?.unwatch();
		const state: KeyState = { action: ev.action, settings: ev.payload.settings, unwatch: devices.watch() };
		this.keys.set(ev.action.id, state);

		// Whatever is already known goes up at once; a first read can take a
		// second or two while the audio host starts.
		if (devices.isLoaded()) await this.paint(state);
		await this.refresh();
		// A refresh that found nothing new notifies nobody, and this key may not
		// have been drawn yet.
		await this.paint(state);
	}

	override onWillDisappear(ev: WillDisappearEvent<DeviceKeySettings>): void {
		this.keys.get(ev.action.id)?.unwatch();
		this.keys.delete(ev.action.id);
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<DeviceKeySettings>): Promise<void> {
		const state = this.keys.get(ev.action.id);
		if (!state) return;
		state.settings = ev.payload.settings;
		await this.paint(state);
	}

	override async onKeyDown(ev: KeyDownEvent<DeviceKeySettings>): Promise<void> {
		const settings = resolved(ev.payload.settings);

		try {
			// Read first, rather than trust a list up to two seconds old: the
			// press decides from what the default is, and that may just have changed.
			const plan = planPress(settings, ofFlow(await devices.refresh(), this.flow));

			if (plan.kind === "unavailable") {
				streamDeck.logger.info(`${this.flow}: press ignored, ${plan.reason}`);
				await ev.action.showAlert();
				return;
			}
			if (plan.kind === "switch") {
				// The store announces the new list, which is what redraws the keys.
				await devices.setDefault(plan.target.id, settings.role);
				streamDeck.logger.info(`${this.flow}: switched to "${plan.target.name}" (${settings.role})`);
			}
		} catch (err) {
			streamDeck.logger.error(`${this.flow}: switching failed`, err);
			await ev.action.showAlert();
		}
	}

	override async onSendToPlugin(ev: SendToPluginEvent<UiMessage, DeviceKeySettings>): Promise<void> {
		const event = ev.payload?.event;

		if (event === "getDevices") {
			const list = ofFlow(
				ev.payload.isRefresh || !devices.isLoaded() ? await this.refresh() : devices.list(),
				this.flow,
			);
			const settings = resolved(await ev.action.getSettings());
			await replyToPanel({ event: "getDevices", items: pickerItems(settings, list) });
			return;
		}

		if (event === "getStatus") {
			if (!devices.isLoaded()) {
				await replyToPanel({ event: "getStatus", status: null });
				return;
			}
			const list = ofFlow(devices.list(), this.flow);
			await replyToPanel({
				event: "getStatus",
				status: {
					defaultName: list.find((d) => d.isDefault)?.name ?? null,
					communicationsName: list.find((d) => d.isCommunications)?.name ?? null,
				},
			});
		}
	}

	/** Reads the device list, and settles for the last one if the read fails. */
	private async refresh(): Promise<AudioDevice[]> {
		try {
			return await devices.refresh();
		} catch (err) {
			streamDeck.logger.warn(`${this.flow}: could not read the device list: ${String(err)}`);
			return devices.list();
		}
	}

	private paintAll(): void {
		for (const state of this.keys.values()) {
			this.paint(state).catch((err) => streamDeck.logger.error(`${this.flow}: drawing a key failed`, err));
		}
	}

	private async paint(state: KeyState): Promise<void> {
		// Before the first read there is nothing true to draw; the manifest's
		// image stays up rather than a face claiming the device is missing.
		if (!devices.isLoaded()) return;

		const list = ofFlow(devices.list(), this.flow);
		const settings = resolved(state.settings);

		const image = keyImage(faceFor(settings, list, this.flow));
		if (image !== state.image) {
			state.image = image;
			await state.action.setImage(image);
		}

		// Remember what the chosen devices are called, and what they look like,
		// while they're here to ask.
		const remembered = rememberedFor(settings, list);
		if (remembered) {
			state.settings = { ...state.settings, ...remembered };
			await state.action.setSettings(state.settings);
		}
	}
}
