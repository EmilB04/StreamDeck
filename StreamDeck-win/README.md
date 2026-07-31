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
| `razer.ts` | Razer wireless mice, keyboards and headsets | The OpenRazer control protocol: a 90-byte feature report carrying the power command class. No model list — anything that answers reports its level. **Unverified against hardware.** |
| `xbox.ts` | Xbox Wireless Controllers over Bluetooth | Input report `0x04`, one byte of flags — four capacity steps, not a percentage. Dongle/USB is GIP, not HID, so it isn't covered. **Unverified against hardware.** |
| `dualsense.ts` | PlayStation controllers: DualSense, DualSense Edge, DualShock 4, over USB or Bluetooth | The pad's own input report — see "DualSense battery". Needed because neither OS route sees it: it pairs as Bluetooth Classic, so there's no GATT battery service for Windows to mirror, and over USB it's a plain HID gamepad. |
| `windows-bluetooth.ts` | Every paired, present Bluetooth device | The `DEVPKEY_Bluetooth_Battery` PnP property (the same number the Settings app shows), read via PowerShell. Vendor-independent, so it covers devices no dedicated provider knows about — but only Bluetooth **LE** devices with a GATT battery service have the property at all. Classic devices are still listed, without a level. |
| `generic-hid.ts` | Everything else on HID, so nothing is invisible | Nothing — no battery protocol. Cable-connected devices are reported as mains powered; wireless ones (and anything named like a receiver) as unreadable, since they may well have a battery this plugin can't see. |

Device identity is persisted as a stable key, not a HID path: Logitech devices
use their HID++ unit id, headsets their USB vendor/product ids, Bluetooth
devices their PnP instance id, a DualSense its MAC address. Unplugging and replugging keeps the key working.

A scan takes ~3s, and results are cached for 10s so the property inspector and
the key don't rescan in lockstep. Pressing the key forces a fresh read.

Everything detected is listed, with the devices that can actually report a level
sorted first. One piece of hardware can reach two providers — a DualSense is
both a Sony HID device and a paired Bluetooth node; a HyperX headset is both a
HeadsetControl device and a plain HID interface — so `mergeGeneric` drops the
entry that can't read a battery when another one can. Matching is on the name,
loosely enough to survive the HID layer's manufacturer prefix ("HP, Inc HyperX
Cloud Alpha Wireless" vs "HyperX Cloud Alpha Wireless") but falling back to
equality for names too short to match safely.

## Requirements

