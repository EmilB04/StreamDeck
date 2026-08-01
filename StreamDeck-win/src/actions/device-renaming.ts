import streamDeck, { action, SingletonAction } from "@elgato/streamdeck";
import type {
	DidReceiveSettingsEvent,
	KeyAction,
	KeyDownEvent,
	SendToPluginEvent,
	WillAppearEvent,
} from "@elgato/streamdeck";
import { discovery } from "../providers/discovery";
import { renameKeyImage } from "../ui/battery-svg";
import { faceColors } from "./settings";
import type { BatterySettings } from "./settings";
import { loadRenames, renames, setRename, withRenames } from "./renames";

export type RenamingSettings = BatterySettings & {
	/** Device currently being edited in the property inspector. */
	renameTarget?: string;
	/** The name being typed for it. */
	renameValue?: string;
};

type UiMessage = { event?: string; isRefresh?: boolean };

/**
 * Renames devices for this plugin, everywhere at once.
 *
 * Windows calls one phone on the dev machine "4", and a Bluetooth speaker
 * "Bluetooth device"; the name comes from the OS or the device's own descriptor
 * and often can't be fixed at the source. A key's Nickname solves it for that
 * one key — this solves it for every key, every picker and both other actions,
 * because the name belongs to the device rather than to a key.
 *
 * Nothing outside this plugin is touched: no OS record, no device firmware. The
 * map is applied on the way out, wherever a label is shown.
 */
@action({ UUID: "com.emilberglund.batterymonitor.device-renaming" })
export class DeviceRenamingAction extends SingletonAction<RenamingSettings> {
	/** Device each panel was last pointed at, to notice when it's switched. */
	private readonly targets = new Map<string, string>();

	override async onWillAppear(ev: WillAppearEvent<RenamingSettings>): Promise<void> {
		if (!ev.action.isKey()) return;
		await loadRenames(true);
		this.targets.set(ev.action.id, ev.payload.settings.renameTarget?.trim() ?? "");
		await this.draw(ev.action, ev.payload.settings);
	}

	/** A press rescans, so a device that was off can be named without waiting. */
	override async onKeyDown(ev: KeyDownEvent<RenamingSettings>): Promise<void> {
		await discovery.list(true);
		await this.draw(ev.action, ev.payload.settings);
		await this.sendDevices(true);
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<RenamingSettings>): Promise<void> {
		if (!ev.action.isKey()) return;

		// The panel writes the target and the name as ordinary settings; this is
		// where they become a rename. Storing them per-key as well keeps the
		// controls populated when the panel is reopened.
		const target = ev.payload.settings.renameTarget?.trim() ?? "";
		const previous = this.targets.get(ev.action.id);

		// Switching device loads that device's own name — empty for one that
		// hasn't been renamed. Without this the text left in the box from the last
		// device would be applied to the new one the moment anything else changed,
		// quietly renaming a device the user only meant to look at.
		if (target !== previous) {
			this.targets.set(ev.action.id, target);

			const existing = target ? (renames()[target] ?? "") : "";
			if ((ev.payload.settings.renameValue ?? "") !== existing) {
				await ev.action.setSettings({ ...ev.payload.settings, renameValue: existing });
			}

			await this.draw(ev.action, ev.payload.settings);
			return;
		}

		if (target) {
			const current = renames()[target] ?? "";
			const next = ev.payload.settings.renameValue ?? "";
			if (next.trim() !== current) {
				await setRename(target, next);
				await this.sendDevices();
			}
		}

		await this.draw(ev.action, ev.payload.settings);
	}

	override async onSendToPlugin(ev: SendToPluginEvent<UiMessage, RenamingSettings>): Promise<void> {
		if (ev.payload?.event === "getDevices") {
			await this.sendDevices(ev.payload?.isRefresh === true);
			return;
		}

		if (ev.payload?.event === "clearRenames") {
			for (const key of Object.keys(renames())) await setRename(key, "");
			await this.sendDevices();
			streamDeck.logger.info("device-renaming: cleared every name");
		}
	}

	/**
	 * Feeds the picker. Entries show the name in force and, when it isn't the
	 * device's own, what it's called underneath — otherwise a renamed device is
	 * impossible to find again in a list of names you invented.
	 */
	private async sendDevices(force = false): Promise<void> {
		const devices = await discovery.list(force);
		const map = renames();

		const items = devices.map((device) => {
			const renamed = map[device.key];
			return {
				label: renamed ? `${renamed}  (was ${device.label})` : device.label,
				value: device.key,
			};
		});

		if (items.length === 0) items.push({ label: "No devices detected", value: "" });

		await streamDeck.ui.sendToPropertyInspector({
			event: "getDevices",
			items,
			renames: map,
		});
	}

	private async draw(action: KeyAction<RenamingSettings>, settings: RenamingSettings): Promise<void> {
		const devices = withRenames(await discovery.list());
		const count = Object.keys(renames()).length;
		await action.setImage(renameKeyImage(count, devices.length, faceColors(settings)));
	}
}
