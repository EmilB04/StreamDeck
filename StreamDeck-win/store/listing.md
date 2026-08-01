# Marketplace listing — Battery Monitor 1.0.0

Copy for the Maker Console submission. Everything here is what the plugin
actually does today; claims that can't be backed on hardware are marked.

---

## Name

Battery Monitor

## Short summary

Battery levels for your wireless devices, on a key.

## Description

Battery Monitor puts the charge level of your wireless gear on your Stream
Deck, so you find out your headset is dying before it dies mid-call rather than
after.

It finds devices itself. There's no model list to pick from and nothing to
configure per device: the plugin enumerates what your machine can actually see —
headsets, mice, keyboards, controllers, phones, anything paired over Bluetooth —
and offers you what it found. Plug in different gear and it simply appears.

**Three actions**

- **Device Battery** — one device on one key. Meter, percentage, and the name.
- **Lowest Battery** — whichever of your devices has least charge left, named on
  the key. One key that answers "is anything about to die on me", instead of
  five keys each showing a healthy number.
- **Device Renaming** — rename devices for the plugin. Windows names some
  devices unhelpfully; this fixes them everywhere at once.

**Things it does that you'd otherwise miss**

- A device that's switched off keeps showing the level it last reported, faded,
  with how long ago that was — rather than a blank key.
- Time remaining, worked out from how fast the level has actually been falling.
- A warning flash when a device crosses your low threshold — once, when it
  crosses, not on every check.
- Adaptive checking: faster while charging or low, backing right off while a
  level sits still, because every check costs real work on your machine.
- A press re-reads immediately, and can open an app at the same time.

## Requirements

- Windows 10 or later
- For **headsets**: [HeadsetControl](https://github.com/Sapd/HeadsetControl)
  installed and on your PATH. The plugin tells you whether it found it, and
  links to the download. Everything else works without it.

## What's supported

| | |
|---|---|
| **Headsets** | HyperX, SteelSeries, Corsair, Logitech, Razer, Turtle Beach, Roccat, Astro — around 100 models, via HeadsetControl |
| **Mice & keyboards** | Logitech (its own receivers or Bluetooth), Asus ROG, Razer |
| **Controllers** | DualSense, DualSense Edge, DualShock 4, Xbox (Bluetooth) |
| **Bluetooth LE** | Phones, watches, styluses — anything publishing a battery service |
| **Everything else** | Listed without a level; cable-powered devices show a plug |

Not covered: SteelSeries, Corsair and Roccat **mice and keyboards** (each speaks
its own protocol), Xbox pads through the wireless dongle or a cable, Nintendo
pads, and AirPods — which report over Apple's own protocol rather than
Bluetooth's.

## Known limitations

- **Razer, Xbox and DualShock 4 support is new and untested on hardware.** It's
  written from published protocol documentation. If your device shows no level,
  that's the likely reason — please report it at https://github.com/EmilB04/StreamDeck/issues
  and it can be fixed.
- Wireless devices report coarsely; many move in steps of 10%, so expect the
  number to jump rather than glide.
- Bluetooth LE devices report a level and nothing else, so charging is inferred
  from the level rising.
- Windows only for now.

## Privacy

The plugin makes no network requests and collects nothing. It reads battery
levels from devices on your own machine, and everything it remembers — your
device choice, names you set, recent levels — stays in Stream Deck's own
settings on your computer.

---

## Assets checklist

- [x] App icon — `store/app-icon-256.png`, `store/app-icon-512.png`
- [x] Gallery images — `store/gallery/`, all 1920 × 960 as Maker Console
      requires (a thumbnail plus at least three gallery images):
      - `01-thumbnail.png` — the deck render, use as the thumbnail
      - `02-hardware.png` — photo of a real Stream Deck Mini running it
      - `03-states.png` — every key state: healthy, low, charging, switched
        off, mains powered, lowest-of-all
      - `04-inspector.png` — the property inspector, with what it does
- [x] Support URL — https://github.com/EmilB04/StreamDeck (also in the manifest as `URL`)
- [x] Licence — MIT with attribution, see `LICENSE`
