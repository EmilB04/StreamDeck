/**
 * Renders the Marketplace assets: the app icon and the gallery images.
 *
 * Run: npx tsc -p tsconfig.test.json && node scripts/render-store.mjs
 *
 * Every key on these images is drawn by the plugin's own renderer
 * (src/ui/key-svg.ts, compiled to .test-build by the test config), so the
 * gallery shows what a key really looks like. The pages are laid out in HTML and
 * screenshotted with headless Edge, which has Segoe UI and draws SVG text; the
 * Pillow script used for the other icons can do neither.
 *
 * Needs Edge on Windows, reached from WSL, or `EDGE` set to a Chromium binary.
 *
 * Writes:
 *   store/app-icon.svg                              the icon, as a vector
 *   store/app-icon-256.png, app-icon-512.png        uploaded in Maker Console
 *   store/gallery/*.png                             1920 x 960
 *   store/portfolio/*.png                           the same at 2x
 *   com.emilberglund.audioswitch.sdPlugin/imgs/plugin/marketplace(@2x).png
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { keySvg } = require(join(root, ".test-build/src/ui/key-svg.js"));

const EDGE = process.env.EDGE ?? "/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const onWindows = process.platform === "win32";

const store = join(root, "store");
const sdPlugin = join(root, "com.emilberglund.audioswitch.sdPlugin");
for (const dir of ["gallery", "portfolio"]) mkdirSync(join(store, dir), { recursive: true });

// ---------------------------------------------------------------- screenshots

const work = mkdtempSync(join(tmpdir(), "audioswitch-store-"));

/** A path Edge can open: Windows form when Edge is the Windows one. */
const forEdge = (path) => {
	if (onWindows || !EDGE.endsWith(".exe")) return path;
	return spawnSync("wslpath", ["-w", path], { encoding: "utf8" }).stdout.trim();
};

function shoot(html, width, height, out, { scale = 1, transparent = false } = {}) {
	const page = join(work, `${Math.random().toString(36).slice(2)}.html`);
	const shot = join(work, `${Math.random().toString(36).slice(2)}.png`);
	writeFileSync(page, html);
	const args = [
		"--headless=new",
		"--disable-gpu",
		"--hide-scrollbars",
		`--window-size=${width},${height}`,
		`--force-device-scale-factor=${scale}`,
		`--screenshot=${forEdge(shot)}`,
		...(transparent ? ["--default-background-color=00000000"] : []),
		`file:///${forEdge(page).replaceAll("\\", "/")}`,
	];
	const run = spawnSync(EDGE, args, { encoding: "utf8" });
	if (run.error) throw run.error;
	copyFileSync(shot, out);
	console.log(`wrote ${out.replace(`${root}/`, "")}`);
}

// ------------------------------------------------------------------- the icon

/** A key face in a rounded square: the same artwork the plugin draws on a key. */
const iconFace = { kind: "headphones", state: "active", title: "Headphones", showIcon: true };

const appIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72">
	<defs><clipPath id="icon-shape"><rect width="72" height="72" rx="15.84"/></clipPath></defs>
	<g clip-path="url(#icon-shape)">${keySvg(iconFace).replace('<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144"', '<svg x="0" y="0" width="72" height="72"')}</g>
</svg>
`;
writeFileSync(
	join(store, "app-icon.svg"),
	`<!--
  Audio Switch app icon: a key face drawn by the plugin's own renderer
  (keySvg in src/ui/key-svg.ts: headphones, lit, "Headphones"), clipped to the
  icon's rounded square. The PNGs in store/ and imgs/plugin/marketplace* are
  rasterised from this file by scripts/render-store.mjs.
