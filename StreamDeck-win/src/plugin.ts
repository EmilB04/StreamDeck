import streamDeck from "@elgato/streamdeck";
import { BatteryStatusAction } from "./actions/battery-status";
import { LowestBatteryAction } from "./actions/lowest-battery";
import type { GlobalSettings } from "./actions/settings";
import { setLogger } from "./providers/log";

streamDeck.logger.setLevel("info");
setLogger(streamDeck.logger);

const batteryStatus = new BatteryStatusAction();
const lowestBattery = new LowestBatteryAction();

streamDeck.actions.registerAction(batteryStatus);
streamDeck.actions.registerAction(lowestBattery);

// "Apply to all keys" writes the look to global settings; this is the single
// place that spreads it, so both action types adopt it the same way.
streamDeck.settings.onDidReceiveGlobalSettings<GlobalSettings>((ev) => {
	const appearance = ev.settings?.appearance;
	if (!appearance) return;

	Promise.all([batteryStatus.applyShared(appearance), lowestBattery.applyShared(appearance)]).catch((err) =>
		streamDeck.logger.error("plugin: applying the shared appearance failed", err),
	);
});

streamDeck.connect();
