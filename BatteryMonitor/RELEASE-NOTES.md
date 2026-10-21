# Battery Monitor release notes

## v1.2.1

### Security

- **The Node debugger is off.** Earlier releases set `Nodejs.Debug` to
  `"enabled"` in the manifest, so Stream Deck started the plugin with Node's
  inspector listening on a local port. Any program on your machine could attach
  to it and run code inside the plugin. Update to close it. Log files are
  unaffected.

### Docs

- The requirements no longer ask you to install Node.js. The Stream Deck app
  ships the runtime the plugin uses.

## v1.2.0

### Backup device

A Device Battery key can now watch two devices. Set a **Backup** in the panel
and the key shows it while the main device is off or missing. When the main
device answers again, the key switches back. Pair a wireless keyboard with your
wired one, for example.

### Keys in folders open with their levels

When you opened a folder, every Battery Monitor key in it showed the placeholder
image for about 3 seconds while the plugin scanned from scratch. Page switches
did the same. Keys now keep their state when they leave the screen and keep
reading in the background, at most once a minute for up to 30 minutes. Open the
folder and the levels are already on the keys.

A key you haven't seen since Stream Deck started draws from the most recent scan,
or from its last known level, until its first read arrives.

### Fixed

- **"Apply this look to all keys" stays applied once.** The plugin pushed the
  shared look onto every key again at startup, when you added a key, and on
  every device rename. That undid any change you made to a single key after
  sharing. Each key now takes a share once.
- **Sharing a look keeps your device renames.** Both live in the plugin's global
  settings, and the share overwrote the whole thing.
- **A shared look shows up straight away.** Keys used to wait for their next
  check, up to ten minutes in adaptive mode. Keys in a closed folder pick it up
  when you open the folder.
- **No stray polling after you leave a folder quickly.** If you left a folder
  before its keys finished their first scan, their poll loops kept running
  unseen until Stream Deck restarted. Hidden keys now stop after 30 minutes, and
  each key has one loop at most.
- **The Device Renaming key** draws before its scan finishes.
- **Settings panels use one font.** The status strip, headings and hints fell
  back to a serif font next to the Segoe UI controls.
- **A stray colon** sat before the "Apply this look to all keys" and "Clear
  every name" buttons.
- **"Opens" said "Reading the Start menu…" forever** on a key with no app set.
  It now says "Don't open anything".

## v1.1.0

In 1.0.0 the picker dropped devices the plugin knew about but couldn't read.
This release fixes that and the two provider bugs behind most cases. If a device
of yours was missing in 1.0.0, try again.

### Fixed: devices going missing

The catch-all that lists "everything else on HID" skipped the four vendors with
a provider of their own: Logitech, ASUS, Sony and Razer. When one of those
providers came up empty, the device vanished from the picker. Providers come up
empty for ordinary reasons: a vendor tool holding the interface open (G HUB,
Armoury Crate, Synapse), a device asleep behind its dongle, an unfamiliar HID
usage page.

The catch-all now lists every vendor and pairs off duplicates by USB
vendor/product id. A device its provider described appears once, as before. A
device its provider missed still appears without a level, so you can see it
exists.

Two provider fixes on top of that:

- **Logitech**: the plugin looked for HID++ endpoints on usage page `0xff00`
  alone, the page Unifying and Lightspeed receivers use. A Logitech device on
  another vendor page never got a request. The plugin now probes every vendor
  page. A second bug applied the "has a long-report collection" rule across the
  whole machine instead of per device, so one receiver could disqualify every
  other Logitech endpoint. A mouse's receiver could hide a headset.
- **ASUS**: the plugin filtered devices by form factor *before* asking for their
  battery. A ROG peripheral with an unknown model name, whose input interface
  Armoury Crate held, looked like a motherboard LED controller and got dropped.
  The plugin now asks every ASUSTek product and keeps anything that answers the
  ROG power command, whatever it calls itself.

### Device picker

- **Grouped** under **Battery**, **Mains powered** and **No battery data**
  headings, in that order, so you land on the useful half. The headings replace
  the `(mains powered)` suffix on each entry.
- **Untested hardware is labelled.** I wrote Razer, Xbox and DualShock 4 support
  from published protocol documentation and haven't run it against a real
  device. Those entries now read `(untested, please report)`. DualSense and
  DualSense Edge passed on hardware and carry no label.

### HeadsetControl

Headsets can't report a level without HeadsetControl, and the panels didn't say
so. Both battery panels now show a warning at the top while it's missing, with
the download and a reminder to tick **add to PATH** during install. The warning
goes away once the plugin finds the tool, and the "Headset support" section at
the bottom names the copy in use.

### Privacy and security

- **No network requests.** The settings panels loaded a UI library from a CDN
  each time they opened. The plugin bundles it now, so the panels work offline
  and send nothing about your machine to a third party.
- **Fewer antivirus false positives.** The Windows queries no longer pass
  `-ExecutionPolicy Bypass`. It had no effect on an inline command, and security
  tools flag the pattern.

