import streamDeck from "@elgato/streamdeck";
import { BatteryStatusAction } from "./actions/battery-status";
import { DeviceRenamingAction } from "./actions/device-renaming";
import { LowestBatteryAction } from "./actions/lowest-battery";
import type { GlobalSettings } from "./actions/settings";
import { cacheRenames, loadRenames } from "./actions/renames";
import { setLogger } from "./providers/log";

streamDeck.logger.setLevel("info");
setLogger(streamDeck.logger);

const batteryStatus = new BatteryStatusAction();
const lowestBattery = new LowestBatteryAction();
const deviceRenaming = new DeviceRenamingAction();

streamDeck.actions.registerAction(batteryStatus);
streamDeck.actions.registerAction(lowestBattery);
streamDeck.actions.registerAction(deviceRenaming);

// "Apply to all keys" writes the look to global settings; this is the single
// place that spreads it, so both action types adopt it the same way.
streamDeck.settings.onDidReceiveGlobalSettings<GlobalSettings>((ev) => {
	// Renames live here too, and every label resolution reads them from cache.
	cacheRenames(ev.settings?.renames);

	const appearance = ev.settings?.appearance;
	if (!appearance) return;

	Promise.all([batteryStatus.applyShared(appearance), lowestBattery.applyShared(appearance)]).catch((err) =>
		streamDeck.logger.error("plugin: applying the shared appearance failed", err),
	);
});

// Only after connecting: getGlobalSettings is a request to Stream Deck, and
// issuing one before the socket exists leaves every later request queued behind
// it — which showed up as every key's poll timing out, not as an error here.
streamDeck
	.connect()
	.then(async () => {
		await loadRenames(true);
		streamDeck.logger.info("plugin: connected, renames loaded");
	})
	// Without this a failure here is an unhandled rejection: the plugin keeps
	// running with no renames loaded and nothing said so.
	.catch((err) => streamDeck.logger.error("plugin: connecting failed", err));