-->
${appIconSvg}`,
);

for (const [size, out] of [
	[256, join(store, "app-icon-256.png")],
	[512, join(store, "app-icon-512.png")],
	[288, join(sdPlugin, "imgs/plugin/marketplace.png")],
	[576, join(sdPlugin, "imgs/plugin/marketplace@2x.png")],
]) {
	const svg = appIconSvg.replace('width="72" height="72"', `width="${size}" height="${size}"`);
	shoot(
		`<html><body style="margin:0;background:transparent">${svg}</body></html>`,
		size,
		size,
		out,
		{ transparent: true },
	);
}

// ---------------------------------------------------------------- the gallery

/** One key, as inline SVG, at `px` pixels square with the corners rounded like a real key. */
const key = (face, px) => {
	const svg = keySvg(face).replace('width="144" height="144"', `width="${px}" height="${px}"`);
	return `<span class="key" style="width:${px}px;height:${px}px;border-radius:${px * 0.14}px">${svg}</span>`;
};
const emptyKey = (px) =>
	`<span class="key empty" style="width:${px}px;height:${px}px;border-radius:${px * 0.14}px"></span>`;

const face = (kind, title, state = "inactive", extra = {}) => ({ kind, state, title, showIcon: true, ...extra });

const STYLE = `
* { box-sizing: border-box; }
html, body { margin: 0; }
body {
	width: 1920px; height: 960px; overflow: hidden; position: relative; color: #fff;
	font-family: "Segoe UI", Arial, Helvetica, sans-serif;
	background: radial-gradient(ellipse 70% 90% at 50% 52%, #3c41cf 0%, #2b2db0 40%, #1b1b7c 100%);
}
h1 { margin: 0 0 14px; font-size: 52px; font-weight: 600; letter-spacing: -0.01em; }
.lead { margin: 0 0 30px; font-size: 25px; line-height: 1.4; color: rgba(255,255,255,.72); }
ul { margin: 0; padding: 0; list-style: none; }
li { position: relative; margin: 0 0 18px; padding-left: 30px; font-size: 24px; line-height: 1.35; color: rgba(255,255,255,.9); }
li::before { content: ""; position: absolute; left: 0; top: 11px; width: 10px; height: 10px; border-radius: 50%; background: #fff; opacity: .85; }
.key { display: inline-block; overflow: hidden; background: #000; box-shadow: 0 6px 18px rgba(0,0,0,.45); }
.key svg { display: block; }
.key.empty { background: #0c0c12; box-shadow: inset 0 2px 8px rgba(0,0,0,.6); }
.deck { position: absolute; padding: 55px 65px; border-radius: 52px; background: #1d1d22; border: 2px solid #2c2c33;
	box-shadow: 0 30px 70px rgba(0,0,0,.5); display: grid; grid-template-columns: repeat(5, 150px); gap: 30px; }
.deck-name { position: absolute; letter-spacing: .5em; font-size: 15px; color: rgba(255,255,255,.35); }
.caption { font-size: 22px; font-weight: 600; text-align: center; }
.sub { font-size: 19px; text-align: center; color: rgba(255,255,255,.7); line-height: 1.35; }
`;

const page = (body, extraStyle = "") =>
	`<!doctype html><html><head><meta charset="utf-8"><style>${STYLE}${extraStyle}</style></head><body>${body}</body></html>`;

const bullets = (items) => `<ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>`;

// 01 — thumbnail: a full deck.
const thumbnail = (() => {
	const keys = [
		face("monitor", "Odyssey G85SD", "active"),
		face("headphones", "Headphones"),
		face("speaker", "Speakers"),
		face("headset", "HyperX Cloud", "missing"),
		face("soundbar", "Soundbar"),
		face("earbuds", "Buds"),
		face("tv", "LG TV"),
		face("microphone", "SoloCast", "active", { dots: { count: 3, active: 0 } }),
		face("webcam", "Webcam"),
		face("line", "Line In"),
		face("headphones", "Headphones", "active", { dots: { count: 2, active: 1 } }),
	];
	const cells = [...keys.map((f) => key(f, 150)), emptyKey(150), emptyKey(150), emptyKey(150), emptyKey(150)];
	return page(`
		<div style="position:absolute;left:130px;top:250px;width:610px">
			<h1>One key, the right speakers</h1>
			<p class="lead">Change your Windows speakers, headphones or microphone from the deck.</p>
			${bullets([
				"Switch to one device, or step through several",
				"Separate keys for output and input",
				"Calls and music can go to different devices",
				"The key lights up while its device is in use",
			])}
		</div>
		<div class="deck" style="left:830px;top:150px">${cells.join("")}</div>
		<div class="deck-name" style="left:1190px;top:845px">stream deck</div>`);
})();

// 02 — the faces a key can have.
const states = (() => {
	const big = [
		["In use", "Lit while the device is the default", face("monitor", "Odyssey G85SD", "active")],
		["Not in use", "Grey until you press it", face("headphones", "Headphones")],
		["Not connected", "Red slash; a press shows the alert mark", face("headset", "HyperX Cloud", "missing")],
		["Step through", "One dot per device, the white one is current", face("microphone", "SoloCast", "active", { dots: { count: 3, active: 0 } })],
		["Name only", "Turn the icon off for a longer name", { kind: "speaker", state: "active", title: "Living room", showIcon: false }],
	];
	const kinds = [
		["speaker", "Speakers"],
		["headphones", "Headphones"],
		["headset", "Headset"],
		["earbuds", "Earbuds"],
		["soundbar", "Soundbar"],
		["monitor", "Monitor"],
		["tv", "TV"],
		["microphone", "Microphone"],
		["webcam", "Webcam"],
		["line", "Line / jack"],
	];
	return page(
		`
		<div style="position:absolute;left:0;right:0;top:62px;text-align:center">
			<h1 style="margin-bottom:10px">A key that shows what is in use</h1>
			<p class="lead" style="margin:0">It follows Windows too. Change the device there and the key updates within two seconds.</p>
		</div>
		<div class="row big">
			${big
				.map(
					([name, text, f]) =>
						`<div class="cell">${key(f, 190)}<div class="caption">${name}</div><div class="sub">${text}</div></div>`,
				)
				.join("")}
		</div>
		<div style="position:absolute;left:0;right:0;top:600px;text-align:center;font-size:27px;font-weight:600">Ten device icons, picked from the device's name and type</div>
		<div class="row small">
			${kinds
				.map(
					([kind, name]) =>
						`<div class="cell">${key({ kind, state: "active", title: "", showIcon: true }, 110)}<div class="sub" style="font-size:17px">${name}</div></div>`,
				)
				.join("")}
		</div>`,
		`.row { position: absolute; left: 0; right: 0; display: flex; justify-content: center; }
		.big { top: 250px; gap: 44px; }
		.big .cell { width: 250px; display: flex; flex-direction: column; align-items: center; gap: 10px; }
		.small { top: 665px; gap: 26px; }
		.small .cell { display: flex; flex-direction: column; align-items: center; gap: 10px; }`,
	);
})();

// 03 — the property inspector, redrawn in the same palette.
const inspector = (() => {
	const check = (on, label, note = "") =>
		`<div class="check"><span class="box${on ? " on" : ""}">${on ? "✓" : ""}</span><span>${label}${note ? ` <i>${note}</i>` : ""}</span></div>`;
	const row = (label, control) => `<div class="irow"><span class="ilabel">${label}</span><div class="icontrol">${control}</div></div>`;
	const select = (text) => `<div class="select">${text}<span>⌄</span></div>`;
	return page(
		`
		<div style="position:absolute;left:190px;top:170px;width:850px">
			<h1>Set up in one panel</h1>
			<p class="lead">Pick the devices, say what a press changes, and choose what the key draws.</p>
			${bullets([
				"The list comes from Windows, and refreshes in the panel",
				"Tick two devices for a toggle, more to step through",
				"Calls and music can follow different keys",
				"A chosen device that is unplugged stays in the list",
			])}
		</div>
		<div style="position:absolute;left:190px;top:690px;display:flex;align-items:center;gap:26px">
			${key(face("headphones", "Headphones", "active", { dots: { count: 3, active: 1 } }), 124)}
			<span style="font-size:22px;color:rgba(255,255,255,.85)">Press, and the key moves to the next device</span>
			<span style="font-size:28px">→</span>
			${key(face("monitor", "Odyssey G85SD", "active", { dots: { count: 3, active: 2 } }), 124)}
		</div>
		<div class="panel">
			<div class="titlebar"><i></i><i></i><i></i><span>Output Device</span></div>
			<div class="body">
				<div class="status"><b>Headphones</b><small>CURRENT OUTPUT</small></div>
				<div class="section">ON PRESS</div>
				${row("Mode", select("Step through devices"))}
				${row("Devices", `<div class="list">${check(true, "Odyssey G85SD")}${check(true, "Headphones")}${check(false, "Speakers")}${check(true, "HyperX Cloud", "not connected")}</div>`)}
				${row("Applies to", select("Everything"))}
				<div class="section">KEY FACE</div>
				${row("Name", select("Automatic"))}
				${row("Icon", select("Automatic"))}
				${row("Show", check(true, "Icon"))}
			</div>
		</div>`,
		`.panel { position: absolute; left: 1230px; top: 90px; width: 450px; border-radius: 14px; overflow: hidden; background: #2d2d2d; box-shadow: 0 30px 70px rgba(0,0,0,.55); }
		.titlebar { height: 34px; display: flex; align-items: center; gap: 7px; padding: 0 14px; background: #1f1f1f; font-size: 14px; color: rgba(255,255,255,.7); }
		.titlebar i { width: 11px; height: 11px; border-radius: 50%; background: #4a4a4a; }
		.titlebar span { margin-left: 8px; }
		.body { padding: 16px 20px 22px; }
		.status { display: flex; flex-direction: column; gap: 3px; padding: 11px 13px; margin-bottom: 18px; background: #272727; border: 1px solid rgba(255,255,255,.1); border-left: 2px solid #55ff7f; border-radius: 5px; }
		.status b { font-size: 15px; font-weight: 600; color: rgba(255,255,255,.9); }
		.status small { font-size: 11px; letter-spacing: .07em; color: rgba(255,255,255,.55); }
		.section { margin: 18px 0 12px; padding-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,.12); font-size: 11px; font-weight: 600; letter-spacing: .09em; color: rgba(255,255,255,.6); }
		.irow { display: flex; align-items: flex-start; gap: 14px; margin: 0 0 11px; font-size: 15px; }
		.ilabel { width: 84px; padding-top: 7px; text-align: right; color: rgba(255,255,255,.6); }
		.icontrol { flex: 1; }
		.select { display: flex; justify-content: space-between; padding: 7px 10px; border-radius: 3px; background: #3a3a3a; color: rgba(255,255,255,.88); }
		.list { display: flex; flex-direction: column; gap: 9px; padding: 6px 0 8px; }
		.check { display: flex; align-items: center; gap: 10px; color: rgba(255,255,255,.88); padding-top: 4px; }
		.check i { font-style: normal; color: rgba(255,255,255,.5); font-size: 13px; }
		.box { width: 17px; height: 17px; border-radius: 3px; border: 1px solid rgba(255,255,255,.45); display: inline-flex; align-items: center; justify-content: center; font-size: 13px; line-height: 1; }
		.box.on { background: #e6e6e6; color: #222; border-color: #e6e6e6; }`,
	);
})();

// 04 — what "applies to" does.
const calls = (() => {
	const columns = [
		["Everything", "Both of Windows' defaults move. This is the default.", face("headset", "Headset", "active")],
		["Apps, games and music", "Only the default device moves. Calls stay where they are.", face("speaker", "Speakers", "active")],
		["Calls only", "Only the communications device moves. Music stays put.", face("headset", "Headset", "active")],
	];
	return page(
		`
		<div style="position:absolute;left:0;right:0;top:100px;text-align:center">
			<h1 style="margin-bottom:12px">Calls and music, kept apart</h1>
			<p class="lead" style="margin:0 auto;max-width:1300px">Windows keeps one default for apps and one for calls. Each key chooses which of them a press changes.</p>
		</div>
		<div class="cols">
			${columns
				.map(
					([name, text, f]) =>
						`<div class="col"><div class="chip">${name}</div>${key(f, 230)}<div class="sub" style="font-size:22px;max-width:360px">${text}</div></div>`,
				)
				.join("")}
		</div>
		<div style="position:absolute;left:0;right:0;top:800px;text-align:center;font-size:25px;color:rgba(255,255,255,.85)">
			One key sends a call to the headset while the music stays on the speakers.
		</div>`,
		`.cols { position: absolute; left: 0; right: 0; top: 310px; display: flex; justify-content: center; gap: 90px; }
		.col { display: flex; flex-direction: column; align-items: center; gap: 24px; }
		.chip { padding: 9px 22px; border-radius: 999px; background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.28); font-size: 23px; font-weight: 600; }`,
	);
})();

const gallery = [
	["01-thumbnail", thumbnail],
	["02-states", states],
	["03-inspector", inspector],
	["04-calls", calls],
];
for (const [name, html] of gallery) {
	shoot(html, 1920, 960, join(store, "gallery", `${name}.png`));
	shoot(html, 1920, 960, join(store, "portfolio", `${name}.png`), { scale: 2 });
}

rmSync(work, { recursive: true, force: true });
