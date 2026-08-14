# Battery Monitor — release notes

## v1.1.0

Devices that the plugin knew about but couldn't read used to disappear from the
picker entirely. That's fixed, along with the two provider bugs behind most of
it — so if a device of yours was missing in 1.0.0, try again.

### Fixed: devices going missing

The catch-all that lists "everything else on HID" skipped the four vendors with
a provider of their own — Logitech, ASUS, Sony and Razer. Whenever one of those
providers came up empty, the device vanished from the picker instead of being
listed without a level. And a provider comes up empty more often than you'd
think: a vendor tool holding the interface open (G HUB, Armoury Crate, Synapse),
a device asleep behind its dongle, an unfamiliar HID usage page.

The catch-all now lists every vendor, and duplicate entries are paired off by USB
vendor/product id. A device its provider described appears once, as before. A
device its provider missed still appears — without a level, but visible, so you
can see it exists.

Two provider fixes on top of that:

- **Logitech** — HID++ endpoints were only looked for on usage page `0xff00`,
  the one Unifying and Lightspeed receivers use. Any Logitech device answering on
  another vendor page was never spoken to. Any vendor page is probed now. A
  second bug judged the "has a long-report collection" rule across the whole
  machine rather than per device, so one receiver could disqualify every other
  Logitech endpoint — a mouse's receiver could hide a headset.
- **ASUS** — devices were filtered by form factor *before* being asked for their
  battery, so a ROG peripheral whose model name wasn't recognised and whose input
  interface was held by Armoury Crate looked exactly like a motherboard LED
  controller and was dropped. Every ASUSTek product is asked now; anything that
  answers the ROG power command is kept whatever it calls itself.

### Device picker

- **Grouped** under **Battery**, **Mains powered** and **No battery data**
  headings, in that order, so the useful half is the half you land on. The
  headings replace the per-entry `(mains powered)` suffixes.
- **Untested hardware is labelled.** Razer, Xbox and DualShock 4 support is
  written from published protocol documentation and has never been run against a
  real device. Those entries now read `(untested — please report)` rather than
  looking identical to verified ones. DualSense and DualSense Edge were verified
  on hardware and are not marked.

### HeadsetControl

Headsets can't report a level without it, and nothing said so clearly. Both
battery panels now show a warning at the top while it's missing, with the
download and a reminder to tick **add to PATH** during install. It disappears
once the tool is found, and the "Headset support" section at the bottom names the
copy in use.

### Privacy and security

- **No network requests at all.** The settings panels used to load a UI library
  from a CDN each time they opened. It's bundled inside the plugin now, so the
  panels work offline and nothing about your machine reaches a third party.
- **Fewer antivirus false positives.** The Windows queries no longer pass
  `-ExecutionPolicy Bypass`, which never did anything for an inline command and
  is a pattern security tools are built to flag.

### Diagnosing a missing device

`bin/scan.js` now ships inside the installed plugin. It prints every HID
interface on the machine and what each provider made of them:

```pwsh
node "$env:APPDATA\Elgato\StreamDeck\Plugins\com.emilberglund.batterymonitor.sdPlugin\bin\scan.js"
```

The plugin log also gets a per-scan `discovery: headset=1 logitech=2 asus=1 …`
line, which separates "found nothing" from "the HID layer never loaded".

Note that both include device names and Bluetooth identifiers, so trim them
before pasting into a public issue if that matters to you.

### Also

- The reading at the top of a settings panel no longer sticks while you scroll.
- Fixed a CSS bug that pinned panel messages on screen permanently — including
  the HeadsetControl warning, which claimed the tool was missing on machines that
  had it.

### Known issues

- A multi-device ASUS receiver (the ROG OMNI, for one) still appears as a single
  entry named after the receiver, reporting one battery for what may be two
  devices.
- A Logitech device that has gone to sleep can drop out of the picker and be
  replaced by its receiver until it wakes.
