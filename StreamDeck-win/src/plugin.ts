import streamDeck from "@elgato/streamdeck";
import { BatteryStatusAction } from "./actions/battery-status";
import { LowestBatteryAction } from "./actions/lowest-battery";
import { setLogger } from "./providers/log";

streamDeck.logger.setLevel("info");
setLogger(streamDeck.logger);
streamDeck.actions.registerAction(new BatteryStatusAction());
streamDeck.actions.registerAction(new LowestBatteryAction());
streamDeck.connect();
