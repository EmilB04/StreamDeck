import { action } from "@elgato/streamdeck";
import type { Flow } from "../audio/devices";
import { DeviceKeyAction } from "./device-key";

/** Switches the default recording device: a microphone or a headset's own. */
@action({ UUID: "com.emilberglund.audioswitch.input-device" })
export class InputDeviceAction extends DeviceKeyAction {
	protected readonly flow: Flow = "input";
}
