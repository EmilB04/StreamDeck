# Marketplace listing: Audio Switch

Copy for the Maker Console submission. It only claims what the plugin does
today.

---

## Name

Audio Switch

## Short summary

Switch your Windows speakers, headphones or microphone from a key.

## Description

Audio Switch changes the Windows default audio device with one press. Put your
speakers, headphones and microphone on the deck, and stop opening the sound
settings to move between them.

You don't type device names or ids. The plugin asks Windows what is connected
and offers the list in the panel. Plug in a new headset and it is there.

**Two actions**

- **Output Device**: switches the default playback device (speakers,
  headphones, monitor, soundbar, TV).
- **Input Device**: switches the default recording device (microphones,
  webcams).

**Two modes on each key**

- **Switch to one device**: a press makes that device the default. One key per
  device, and the key lights up while it is in use.
- **Step through devices**: tick two or more and each press moves to the next.
  Tick two and the key is a toggle between, say, speakers and headphones. A
  device that isn't connected is skipped.

**Calls and music apart**

Windows keeps two defaults for each direction: one for apps, games and music,
and one for calls. Each key has an **Applies to** setting: everything, the
default device only, or the communications device only. A key set to
communications moves Discord or Teams to your headset while the music stays on
the speakers.

**Details you'd otherwise miss**

- The key shows the device's name and an icon (speakers, headphones, headset,
  earbuds, soundbar, monitor, TV, microphone, webcam or line jack). The plugin
  guesses the icon from the device. You can pick another in the panel.
- Lit while its device is in use, grey when it is not, with a red slash when
  the device is unplugged.
- A step-through key shows one dot per connected device, and the white one is
  current.
- Keys follow Windows. Change the device in the sound settings and the keys
  update within two seconds.
- When two devices share a name, such as three microphones all called
  "Microphone", the key shows the hardware name instead.
- A key remembers the name of a device that is away, so the panel still shows
  what you chose.
- Nothing to install besides the plugin: no helper program and no driver.

## Requirements

- Windows 10 or later, Stream Deck 6.9 or later
- Windows PowerShell, which ships with Windows

## Known limitations

- A program that is set to a specific device in its own settings ignores the
  Windows defaults, and no key can change that.
- Windows has no documented way to change the default audio device. The plugin
  uses the same call the Sound control panel uses. It has not changed since
  Windows 7, but Microsoft could change it.
- The first press after Stream Deck starts can take one or two seconds while
  the plugin prepares. After that a press is immediate.
- Windows only for now. Stream Deck + dials and touch strip are not supported.

## Privacy

The plugin makes no network requests and collects nothing. It reads the list of
audio devices on your own machine and changes which one is the default. What it
remembers (your device choices and their names) stays in Stream Deck's settings
on your computer. The settings panels load their one third-party library from
inside the plugin, not from the internet.

---

## Assets checklist

- [x] App icon: `store/app-icon-256.png`, `store/app-icon-512.png`
- [x] Gallery images in `store/gallery/`, all 1920 × 960 as Maker Console
      requires (a thumbnail plus at least three gallery images):
      - `01-thumbnail.png`: a full 15-key deck, use as the thumbnail
      - `02-states.png`: every key state, and the ten device icons
      - `03-inspector.png`: the Output Device panel in step-through mode
      - `04-calls.png`: what **Applies to** does
- [x] `store/portfolio/` has the same four at 3840 × 1920
- [x] Support URL: https://github.com/EmilB04/StreamDeck (also in the manifest as `URL`)
- [x] Licence: MIT with attribution, see `LICENSE`
- [x] Manifest: `SDKVersion: 3` and `Software.MinimumVersion: "6.9"`, which DRM
      requires; Windows 10 only; `Nodejs.Debug: "disabled"`

Regenerate the images with `npx tsc -p tsconfig.test.json && node scripts/render-store.mjs`.
