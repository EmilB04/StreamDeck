import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultKind, kindOf } from "../src/audio/device-kind";
import type { AudioDevice } from "../src/audio/devices";
import { device } from "./fixtures";

const kind = (name: string, flow: AudioDevice["flow"], formFactor = -1) =>
	kindOf(device("x", { flow, name, description: name, adapter: "", formFactor }));

describe("guessing what a device is", () => {
	it("reads the name, in more than one language", () => {
		assert.equal(kind("Headphones (Realtek)", "output"), "headphones");
		assert.equal(kind("Hodetelefoner (HyperX Cloud Alpha Wireless)", "output"), "headphones");
		assert.equal(kind("Kopfhörer (USB Audio)", "output"), "headphones");
		assert.equal(kind("Høyttalere (Realtek Audio)", "output"), "speaker");
		assert.equal(kind("Mikrofon (HyperX SoloCast)", "input"), "microphone");
		assert.equal(kind("Headset Earphone (Jabra)", "output"), "headset");
		assert.equal(kind("AirPods Pro", "output"), "earbuds");
		assert.equal(kind("Sonos Beam Soundbar", "output"), "soundbar");
		assert.equal(kind("Mikrofon (HD Pro Webcam C920)", "input"), "webcam");
	});

	it("falls back to Windows' form factor when the name says nothing", () => {
		assert.equal(kind("Odyssey G85SD (NVIDIA High Definition Audio)", "output", 9), "monitor");
		assert.equal(kind("Device (Thing)", "output", 3), "headphones");
		assert.equal(kind("Device (Thing)", "output", 5), "headset");
		assert.equal(kind("Device (Thing)", "output", 8), "line");
		assert.equal(kind("Device (Thing)", "input", 5), "headset");
	});

	it("prefers the name to the form factor", () => {
		assert.equal(kind("Sonos Beam Soundbar", "output", 1), "soundbar");
	});

	it("never gives a recording device a playback picture, or the other way round", () => {
		assert.equal(kind("Sound Bar Mic", "input"), "microphone");
		assert.equal(kind("Webcam speakers", "output"), "speaker");
		assert.equal(kind("Device (Thing)", "input", 9), "microphone");
		assert.equal(kind("Device (Thing)", "output", 4), "speaker");
	});

	it("falls back to a plain speaker or microphone", () => {
		assert.equal(kind("Device (Thing)", "output"), defaultKind("output"));
		assert.equal(kind("Device (Thing)", "input"), defaultKind("input"));
		assert.equal(defaultKind("output"), "speaker");
		assert.equal(defaultKind("input"), "microphone");
	});
});
