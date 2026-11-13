# Audio Switch release notes

## v1.0.1

- **New app icon.** The icon in Stream Deck's plugin list is a real key face
  drawn by the plugin, in the same white as the keys, in place of the green
  speaker.
- Marketplace listing and gallery images added to the repository (`store/`).
  No change to how the plugin behaves.

## v1.0.0

First release.

- **Output Device** and **Input Device** actions switch the Windows default
  playback and recording device.
- **Two modes per key.** Switch to one device, or step through two or more. Two
  devices make a toggle.
- **Applies to.** A press can change everything, the default device only, or the
  communications device only, so a key can move a call without moving your
  music.
- **The key shows the state.** White while its device is the default, grey when
  it is not, a red slash when the device is not connected. A step-through key
  shows a dot per device.
- **Device icons.** Speakers, headphones, headset, earbuds, soundbar, monitor,
  TV, microphone, webcam and line jack. The plugin guesses from the device's
  name and type; pick one in the panel to override.
- **Keys follow Windows.** Change the device in Windows' sound settings and the
  keys update within two seconds.
- **Unplugged devices are remembered.** A key keeps its device's name while the
  device is away, and a step-through key skips it.

### Requirements

- Stream Deck 6.9 or later.
- Windows 10 or later.
