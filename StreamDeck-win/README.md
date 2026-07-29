# Battery Monitor (Stream Deck plugin)

Multi-purpose Stream Deck plugin. Starts with a single action — **Device
Battery** — that scans the computer for wireless peripherals, lets you pick one
in the property inspector, and shows its battery level on a key, polling on an
interval and refreshing on press. Built to grow: add a new file under
`src/actions/`, a matching entry in `manifest.json`, and it ships alongside
this one.

No device models are hard-coded. The dropdown is populated at runtime from what
the machine actually reports, so plugging in different gear just makes it show
up.

## How devices are detected

Each provider enumerates what it can see; the results are merged, sorted and
cached for 10s (`src/providers/discovery.ts`).

| Provider | Finds | Battery source |
|---|---|---|
| `headsetcontrol.ts` | Every headset [HeadsetControl](https://github.com/Sapd/HeadsetControl) supports (~100 models across HyperX, SteelSeries, Corsair, Logitech, Razer…) | Shells out to the CLI, which has already reverse-engineered each headset's HID report. Names come from its output. |
| `logitech.ts` | Every device paired to every Logitech receiver, plus directly-connected ones | HID++ 2.0 over `node-hid`. Product name and form factor are read from the device itself (feature `0x0005`), battery from `0x1004` Unified Battery, falling back to legacy `0x1000`. |
| `asus.ts` | Any ASUSTek HID device that presents as a peripheral, named from its USB product descriptor | The ROG receiver's vendor collection. No public spec; the protocol was derived on real hardware and validated against Armoury Crate — see "Asus battery protocol". |
| `windows-bluetooth.ts` | Any Bluetooth peripheral Windows itself tracks a battery level for | The `DEVPKEY_Bluetooth_Battery` PnP property (the same number the Settings app shows), read via PowerShell. Vendor-independent, so it covers devices no dedicated provider knows about — but only over Bluetooth, not proprietary 2.4 GHz dongles. |

Device identity is persisted as a stable key, not a HID path: Logitech devices
use their HID++ unit id, headsets their USB vendor/product ids, Bluetooth
devices their PnP instance id. Unplugging and replugging keeps the key working.

A scan takes ~3s, and results are cached for 10s so the property inspector and
the key don't rescan in lockstep. Pressing the key forces a fresh read.

## Requirements

- Stream Deck app (Windows 10+ or macOS 12+)
- Node.js 20+ on the machine running Stream Deck
- [HeadsetControl](https://github.com/Sapd/HeadsetControl/releases) on `PATH`
  (for headsets) — or set `HEADSETCONTROL_PATH` to its full path

## Build & install

```sh
npm install
npm run build           # rollup -> com.emilberglund.batterymonitor.sdPlugin/bin/
npm run sync-deps       # installs node-hid into the .sdPlugin folder
npx @elgato/cli link    # symlinks com.emilberglund.batterymonitor.sdPlugin into Stream Deck's plugin folder
```

Then in the Stream Deck app, drag the "Device Battery" action onto a key, and
pick the device + refresh interval in the property inspector. "Rescan devices"
re-enumerates without restarting the plugin.

## Customizing the key

Everything below is per-key, in the property inspector.

| Setting | Options | Default |
|---|---|---|
| Meter style | Battery bar / Ring / Percentage only | Battery bar |
| Show | device icon, percentage, name line (any combination) | icon + percentage |
| Name line shows | my title if set, else device name / device name / my title | my title if set |
| Key title | leave my title alone / device name / percentage | leave alone |
| Low at or below | 0–50% — switches the meter to the low colour | 20 |
| Medium at or below | 10–90% — switches the meter to the medium colour | 50 |
| Alert below | 0 disables; above 0 flashes Stream Deck's warning icon while under it | 0 |
| Colours | low, medium, high, charging, icon/outline, background | see below |

Defaults: low `#e35d5d`, medium `#e3b34d`, high `#2ecc71`, charging `#3ddc84`,
foreground `#eaeaea`, background `#1e2024`.

While charging, the key shows a bolt and breathes slowly in the charging colour
(a ~3.6s opacity swing between 0.78 and 1.0). Stream Deck rasterises each image
once, so SMIL/CSS animation inside the SVG does nothing — the movement comes
from the plugin re-sending a frame every 450ms. Frames are pure re-renders of
the cached reading, so an animating key does no device I/O.

The charging default changed from blue to green in settings v2. Existing keys
are migrated automatically, but only if their charging colour is still the old
default — a colour you picked yourself is left alone.

### Layout

In **bar** and **percentage** styles the enabled elements stack and are centred
as a group. In **ring** style the ring is a gauge around the edge of the key and
everything else renders inside it: stacking an icon, a ring, a percentage and a
name at 72px leaves no room for a legible number, but there's plenty of room for
all of them inside a border ring.

Text is sized to fit its slot (SVG offers no text metrics, so this uses an
estimated glyph width) and always sized against the worst case `100%`, so the
layout doesn't jump when a reading crosses 100 or drops to a dash. If everything
is enabled and the stack still exceeds the key, the gaps close up and then the
whole stack scales down proportionally rather than spilling over the edge.

Edits apply live: appearance changes are redrawn straight from the last reading
with no device I/O, so dragging a colour or a threshold repaints the key as you
go. Only switching device costs a lookup, and it reuses the scan the property
inspector just ran.

### Titles

Stream Deck paints its own title on top of the plugin's image, and it ignores a
plugin-set title on any key where the user typed one. That constrains both title
settings:

- **Key title** only takes effect on keys with an empty Title field. "Leave my
  title alone" is the default and never calls `setTitle` at all.
- **Name line** can render your own title in the key's own style (small, muted,
  laid out with the icon and percentage) — but only once you hide Stream Deck's
  title with the "T" toggle beside the Title field. While Stream Deck is still
  drawing it, "my title if set" falls back to the device name rather than
  printing the same text twice.

The plugin learns your title from `titleParametersDidChange`, which also reports
whether the title is visible. Multi-line titles are flattened to one line.

Appearance defaults are written into the key's settings the first time it
appears, so the property inspector's controls always match what's drawn.

Check what the machine exposes without going through Stream Deck at all:

```sh
npm run scan
```

```
discovery: found 5 device(s) in 2942ms

HyperX Cloud Alpha Wireless
  key      headset:0x03f0:0x098d
  provider headset   kind headset
  battery  97% (ok)

G502 X PLUS
  key      logitech:d922d39a
  provider logitech   kind mouse
  battery  88% (ok)
```

While iterating:

```sh
npm run watch           # rebuilds on save and restarts the plugin in Stream Deck
```

Useful CLI commands (`npx @elgato/cli <cmd>`):
- `restart com.emilberglund.batterymonitor` — restart after a manual build
- `validate com.emilberglund.batterymonitor.sdPlugin` — check the manifest
- `pack com.emilberglund.batterymonitor.sdPlugin` — produce a distributable `.streamDeckPlugin`

## Debugging

`Nodejs.Debug` is enabled in the manifest, so logger output lands in
`com.emilberglund.batterymonitor.sdPlugin/logs/`. Every scan logs how many
devices it found and how long it took; provider failures are logged with the
provider id.

If a key shows `--`/`ERR`, `npm run scan` is the fastest way to see which
provider is unhappy and why (each device prints its status and detail text).

If a key keeps showing the empty placeholder battery, the plugin's `setImage`
never landed. Two known causes: the image must be a data URI (`data:image/svg+xml;charset=utf8,…`)
— a bare `<svg>` string is silently ignored — and Stream Deck refuses plugin
images entirely for a key where the user has set a custom image.

`npx @elgato/cli restart` has been unreliable here (it reports "Stream Deck is
not running" and no-ops). Killing the plugin process works; Stream Deck respawns
it within ~2s:

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like '*batterymonitor*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

### Debugging Logitech

1. Confirm the receiver enumerates at all: `node scripts/hid-scan.mjs 046d`.
   The HID++ endpoint is usage page `0xff00` with two collections — usage `0x1`
   (short reports) and usage `0x2` (long reports). Windows exposes one handle per
   collection and rejects report ids the handle doesn't declare, so the provider
   opens both and writes each request to the matching one; an endpoint without a
   usage `0x2` collection is not HID++ and gets skipped.
2. `npm run scan` — a device that answers the HID++ ping but reports no battery
   shows up as "no battery data".
3. Device index, feature indices and response byte offsets can vary by
   firmware/receiver. `src/providers/logitech.ts` is the single place to adjust:
   `readBattery()` for the offsets, `DEVICE_INDICES` for which pairing slots get
   probed, `RESPONSE_TIMEOUT_MS` if a slow device is being missed.

### Asus battery protocol

Implemented and verified against Armoury Crate on a ROG Azoth via the ROG OMNI
RECEIVER (`0b05:1ace`). There is no public spec; this was derived on hardware
with `scripts/asus-*`. The three findings that made it work:

1. **The command channel is the receiver's vendor collections.** `HIDP_CAPS` says
   the `MI_02` collections (`0xff00`/`0xff01`/`0xff02`) have 64-byte input *and*
   output reports and no feature reports at all — which is why every
   `getFeatureReport` attempt returned nothing.
2. **Each collection accepts exactly one output report id**: `0xff02` -> `0x01`,
   `0xff00` -> `0x02`, `0xff01` -> `0x03`. Any other id fails with
   `ERROR_INVALID_PARAMETER`. Sending the conventional `0x00` never works.
3. **The reply arrives on the handle that sent the command**, not on other
   handles watching the same path.

The command is `0x12` (read info), sub-command `0x01`:

```
send: <report id> 12 01 00 ...                 (64 bytes)
recv: 02 12 01 00 00 00 56 04 00 00 14 56 47 10 ...
                        ^^          ^^ ^^
                     [6] = 0x56 = 86%   |
                              [10] = 0x14 = 20% low-battery threshold
                                 [11] = 0x56 = 86% (mirror)
```

`[6]` is the battery percentage, used directly with no scaling. `[10]` matching
Armoury Crate's "warn at 20%" setting is what confirmed the frame is the Power
tab's data block rather than a coincidence. `[11]` mirrors the level; the
provider cross-checks it and logs if the two ever disagree.

Unsupported commands answer `<report id> ff aa`, which the provider treats as
"no battery data" rather than a reading.

Note the `0x12 0x07` battery command documented for ROG *mice*
([g-helper #745](https://github.com/seerge/g-helper/discussions/745)) returns a
different, non-battery value here (17 while the battery was 86), so the mouse
layout does not transfer to this receiver.

**Not yet implemented: charging state.** The frame almost certainly carries it —
`[7]` was `0x04` at the time of capture — but it hasn't been observed with the
keyboard plugged in, so the provider reports `ok` rather than guessing. To
finish it, run `node scripts/asus-cmd.mjs 12 01` on battery and again while
charging, and diff the frames.

### Asus tooling

| Script | Purpose |
|---|---|
| `scripts/asus-caps.ps1` | Dumps `HIDP_CAPS` per interface — the report lengths Windows expects. Read-only. |
| `scripts/asus-write.ps1 -IdSweep` | Finds which output report ids a collection accepts. |
| `scripts/asus-cmd.mjs` | Sends commands and prints replies; `--sweep12` walks the `0x12` read family. |
| `scripts/asus-probe.mjs` | Feature/output sweeps, `--listen` for passive capture, `--paths` to feed the PowerShell tools. |

If a different ROG device doesn't answer, `node scripts/asus-cmd.mjs --sweep12`
is the fastest way to find its equivalent sub-command: it prints every reply that
isn't `ff aa`, and any byte matching the level Armoury Crate shows is flagged.


## Project layout

```
src/
  plugin.ts                  entry point, registers actions
  scan.ts                    `npm run scan` — prints discovery results to a terminal
  actions/battery-status.ts  the "Device Battery" action (polling, rendering, PI datasource)
  providers/
    discovery.ts             runs every provider, merges + caches the results
    types.ts                 BatteryProvider / DiscoveredDevice contracts
    hid.ts                   lazy node-hid loader shared by the HID providers
    log.ts                   logging seam so providers don't depend on the SDK
    headsetcontrol.ts        headsets, via the HeadsetControl CLI
    logitech.ts              HID++ 2.0 (name, type, unit id, battery)
    asus.ts                  ROG detection (battery not implemented)
    windows-bluetooth.ts     Windows PnP Bluetooth battery property
  ui/battery-svg.ts          renders the key face as an SVG data URI (no canvas/image lib needed)
com.emilberglund.batterymonitor.sdPlugin/
  manifest.json
  ui/battery-status.html     property inspector (device list is a plugin datasource)
  bin/                       build output (gitignored)
scripts/
  sync-runtime-deps.mjs      installs node-hid into the .sdPlugin folder
  hid-scan.mjs               lists connected HID devices, for reverse-engineering new providers
```

## Adding a device family

Implement `BatteryProvider` (`discover()` + `read()`) in `src/providers/`, then
add it to the `providers` array in `src/providers/discovery.ts`. Nothing else —
the property inspector, key rendering and settings all key off whatever
`discover()` returns.