- Razer, Xbox and DualShock 4 remain unverified against hardware. Reports
  welcome: https://github.com/EmilB04/StreamDeck/issues

## v1.0.0

First release. A Stream Deck plugin that shows the battery level of your wireless
peripherals on a key — headsets, mice, keyboards, controllers and paired Bluetooth
devices — found automatically, with no model list to maintain.

### Actions

- **Device Battery** — one device on one key. Pick it in the property inspector; the
  key polls on an interval and refreshes when pressed.
- **Lowest Battery** — whichever detected device has the least charge left, named on
  the key. Answers "is anything about to die on me" that five healthy-looking keys
  can't. Gains a coloured frame once the device it found drops to the low threshold.
- **Device Renaming** — rename devices for the plugin, everywhere at once. Windows
  reports one phone here as **4**; a rename fixes it for every key and every device
  picker. Nothing outside the plugin is touched — no OS record, no firmware.

### Device coverage

Nothing is hard-coded — the device list is built at runtime from what the machine
actually reports.

| Source | Covers |
|---|---|
| HeadsetControl | ~100 headset models (HyperX, SteelSeries, Corsair, Logitech, Razer…) |
| Logitech HID++ | Every device paired to a Logitech receiver, plus direct-connected |
| ASUS ROG | ASUS peripherals via the receiver's vendor collection |
| Razer | Wireless mice, keyboards and headsets (OpenRazer power protocol) |
| Xbox | Xbox Wireless Controllers over Bluetooth |
| DualSense | DualSense, DualSense Edge and DualShock 4 over USB or Bluetooth |
| Windows Bluetooth | Every paired Bluetooth LE device with a GATT battery service |
| Generic HID | Everything else, so nothing is invisible (listed without a level) |

Devices are remembered by a stable identity — HID++ unit id, USB vendor/product ids,
Bluetooth instance id, DualSense MAC — so unplugging and replugging keeps your key
pointed at the same device.

### Key face

Per-key settings, grouped Device → Updates → On press → Key face → Levels → Colours:

- Meter as a battery bar, a ring around the key, or percentage only
- Choose what's drawn: device icon, percentage, name line, last known level, time left
- Full colour control (low / medium / high / charging / foreground / background) with
  your own low and medium thresholds
- Charging shows a bolt and breathes in the charging colour; offline devices show
  their last known level or a dash, your choice
- Poll every 10–300s, either fixed or adapting to what the battery is doing
- Press to refresh, or refresh and open an app, file or URL
- Optional flash warning when a level crosses under a threshold you set

### Requirements

- Windows 10 or later, Stream Deck app 6.5+
- Node.js 20+ on the machine running Stream Deck
- [HeadsetControl](https://github.com/Sapd/HeadsetControl/releases) on `PATH` for
  headset support — the property inspector tells you whether it found it, and links
  to the releases page if not

macOS is not supported. The code would likely mostly work, but none of the HID
providers have ever been run there, so it isn't claimed.

### Install

Download the `.streamDeckPlugin` file from the
[releases page](https://github.com/EmilB04/StreamDeck/releases), open it, and Stream
Deck does the rest. Then drag **Device Battery** onto a key and pick your device.

Building from source:

```sh
cd BatteryMonitor
npm install
npm run build
npm run sync-deps
npx @elgato/cli link
```

### Known limitations

- **Razer, Xbox and DualShock 4 support is unverified against hardware.** The
  protocols are implemented from public sources but no device has been tested.
  Their entries in the device picker say so.
- Xbox controllers report four capacity steps, not a percentage — the number shown is
  a stand-in for the step.
- Xbox over the USB dongle uses GIP rather than HID, so it isn't covered — Bluetooth
  only.
- Bluetooth Classic devices are listed but have no battery level to read; only LE
  devices with a GATT battery service report one.

Bug reports and device results — especially for the unverified providers — are
welcome in [Issues](https://github.com/EmilB04/StreamDeck/issues).

MIT with attribution. See [LICENSE](LICENSE).
