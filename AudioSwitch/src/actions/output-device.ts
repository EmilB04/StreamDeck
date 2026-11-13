import { action } from "@elgato/streamdeck";
import type { Flow } from "../audio/devices";
import { DeviceKeyAction } from "./device-key";

/** Switches the default playback device: speakers, headphones, a monitor. */
@action({ UUID: "com.emilberglund.audioswitch.output-device" })
export class OutputDeviceAction extends DeviceKeyAction {
	protected readonly flow: Flow = "output";
}