- Stream Deck app (Windows 10+ or macOS 12+)
- Node.js 20+ on the machine running Stream Deck
- [HeadsetControl](https://github.com/Sapd/HeadsetControl/releases) on `PATH`
  (for headsets) — or set `HEADSETCONTROL_PATH` to its full path. The property
  inspector says whether it found it, and has a button that opens the releases
  page via `streamDeck.system.openUrl` (the real browser — the inspector is a
  webview with nowhere to put a page).

## Build & install

```sh
npm install
npm run build           # rollup -> com.emilberglund.batterymonitor.sdPlugin/bin/
npm run sync-deps       # installs node-hid into the .sdPlugin folder
npx @elgato/cli link    # symlinks com.emilberglund.batterymonitor.sdPlugin into Stream Deck's plugin folder
```

Then in the Stream Deck app, drag the "Device Battery" action onto a key, and
pick the device + interval in the property inspector. The refresh button beside
the device list re-enumerates without restarting the plugin.

### Developing from WSL

Working on the source in WSL while Stream Deck runs on Windows needs one extra
step, because a WSL path can't back the symlink under `%APPDATA%` and
`streamdeck restart` can't be driven from a WSL shell at all — cmd.exe refuses a
UNC working directory, after which the CLI reports "Stream Deck is not running"
and quietly does nothing. So the Windows-side copy of
`com.emilberglund.batterymonitor.sdPlugin` stays the deploy target:

```sh
npm run deploy          # build, rsync to the installed plugin folder, restart the plugin
```

It resolves the target by following the link Stream Deck actually loads (set
`SD_PLUGIN_DIR` to override), skips `logs/`, and restarts by killing the
plugin's `node.exe` — Stream Deck respawns it within a couple of seconds.
`npm run watch` is Windows-only for the same CLI reason.

`npm run sync-deps` must still be run **on Windows**: it installs node-hid's
native binary, and the one WSL produces won't load inside Stream Deck.

## Publishing to Marketplace

```sh
npx streamdeck validate com.emilberglund.batterymonitor.sdPlugin
npx streamdeck pack com.emilberglund.batterymonitor.sdPlugin
```

`pack` validates first and writes a `.streamDeckPlugin`, which is uploaded in
[Maker Console](https://docs.elgato.com/maker-console/managing-products/) along
with an app icon and gallery images. Review takes 4–10 business days.

What's already prepared for that:

- **`.sdignore`** keeps development leftovers out of the package — logs, editor
  state, source maps, `bin/scan.js`, and node-hid's prebuilt binaries for the
  platforms this doesn't declare. 264 files / 6.2 MB became 217 / 3.9 MB.
- **Action and category icons are monochrome white on transparent**, which the
  [icon guidelines](https://docs.elgato.com/guidelines/stream-deck/plugins/)
  require for anything shown in Stream Deck's own lists. Colour is kept for the
  app icon and the store listing, which stand alone.
- **`store/app-icon-256.png` and `-512.png`** are the Marketplace listing icon,
  which is a separate asset from the manifest's — it's uploaded in Maker
  Console, so it lives outside the `.sdPlugin` folder and never ships.
- **Version `1.0.0.0`**, and **macOS removed from the manifest**: the HID
  providers there would need Input Monitoring permission and none of it has
  ever been run, so claiming a platform a reviewer can find dead is worse than
  shipping Windows-only and adding mac once it's tested.

Still open before submitting:

- **Razer, Xbox and DualShock 4 are unverified** against hardware. They're
  marked in the property inspector, but public users will hit that code.
- Gallery images and a support URL still have to be produced — neither can come
  from the repo.
- Optional: **DRM** needs `SDKVersion: 3` and `Software.MinimumVersion: 6.9`,
  which encrypts the package at the cost of a runtime-readable manifest.

## Actions

**Device Battery** — one device on one key, chosen in the property inspector.

**Lowest Battery** — whichever detected device has least charge, named on the
key. Five keys each showing a healthy number don't answer "is anything about to
die on me"; this one does. It reads nothing itself: discovery has already
collected every level, so it only chooses between readings that exist.

The face says which kind of key it is. A chevron in the top left — where this
plugin keeps its corner markers, alongside the charging bolt and the offline
glyph — marks it as "the emptiest of several" rather than one device's own
reading, since the two would otherwise be indistinguishable. Sharing that corner
means it yields to the bolt while charging: one marker at a time stays readable,
and a device on the charger is on its way out of being the problem. It takes the meter's colour, and once the device it found is
at or below the low threshold the whole key gains a frame in that colour: a
single low number among five healthy keys is easy to miss, a red-framed key
isn't.

Only live readings are eligible — a device that's off can't win with the level
it had yesterday, and a mains-powered one has nothing to compare. **Peripherals
only** (the default) leaves out phones, tablets and watches, which have their
own chargers and their own warnings; on the dev machine that's the difference
between reporting a keyboard at 81% and a phone at 56%.

## Customizing the key

Everything below is per-key, in the property inspector, which is grouped as
Device → Updates → On press → Key face → Levels → Colours. A strip at the top
shows what the key is reading right now; the plugin answers those requests from
the reading it already drew, so the panel can ask every few seconds without
touching a device. Explanations sit behind "About …" disclosures rather than
under every control.

| Setting | Options | Default |
|---|---|---|
| Device | whatever discovery found; the refresh button beside it rescans | first battery-capable device |
| Nickname | a name of your own, replacing the one the device reports | its own name |
| Icon | which form factor to draw, or work it out | work it out |
| Power source | work it out automatically, or "always plugged in" to force the plug symbol | automatic |
| Check battery every | 10–300 seconds | 60 |
| Timing | always use that interval, or adapt to what the battery is doing | always use it |
| When pressed | check the battery, or check it and open an app/file/URL | check the battery |
| If device is off | show its last known level, or a dash | show last known |
| Meter style | Battery bar / Ring around the key / Percentage only | Battery bar |
| Draw on the key | device icon, percentage, name line, last level when off, time left | percentage + name line |
| Name line text | my title if set, else device name / device name / my title | my title if set |
| Stream Deck title | leave my title alone / device name / percentage | leave alone |
| Low colour up to | 0–50% | 20 |
| Medium colour up to | 10–90% — above it, the high colour | 50 |
| Flash warning below | 0 disables; above 0 flashes Stream Deck's warning icon once when the level crosses under it | 0 |
| Colours | low, medium, high, charging, icon & outline, background | see below |

Defaults: low `#e35d5d`, medium `#e3b34d`, high `#2ecc71`, charging `#55ff7f`,
foreground `#eaeaea`, background `#000000`.

While charging, the key shows a bolt in the top left and breathes slowly in the charging colour
(a ~3.6s opacity swing between 0.78 and 1.0). Stream Deck rasterises each image
once, so SMIL/CSS animation inside the SVG does nothing — the movement comes
from the plugin re-sending a frame every 450ms. Frames are pure re-renders of
the cached reading, so an animating key does no device I/O.

### Polling

Every check costs real work: a spawned HeadsetControl, a spawned PowerShell for
the Bluetooth property, and HID handles opened on the Logitech, Asus and Sony
devices. At the 60s default that's fine; at 10s it's a scan running about a
quarter of the time, forever, for a number that on most devices moves in steps
of 10%.

**Timing: adapt** trades that fixed cadence for one driven by the reading
(`adaptiveSeconds` in `src/actions/settings.ts`):

| State | Next check |
|---|---|
| Charging | 15s |
| At or below the low threshold | 30s |
| Steady reading | your interval × 1.5 per unchanged reading, up to 10 min |
| Device off / erroring | 2 min, or your interval if that's longer |

Your configured interval is the baseline, not a ceiling: charging and low levels
can only *shorten* it, so a key set to 15s stays at 15s throughout, and any
change in the percentage resets the backoff. `MIN_REFRESH_SECONDS` (10s) remains
the floor, and pressing the key always reads immediately.

Polling is a chain of one-shot timers rather than an interval, so each tick can
pick its own successor. In fixed mode every link is the same length, which is
the old behaviour exactly.

### Devices with no battery

A device that never runs on a battery has no percentage to show, and drawing a
dash for it says "something is wrong" when nothing is. Those keys draw a plug in
place of the meter and the number instead — the icon and name line stay, so the
key still identifies what it's for.

Two things produce that state. The catch-all HID provider marks cable-connected
devices as mains powered automatically, since a wired mic or a USB fan cannot
have a battery. Everything else is a judgement call the plugin can't make: a
Bluetooth speaker reporting no level looks exactly like a headset whose battery
Windows can't read, so those stay on "no battery data" until you set the key's
**Power source** to "always plugged in", which forces the plug.

The picker says which is which: `(mains powered)` versus `(no battery data)`.

### Pressing the key

A press always reads the device immediately, bypassing the discovery cache. Set
**When pressed** to "check the battery and open an app" to have it also open
something: pick from the installed-app list, or type any path, document or link
the shell can handle (`steam://`, `https://`, a `.lnk`). Both controls write the
same setting, and a typed value stays selected in the list.

The app list comes from `Get-StartApps` (`src/actions/apps.ts`) — everything the
Start menu can launch, Store apps included, which is a superset of "things with
a shortcut on disk". It's cached for 5 minutes and the picker's refresh button
drops the cache; obvious non-apps (uninstallers, readmes, "visit our website")
are filtered out.

Apps are stored as `app:<AppID>` and launched with
`explorer.exe shell:AppsFolder\<AppID>`, the same route the Start menu takes.
The prefix is needed because an AppID isn't distinguishable from a path or a URL
by shape — Windows hands back `Microsoft.WindowsCalculator_8wekyb3d8bbwe!App`,
`{6D809377-…}\Android\…\studio.exe` and `steam://rungameid/1172470` from the
same list — and only the AppsFolder route resolves the first kind.

The launch happens first, before the scan — waiting on ~2.3s of HID work would
make the app feel slow to open. It's spawned detached and unreferenced so it
outlives the plugin and doesn't hold Node's event loop open, and on Windows it
goes through `cmd /c start "" <target>`; the empty first argument is the window
title `start` would otherwise take a quoted path to be. A bad path is logged
rather than shown on the key: the key's warning means "your device is gone", and
giving it a second meaning would blunt both.

If the device isn't connected, the press also flashes Stream Deck's warning icon
and puts **"Device is Disconnected"** on the key for 2.5s before restoring the
face. Without that, pressing a key for a device that's gone looks like nothing
happened at all: the face is already showing the last known level, and a fresh
read doesn't change it. Stream Deck gives a plugin no toast or tooltip, so the
key itself carries the words (`noticeKeyImage`).

The warning goes up **before** the forced scan, not after it. The key already
knows the device was missing a moment ago, and that's what the press is asking
about; waiting for a ~2.3s rescan to confirm it made the press look ignored.
While a message is up, `render` is a no-op, so the scan finishing behind it
can't replace the words with the face mid-message — the reading is still cached
and gets drawn when the message clears. A scan that *discovers* the device is
gone still raises the warning at that point, which is the earliest it can be
known.

### Time remaining

With **time left** on, the name line carries an estimate ("2h 20m") instead of
the device name — at 72px there's room for one of them, and once you know which
key is which, the estimate is the more useful.

The rate comes from a short history of levels kept in the key's settings
(`recordSample`, `estimateRemaining`). The oldest and newest samples give it: a
median of intervals would resist an odd reading better, but wireless gauges move
in 10% steps, so over a handful of samples the endpoints *are* the trend and
anything cleverer is fitting noise.

Nothing is shown until there's evidence — at least a 3% drop over at least ten
minutes — so a fresh key stays quiet rather than guessing. A level that goes up
throws the history away: a device that has been on a charger has no useful
discharge behind it, and averaging across the charge would report nonsense.
Verified against synthetic histories: a 5%/h drain at 70% reports 14h, a coarse
10%-step device reports 16h, and thin evidence reports nothing.

### One look across every key

**Apply this look to all keys** copies the colours, thresholds and what's drawn
onto every other Battery Monitor key, of either action. It writes the appearance
to global settings; `plugin.ts` subscribes once and pushes it into each visible
key, so both action types adopt it through the same path rather than each
button knowing about every action. A key added later starts from the shared look
instead of the shipped defaults.

They remain ordinary per-key settings afterwards — this is a deliberate push,
not a binding, so one key can still be odd on purpose.

### Offline devices

A wireless device that is switched off or out of range simply stops being
detected, and a key that answered "—" would throw away the one thing still worth
knowing: where the battery was when it disappeared. So the last percentage a
device actually reported is stored per key (in the action's settings, so it
survives a plugin restart or a reboot) and is what the key shows while the
device is gone:

- the whole face is drawn at 45% opacity, so it can't be mistaken for a live
  reading, while the meter keeps its threshold colour so the level still reads
  at a glance;
- a crossed-out circle in the top left marks it as not live, on a disc of the
  key's background colour — the same corner treatment as the lowest-battery
  chevron, so a marker sitting over the meter stays readable;
- the name line, if it's on, is prefixed with the age of that reading (`3h ·
  Kraken V3`) — the age goes first because the line truncates from the right;
- the "percentage" key title gets a `~` prefix (`~78%`).

The stored level is only written when the percentage changes (or its timestamp
has drifted more than 10 minutes), so an idle key isn't writing settings every
poll. Any status without a live number qualifies for the substitution except
"mains powered", which has no level to be missing. That includes "unsupported":
a ROG receiver whose keyboard is switched off reports exactly that, since the
dongle is still plugged in and only the device behind it went quiet — and a key
that has read a percentage from it before has proof the battery is real. Without
that, those keys showed "N/A" and threw away the last level they knew.

The warning fires **once per trip** below the threshold, not once per
reading: the old behaviour flashed on every poll, which at a 10s interval is six
flashes a minute for as long as the device stays low — enough to make anyone
turn the warning off entirely, costing them the one alert that mattered. The
latch clears when the level recovers or the device goes on charge.

"Flash warning below" deliberately ignores a last-known level — otherwise a device
left switched off below the threshold would flash forever. A device that exposes
no battery at all still shows `N/A`, since there is no earlier level it could
fall back to.

Two defaults have moved since v1: the charging colour (blue to green in v2, to a
brighter green in v4) and the background (near-black `#1e2024` to `#000000` in
v5). Existing keys follow, but only where the colour is still one this plugin
chose (`LEGACY_CHARGING_COLORS`, `LEGACY_BACKGROUND_COLORS`) — one you picked
yourself is left alone.

### Charging without a charging flag

Not every source can say whether a device is charging. The Windows PnP battery
property is a bare percentage, so a phone on a charger looks exactly like one in
a pocket; Windows keeps a Boolean next to it (`{104EA319-…} 3`) that looks like
it ought to be the flag, but it stays `False` on a phone whose level is visibly
climbing, so it isn't one.

A provider declares this with `reportsCharging = false`, and for those devices
the plugin infers it: **a level that has gone up since the last reading can only
have come from a charger.** The state sticks while the level holds — a phone
parked at 100% is still plugged in — and clears as soon as the level drops, or
as soon as the device disappears (coming back at a higher level means it was
charged somewhere else, not that it's charging now).

It is a guess, and it's wrong in one case: unplug at a level the device then
holds, and the bolt stays until the first drop.

### Device icons

Eleven form factors are drawn: headset, earbuds, mouse, keyboard, gamepad,
phone, tablet, speaker, microphone, watch, and a generic fallback. Providers
pick one from what they know — Logitech's HID++ device type, a HID usage page,
or the device's own name — and the key draws it.

Every glyph lives on one 24×24 grid at one stroke weight, then scales into
whichever slot the layout gives it (21px in the flat styles, 17px inside the
ring). That shared grid is what makes a keyboard and a phone look like one set
rather than clip art from different places, and it keeps their optical sizes in
step; before it, each glyph carried hand-placed coordinates and its own weight.
Strokes are round-capped and outlined rather than filled, except for details
that would fill in at 20px — keycaps, gamepad buttons, a speaker's tweeter.

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

- **Key title** only takes effect on keys with an empty Title field. Switching
  back to "leave my title alone" calls `setTitle()` with no argument, which
  hands the title back to Stream Deck — without that, the last title the plugin
  wrote would stay on the key for good. The applied value is remembered so a
  repaint doesn't re-send an unchanged title, and it starts unset so the first
  paint after a restart clears anything left behind by a previous run.
- A title the plugin wrote is not treated as a title you chose: it echoes back
  through `titleParametersDidChange`, and without that check "device name" mode
  would read as a custom title and suppress the name line.
- **Name line** can render your own title in the key's own style (small, muted,
  laid out with the meter and percentage) — but only once you hide Stream Deck's
  title with the "T" toggle beside the Title field.

A title you type always replaces the device name; it never appears alongside it.
While Stream Deck is still drawing that title itself, the key already carries
the words, so the plugin draws no name line at all rather than repeating the
device name underneath and making the key say two different things.

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

### Brand coverage

There is no general answer to "what's this peripheral's battery": Windows has
no `Class=Battery` node for any of them and no battery property outside
Bluetooth LE, so every family needs its own protocol. What that means per brand:

| Brand | Headsets | Mice / keyboards | Controllers |
|---|---|---|---|
| Logitech | HeadsetControl | `logitech.ts` (HID++) | `logitech.ts` |
| Razer | HeadsetControl, or `razer.ts` | `razer.ts` | — |
| SteelSeries, Corsair, HyperX, Turtle Beach, Roccat, Astro | HeadsetControl | — | — |
| Asus ROG | HeadsetControl | `asus.ts` | — |
| Sony | — | — | `dualsense.ts` |
| Xbox | — | — | `xbox.ts` (Bluetooth only) |
| Anything on Bluetooth LE | `windows-bluetooth.ts` | `windows-bluetooth.ts` | `windows-bluetooth.ts` |

HeadsetControl is the reason the headset column is nearly full: it has already
reverse-engineered ~100 models across those brands, and this plugin lists
whatever it reports. Installing it is the single biggest coverage win, which is
why a missing binary is worth checking first when a headset shows no level.

The gaps are mice and keyboards from SteelSeries, Corsair, Roccat and the rest.
Each speaks its own vendor HID protocol, and unlike Razer's there is no single
documented command that spans a vendor's range — the report differs per model.
Adding one means probing that specific device (`scripts/hid-scan.mjs` and the
`asus-*` tools exist for exactly that), so they're better added on demand by
someone holding the hardware than guessed at here.

**Xbox controllers** are covered over Bluetooth only (`xbox.ts`), and they
report four steps rather than a percentage — see below. Through the Xbox
Wireless dongle or a USB cable the pad speaks GIP, not HID, and its battery
isn't in any report this can read; that route would need the WinRT
`IGameControllerBatteryInfo` API, which isn't reachable from the plugin's
Node process.

**Nintendo** pads carry the level in a nibble of their full input report, but
reaching that report needs a subcommand handshake rather than a single feature
read, which is a bigger piece of work than it looks.

### Xbox battery

An Xbox pad sends its battery as its own input report, id `0x04`, carrying one
byte of flags — the layout Linux's xpadneo driver decodes:

```
bit 7    online
bit 4    charging
bits 3-2 supply kind (internal, AA cells, rechargeable pack)
bits 1-0 capacity: 0 critical, 1 low, 2 medium, 3 full
```

Note what isn't there: a percentage. The pad knows four steps, so the key shows
10 / 35 / 70 / 100% with the word ("Medium") in the detail line, and the number
sits still until the step changes. That's the device's resolution, not a bug in
the reading.

The report arrives when the level changes rather than on a schedule, so a quiet
pad may not send one while discovery is listening — the provider asks for it as
a feature report first, then listens briefly, and says "didn't send a battery
report" rather than guessing. `scripts/xbox-probe.mjs` listens for longer and
prints every report id it sees, which is the thing to run if a pad stays blank.

Detection is by shape, not model: a Microsoft gamepad on a Bluetooth path. No
product ids are listed, so an Xbox One S pad, a Series X|S pad and whatever
ships next all take the same route.

### DualSense battery

A DualSense reports its battery in the input report it already streams. One byte
holds both halves of the answer — low nibble is the level in units of 10%, high
nibble is the charge state — which is the layout Linux's `hid-playstation` uses:

```
31 41 7e 85 7d 80 00 00 01 08 ... 08 ...
|  |  |                           |
|  |  +-- sticks (LX LY RX RY)    +-- [54] status: level 8, state 0 -> 85%, discharging
|  +----- sequence / flags
+-------- report id
```

`percent = min(level * 10 + 5, 100)`; the `+5` centres each of the 11 steps
rather than reporting its floor. State `1` is charging and `2` is charge
complete — both mean the cable is attached, so both show the charging indicator,
matching what `logitech.ts` does with its own charge-complete state. `a`/`b` are
a temperature fault and `f` a charging error.

Note that a DualSense reports "complete" long before its gauge reads full: a pad
on the charger at level 8 sends `0x28`, i.e. complete at 85%. Linux's driver
rounds that up to 100%; this one keeps the pad's own level, since claiming 100%
on a key that then drops to 85% when unplugged is worse than being honest. A
level of `0` with state `2` is the one combination taken as literally full.

The catch is Bluetooth. The pad connects in a compatibility mode whose report is
**also** id `0x01` — Windows pads it out to the full 78 bytes, so length can't
tell them apart, and everything past the sticks and buttons is zero:

```
01 7e 85 7d 80 08 00 08 00 00 00 00 ...   <- no battery anywhere in here
```

Reading feature report `0x05` (calibration data) makes it switch to the full
`0x31` report, and it stays switched. That's a GET_FEATURE — a read — so the
provider still never writes to the controller; it's also what any game does when
it takes the pad over. Over USB none of this applies: the report is id `0x01`
with the status one byte earlier, at `[53]`.

`node scripts/dualsense-probe.mjs` dumps the reports and decodes both candidate
offsets, which is how the above was verified (85%, matching the pad).

## Project layout

```
src/
  plugin.ts                  entry point, registers actions
  scan.ts                    `npm run scan` — prints discovery results to a terminal
  actions/
    battery-status.ts        the "Device Battery" action (polling, rendering, PI datasource)
    lowest-battery.ts        the "Lowest Battery" action — picks the emptiest device
    settings.ts              per-key settings shape, defaults and version migrations
    apps.ts                  lists installed applications for the picker (Get-StartApps)
    launch.ts                opens the app/file/URL a press is pointed at
  providers/
    discovery.ts             runs every provider, merges + caches the results
    types.ts                 BatteryProvider / DiscoveredDevice contracts
    hid.ts                   lazy node-hid loader shared by the HID providers
    log.ts                   logging seam so providers don't depend on the SDK
    headsetcontrol.ts        headsets, via the HeadsetControl CLI
    logitech.ts              HID++ 2.0 (name, type, unit id, battery)
    asus.ts                  ROG detection (battery not implemented)
    dualsense.ts             PlayStation pads (DualSense, DualShock 4), from their own input report
    razer.ts                 Razer peripherals, via the OpenRazer control protocol
    xbox.ts                  Xbox pads over Bluetooth, from input report 0x04
    generic-hid.ts           catch-all: lists remaining HID devices, mains vs unreadable
    windows-bluetooth.ts     Windows PnP Bluetooth battery property
  ui/battery-svg.ts          renders the key face as an SVG data URI (no canvas/image lib needed)
com.emilberglund.batterymonitor.sdPlugin/
  manifest.json
  ui/battery-status.html     property inspector (device list is a plugin datasource)
  ui/lowest-battery.html     property inspector for the lowest-battery action
  ui/inspector.css           styling shared by both inspectors
  bin/                       build output (gitignored)
scripts/
  sync-runtime-deps.mjs      installs node-hid into the .sdPlugin folder
  deploy.mjs                 `npm run deploy` — WSL -> installed plugin folder, then restarts it
  hid-scan.mjs               lists connected HID devices, for reverse-engineering new providers
  dualsense-probe.mjs        dumps DualSense input reports and decodes the battery byte
  razer-probe.mjs            walks Razer interfaces and transaction ids, printing what answers
  xbox-probe.mjs             listens for an Xbox pad's battery report and decodes its flags
  gen-icons.py               draws the plugin/action icons at Elgato's asset sizes
```

## Adding a device family

Implement `BatteryProvider` (`discover()` + `read()`) in `src/providers/`, then
add it to the `providers` array in `src/providers/discovery.ts`. Nothing else —
the property inspector, key rendering and settings all key off whatever
`discover()` returns.
