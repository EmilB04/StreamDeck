import streamDeck from "@elgato/streamdeck";
import { InputDeviceAction } from "./actions/input-device";
import { OutputDeviceAction } from "./actions/output-device";
import { audioHost } from "./audio/devices";
import { setLogger } from "./audio/log";

streamDeck.logger.setLevel("info");
setLogger(streamDeck.logger);

streamDeck.actions.registerAction(new OutputDeviceAction());
streamDeck.actions.registerAction(new InputDeviceAction());

// The audio host is a child PowerShell process. Stream Deck stops the plugin by
// ending this process, and a child left reading a pipe nobody writes to would
// exit on its own, but only once Windows notices; this makes it immediate.
process.on("exit", () => audioHost.dispose());

streamDeck.connect().catch((err) => streamDeck.logger.error("plugin: connecting failed", err));
