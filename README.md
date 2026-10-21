# Stream Deck plugins

Stream Deck plugins by [Emil Berglund](https://github.com/EmilB04). One directory
per plugin, each self-contained: its own `package.json`, build, tests and docs.

## Plugins

| Plugin | What it does | Platform | Download |
|---|---|---|---|
| [**Battery Monitor**](BatteryMonitor/) | Puts the battery level of your wireless headsets, mice, keyboards, controllers and Bluetooth devices on a key. Finds them itself, warns when one runs low, and has a key for whichever is emptiest. | Windows 10+ | [Latest release](https://github.com/EmilB04/StreamDeck/releases/latest) |

### Battery Monitor

[![Battery Monitor keys on a Stream Deck](BatteryMonitor/store/gallery/01-thumbnail.png)](BatteryMonitor/)

A controller, a phone, a headset, a mouse and a keyboard on five keys. The code
has no model list; the plugin finds them. See more screenshots in the
[plugin README](BatteryMonitor/README.md#what-it-looks-like).

## Install a plugin

1. Download the `.streamDeckPlugin` file from the
   [latest release](https://github.com/EmilB04/StreamDeck/releases/latest).
2. Double-click it. The Stream Deck app installs it.
3. Drag one of the plugin's actions onto a key.

To remove it, right-click the plugin in Stream Deck's store pane and uninstall.
It leaves nothing behind.

Battery Monitor also needs Node.js 20+ on the machine running Stream Deck, and
[HeadsetControl](https://github.com/Sapd/HeadsetControl/releases) on `PATH` if you
want headset support. Find the full requirements in
[its release notes](BatteryMonitor/RELEASE-NOTES.md).

## Build from source

Each plugin builds on its own. For Battery Monitor:

```sh
cd BatteryMonitor
npm install
npm run pack        # -> dist/com.emilberglund.batterymonitor.streamDeckPlugin
```

`npm run pack` produces the same file the releases carry, so you can test a build
before it ships. To develop against a live Stream Deck, run `npx @elgato/cli
link` on the `.sdPlugin` folder and use `npm run watch`. The
[plugin README](BatteryMonitor/README.md) covers the full loop.

CI runs these on every push and pull request (`.github/workflows/ci.yml`):

```sh
npm run typecheck && npm run lint && npm run format:check && npm test
```

## Releasing

Push a tag of the form `<plugin>-v<version>`, e.g. `battery-monitor-v1.1.0`.
`.github/workflows/release.yml` builds that plugin, packs it, and attaches the
`.streamDeckPlugin` file to a GitHub release. Run the same workflow through
`workflow_dispatch` to pack without releasing; the file stays as a build
artifact.

## Adding a plugin

Give it a new top-level directory. Add a row to the table above, a tag prefix
case in `release.yml`, and a job or matrix entry in `ci.yml`.

## Licence

MIT with attribution, see [LICENSE](LICENSE).
