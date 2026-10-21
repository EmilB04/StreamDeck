# Marketplace listing: Battery Monitor

Copy for the Maker Console submission. It only claims what the plugin does
today, and it marks support that hasn't been tested on hardware.

---

## Name

Battery Monitor

## Short summary

Battery levels for your wireless devices, on a key.

## Description

Battery Monitor puts the charge level of your wireless gear on your Stream
Deck, so you see your headset running low before it dies mid-call.

You don't pick from a model list or configure each device. The plugin looks at
what your machine can see (headsets, mice, keyboards, controllers, phones,
anything paired over Bluetooth) and offers you what it found. Plug in different
gear and it shows up in the list.

**Three actions**

- **Device Battery**: one device on one key, with a meter, the percentage and
  the name. Give it a backup device and the key switches to that one while the
  main device is off, like a wired keyboard standing in for a wireless one.
- **Lowest Battery**: whichever device has the least charge left, named on the
  key. Five keys can each show a healthy number while a sixth device runs flat.
  This key shows you the sixth.
- **Device Renaming**: rename devices for the plugin. Windows gives some
  devices unhelpful names, and a rename here fixes them on every key at once.

**Details you'd otherwise miss**

- A switched-off device keeps its last level on the key, faded, with how long
  ago the plugin saw it.
- Keys in a folder keep reading in the background, so the folder opens with
  current levels.
- Time remaining, based on how fast the level has been falling.
- A warning flash when a device drops below your low threshold. It flashes once
  as the level crosses, not on every check.
- Adaptive checking: faster while charging or low, slower while the level holds.
  Each check costs your machine some work, so the plugin saves them.
- A press reads the device straight away, and can open an app too.

## Requirements

- Windows 10 or later
- For **headsets**: [HeadsetControl](https://github.com/Sapd/HeadsetControl)
  installed and on your PATH. The panel tells you whether the plugin found it
  and links to the download. Other devices work without it.

## What's supported

| | |
|---|---|
| **Headsets** | HyperX, SteelSeries, Corsair, Logitech, Razer, Turtle Beach, Roccat and Astro, around 100 models, via HeadsetControl |
| **Mice & keyboards** | Logitech (its own receivers or Bluetooth), Asus ROG, Razer |
| **Controllers** | DualSense, DualSense Edge, DualShock 4, Xbox (Bluetooth) |
| **Bluetooth LE** | Phones, watches, styluses, anything publishing a battery service |
| **Everything else** | Listed without a level; cable-powered devices show a plug |

Not covered: SteelSeries, Corsair and Roccat **mice and keyboards** (each model
speaks its own protocol), Xbox pads on the wireless dongle or a cable, Nintendo
pads, and AirPods, which report over Apple's own protocol.

## Known limitations

- **I haven't tested Razer, Xbox and DualShock 4 support on hardware.** I wrote
  it from published protocol documentation. If your device shows no level,
  please report it at https://github.com/EmilB04/StreamDeck/issues so I can
  fix it.
- Many wireless devices report in steps of 10%, so expect the number to jump.
- Bluetooth LE devices report a level and nothing else. The plugin shows them as
  charging when the level rises.
- Windows only for now.

## Privacy

The plugin makes no network requests and collects nothing. It reads battery
levels from devices on your own machine. What it remembers (your device choice,
names you set, recent levels) stays in Stream Deck's settings on your computer.
The settings panels load their one third-party library from inside the plugin,
not from the internet.

One button opens a web page: the HeadsetControl download, in your browser.

---

## Assets checklist

- [x] App icon: `store/app-icon-256.png`, `store/app-icon-512.png`
- [x] Gallery images in `store/gallery/`, all 1920 × 960 as Maker Console
      requires (a thumbnail plus at least three gallery images):
      - `01-thumbnail.png`: a full folder of keys on a 15-key deck, use as
        the thumbnail
      - `02-states.png`: every key state, from healthy to pressed while off
      - `03-inspector.png`: the Device Battery panel
      - `04-styles.png`: bar, ring and number meters, plus three colour themes
      - `05-more-actions.png`: the Lowest Battery and Device Renaming panels
- [x] Support URL: https://github.com/EmilB04/StreamDeck (also in the manifest as `URL`)
- [x] Licence: MIT with attribution, see `LICENSE`
