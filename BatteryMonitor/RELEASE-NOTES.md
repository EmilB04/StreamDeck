# Battery Monitor — release notes

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