### Diagnosing a missing device

`bin/scan.js` now ships inside the installed plugin. It prints every HID
interface on the machine and what each provider made of them:

```pwsh
node "$env:APPDATA\Elgato\StreamDeck\Plugins\com.emilberglund.batterymonitor.sdPlugin\bin\scan.js"
```

The plugin log also gets a `discovery: headset=1 logitech=2 asus=1 …` line per
scan, which tells "found nothing" apart from "the HID layer never loaded".

Both include device names and Bluetooth identifiers. Trim them before you paste
into a public issue if that matters to you.

### Also

- The reading at the top of a settings panel no longer sticks while you scroll.
- Fixed a CSS bug that pinned panel messages on screen. One of them was the
  HeadsetControl warning, which claimed the tool was missing on machines that
  had it.

### Known issues

- A multi-device ASUS receiver (the ROG OMNI, for one) still appears as a single
  entry named after the receiver, reporting one battery for what may be two
  devices.
- A sleeping Logitech device can drop out of the picker, replaced by its
  receiver until it wakes.
- Razer, Xbox and DualShock 4 remain unverified against hardware. Reports
  welcome: https://github.com/EmilB04/StreamDeck/issues

## v1.0.0

First release. A Stream Deck plugin that shows the battery level of your
wireless headsets, mice, keyboards, controllers and paired Bluetooth devices on
a key. It finds them itself, with no model list to maintain.

### Actions

- **Device Battery**: one device on one key. Pick it in the property inspector;
  the key polls on an interval and refreshes when pressed.
- **Lowest Battery**: whichever detected device has the least charge left,
  named on the key. Five healthy-looking keys can't tell you something else is
  about to die; this one can. It gets a coloured frame once the device it found
  drops to the low threshold.
- **Device Renaming**: rename devices for the plugin. Windows reports one of my
  phones as **4**; a rename fixes it on every key and in every device picker.
  The plugin changes nothing outside itself: no OS record, no firmware.

### Device coverage

The plugin builds the device list at runtime from what the machine reports.

| Source | Covers |
|---|---|
| HeadsetControl | ~100 headset models (HyperX, SteelSeries, Corsair, Logitech, Razer…) |
| Logitech HID++ | Every device paired to a Logitech receiver, plus direct-connected |
| ASUS ROG | ASUS peripherals via the receiver's vendor collection |
| Razer | Wireless mice, keyboards and headsets (OpenRazer power protocol) |
| Xbox | Xbox Wireless Controllers over Bluetooth |
| DualSense | DualSense, DualSense Edge and DualShock 4 over USB or Bluetooth |
| Windows Bluetooth | Every paired Bluetooth LE device with a GATT battery service |
| Generic HID | Everything else, listed without a level |

The plugin remembers each device by a stable identity (HID++ unit id, USB
vendor/product ids, Bluetooth instance id, DualSense MAC), so you can unplug and
replug and the key still points at the same device.

### Key face

Per-key settings, grouped Device → Updates → On press → Key face → Levels → Colours:

- Meter as a battery bar, a ring around the key, or percentage only
- Choose what's drawn: device icon, percentage, name line, last known level, time left
- Colours for low, medium, high, charging, foreground and background, with your
  own low and medium thresholds
- Charging shows a bolt and breathes in the charging colour; offline devices show
  their last known level or a dash, your choice
- Poll every 10–300s, fixed or adapting to what the battery does
- Press to refresh, or refresh and open an app, file or URL
- Optional warning flash when a level drops under a threshold you set

### Requirements

- Windows 10 or later, Stream Deck app 6.5+
- Node.js 20+ on the machine running Stream Deck
- [HeadsetControl](https://github.com/Sapd/HeadsetControl/releases) on `PATH` for
  headset support. The property inspector tells you whether it found it and
  links to the releases page if not.

No macOS support. Most of the code might work there, but I haven't run any HID
provider on a Mac, so I don't claim it.

### Install

Download the `.streamDeckPlugin` file from the
[releases page](https://github.com/EmilB04/StreamDeck/releases) and open it.
Stream Deck installs it. Then drag **Device Battery** onto a key and pick your
device.

Building from source:

```sh
cd BatteryMonitor
npm install
npm run build
npm run sync-deps
npx @elgato/cli link
```

### Known limitations

- **Razer, Xbox and DualShock 4 support is unverified against hardware.** I
  implemented the protocols from public sources and haven't tested a device.
  Their entries in the device picker say so.
- Xbox controllers report four capacity steps. The number on the key stands in
  for the step.
- Xbox over the USB dongle uses GIP rather than HID, so the plugin covers
  Bluetooth only.
- The picker lists Bluetooth Classic devices without a level. Only LE devices
  with a GATT battery service report one.

Bug reports and device results are welcome in
[Issues](https://github.com/EmilB04/StreamDeck/issues), most of all for the
unverified providers.

MIT with attribution. See [LICENSE](LICENSE).
