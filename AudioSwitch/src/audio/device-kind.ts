import type { AudioDevice, Flow } from "./devices";

/** What a device looks like on the key. */
export type DeviceKind =
	"speaker" | "headphones" | "headset" | "earbuds" | "soundbar" | "monitor" | "tv" | "microphone" | "webcam" | "line";

export const DEVICE_KINDS: readonly DeviceKind[] = [
	"speaker",
	"headphones",
	"headset",
	"earbuds",
	"soundbar",
	"monitor",
	"tv",
	"microphone",
	"webcam",
	"line",
];

/** What a device with no better clue gets. */
export function defaultKind(flow: Flow): DeviceKind {
	return flow === "output" ? "speaker" : "microphone";
}

/**
 * Names first, because they are the more specific signal: Windows files an
 * earbud case, a soundbar and a desk speaker all under "speakers", and a
 * webcam's microphone under "microphone". They also come in the user's language
 * ("Hodetelefoner", "Høyttalere"), so the common ones are listed in a few.
 * Order matters: "headset" is tried before "headphone", "earbuds" before both.
 */
const BY_NAME: readonly [DeviceKind, RegExp][] = [
	["earbuds", /earbud|airpods|\bbuds\b|freebuds|\btws\b|ørepropp|ohrh[öo]rer|[ée]couteurs/],
	["soundbar", /soundbar|sound bar|lydplanke|\bhtb\b/],
	["webcam", /webcam|web cam|camera|kamera|\bc9[2-3]0\b|\bbrio\b|facecam/],
	["tv", /\btv\b|television|bravia|\blg tv\b|smart tv/],
	["headset", /headset|\bhfp\b|hands-free|hands free/],
	["headphones", /headphone|hodetelefon|kopfh[öo]rer|casque|auricular|cuffie|hörlur|hovedtelefon/],
	["speaker", /speaker|høyttaler|lautsprecher|haut-parleur|altavoz|altoparlant|högtalare|boom|echo|sonos/],
	["microphone", /\bmic\b|microphone|mikrofon|micr[óo]fono|solocast|quadcast|yeti/],
];

/** Windows' `EndpointFormFactor` values that say something. */
const BY_FORM_FACTOR: Readonly<Record<number, DeviceKind>> = {
	1: "speaker",
	2: "line",
	3: "headphones",
	4: "microphone",
	5: "headset",
	6: "headset",
	8: "line",
	9: "monitor",
};

/** Kinds that make sense as a recording device. A speaker that "records" is a mix-up, not a speaker. */
const INPUT_KINDS: ReadonlySet<DeviceKind> = new Set([
	"microphone",
	"webcam",
	"headset",
	"earbuds",
	"headphones",
	"line",
]);
const OUTPUT_KINDS: ReadonlySet<DeviceKind> = new Set(DEVICE_KINDS.filter((k) => k !== "microphone" && k !== "webcam"));

/**
 * Best guess at what a device is, from its names and Windows' form factor.
 * Only ever a guess; the property inspector can override it per key.
 */
export function kindOf(
	device: Pick<AudioDevice, "flow" | "name" | "description" | "adapter" | "formFactor">,
): DeviceKind {
	const allowed = device.flow === "output" ? OUTPUT_KINDS : INPUT_KINDS;
	const text = `${device.name} ${device.description} ${device.adapter}`.toLowerCase();

	for (const [kind, pattern] of BY_NAME) {
		if (allowed.has(kind) && pattern.test(text)) return kind;
	}

	const byFactor = BY_FORM_FACTOR[device.formFactor];
	if (byFactor && allowed.has(byFactor)) return byFactor;

	return defaultKind(device.flow);
}
