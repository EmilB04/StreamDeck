import type { BatteryStatus, DeviceKind } from "../providers/types";

/** Shape of the battery meter drawn on the key. */
export type BatteryStyle = "bar" | "ring" | "text";

export type FaceColors = {
	low: string;
	medium: string;
	high: string;
	charging: string;
	background: string;
	foreground: string;
};

export type FaceOptions = {
	percent: number | null;
	status: BatteryStatus;
	kind: DeviceKind;
	/** Device name, shown when `showName` is on. */
	name: string;
	style: BatteryStyle;
	showIcon: boolean;
	showPercent: boolean;
	showName: boolean;
	/** At or below this percentage the meter uses `colors.low`. */
	lowThreshold: number;
	/** At or below this percentage the meter uses `colors.medium`. */
	mediumThreshold: number;
	colors: FaceColors;
	/**
	 * Marks the face as "the emptiest of several" rather than one device's own
	 * reading — the two look identical otherwise, and a key that means something
	 * different should say so.
	 */
	lowest?: boolean;
	/**
	 * Charging animation phase, 0..1. Stream Deck rasterises SVG statically, so
	 * SMIL/CSS animation does nothing — movement has to come from the plugin
	 * re-rendering with a new phase. Ignored unless the status is "charging".
	 */
	pulse?: number;
};

export const DEFAULT_COLORS: FaceColors = {
	low: "#e35d5d",
	medium: "#e3b34d",
	high: "#2ecc71",
	charging: "#55ff7f",
	background: "#000000",
	foreground: "#eaeaea",
};

/**
 * Charging colours this plugin has shipped as the default, oldest first: blue,
 * then a muted green. Kept so a key still sitting on one of them can be moved to
 * the current default, while a colour the user picked is left alone.
 */
export const LEGACY_CHARGING_COLORS = ["#3ba7ff", "#3ddc84"];

/** Backgrounds this plugin has shipped as the default, oldest first. */
export const LEGACY_BACKGROUND_COLORS = ["#1e2024"];

const MUTED = "#5a5f66";
/** How far a last-known ("stale") face is faded relative to a live one. */
const STALE_OPACITY = 0.45;
const SIZE = 72;
/** Breathing room between the icon, the meter, the number and the name line. */
const GAP = 6;

const FONT = "Segoe UI, Helvetica, Arial, sans-serif";

/**
 * Rough advance width of a bold Segoe UI digit as a fraction of font size. SVG
 * offers no text metrics, and text that overflows its slot is unreadable rather
 * than merely untidy, so sizes are derived from this estimate.
 */
const CHAR_WIDTH_RATIO = 0.62;

/**
 * Ring geometry. The ring is a gauge around the edge of the key rather than one
 * item in the stack: at 72px there's no way to stack an icon, a ring, a
 * percentage and a name and leave the number legible, but there is room for all
 * of them *inside* a border ring.
 */
const RING_SIZE = 62;
const RING_STROKE = 5;
/** Usable width inside the ring; it's a circle, so don't span the full diameter. */
const RING_INNER_WIDTH = (RING_SIZE - RING_STROKE * 2) * 0.78;
/** Usable width for the other styles, inset from the key edge. */
const FLAT_INNER_WIDTH = 62;

/**
 * Every glyph is drawn on the same 24×24 grid with the same stroke weight, then
 * scaled into whatever slot the layout gives it. Sharing one grid is what makes
 * a keyboard and a phone look like members of one set rather than clip art from
 * different places, and it keeps their optical sizes in step.
 */
const ICON_GRID = 24;
const ICON_STROKE = 2.1;

function fitFontSize(text: string, maxWidth: number, maxFont: number): number {
	const byWidth = maxWidth / (CHAR_WIDTH_RATIO * Math.max(1, text.length));
	return Math.max(8, Math.min(maxFont, byWidth));
}

function truncateToWidth(text: string, maxWidth: number, fontSize: number): string {
	const maxChars = Math.max(3, Math.floor(maxWidth / (CHAR_WIDTH_RATIO * fontSize)));
	return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}

function meterColor(percent: number | null, status: BatteryStatus, options: FaceOptions): string {
	if (status === "mains") return options.colors.foreground;
	if (status === "unsupported" || status === "not-found" || status === "error") return MUTED;
	if (status === "charging") return options.colors.charging;
	if (percent === null) return MUTED;
	// "stale" keeps the threshold colour so the level still reads at a glance; it's
	// the dimming and the offline glyph that say the number isn't live.
	if (percent <= options.lowThreshold) return options.colors.low;
	if (percent <= options.mediumThreshold) return options.colors.medium;
	return options.colors.high;
}

/** Short caption to show when there's no numeric percentage. */
function fallbackLabel(status: BatteryStatus): string {
	if (status === "unsupported") return "N/A";
	if (status === "error") return "ERR";
	return "—"; // not-found / offline
}

/**
 * Mains plug, drawn in place of the meter and the percentage for a device that
 * runs off the cable. A power symbol would read as "on/off"; a plug says where
 * the energy comes from, which is the actual answer.
 */
const PLUG_HEIGHT = 26;

function plugGlyph(y: number, color: string): string {
	const cx = SIZE / 2;
	return `<g transform="translate(${cx} ${(y + PLUG_HEIGHT / 2).toFixed(2)})" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
		<path d="M-7 -13 v6"/>
		<path d="M7 -13 v6"/>
		<path d="M-11 -7 h22 v4 a11 11 0 0 1 -22 0 z"/>
		<path d="M0 4 v9"/>
	</g>`;
}

/** Greedy wrap: fills each line with as many whole words as fit. */
export function wrapWords(words: string[], maxChars: number): string[] {
	const lines: string[] = [];

	for (const word of words) {
		const current = lines[lines.length - 1];
		if (current !== undefined && current.length + 1 + word.length <= maxChars) {
			lines[lines.length - 1] = `${current} ${word}`;
		} else {
			lines.push(word);
		}
	}

	return lines;
}

function escapeXml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

/**
 * Line art for the device's form factor, drawn on the shared 24×24 grid.
 *
 * Each glyph is stroked rather than filled, at one weight, with round caps and
 * joins — small solid shapes are reserved for the details that need to read at
 * ~20px (keycaps, buttons), where a stroked outline would fill in. Everything is
 * built from the silhouette a person would recognise across a desk: a phone is
 * its screen, a mic is its capsule and arc, a speaker is its driver.
 */
function deviceGlyph(kind: DeviceKind, color: string): string {
	const stroke = `fill="none" stroke="${color}" stroke-width="${ICON_STROKE}" stroke-linecap="round" stroke-linejoin="round"`;

	switch (kind) {
		case "headset":
			return `
			<path d="M3.2 15.5 V12 a8.8 8.8 0 0 1 17.6 0 v3.5" ${stroke}/>
			<rect x="1.4" y="13.4" width="5" height="8.4" rx="2.5" ${stroke}/>
			<rect x="17.6" y="13.4" width="5" height="8.4" rx="2.5" ${stroke}/>
			<path d="M18 21.6 q-1.4 2.6 -4.4 2.6" ${stroke}/>
			<circle cx="12.6" cy="24.2" r="1.1" fill="${color}"/>`;
		case "earbuds":
			return `
			<path d="M7.2 3.4 a4.3 4.3 0 0 1 4.3 4.3 v3.6 a4.3 4.3 0 0 1 -8.6 0 V7.7 a4.3 4.3 0 0 1 4.3 -4.3 z" ${stroke}/>
			<path d="M7.2 15.6 V20" ${stroke}/>
			<path d="M16.8 3.4 a4.3 4.3 0 0 1 4.3 4.3 v3.6 a4.3 4.3 0 0 1 -8.6 0 V7.7 a4.3 4.3 0 0 1 4.3 -4.3 z" ${stroke}/>
			<path d="M16.8 15.6 V20" ${stroke}/>`;
		case "mouse":
			return `
			<rect x="6.6" y="1.6" width="10.8" height="20.8" rx="5.4" ${stroke}/>
			<path d="M12 5.4 V9.6" ${stroke}/>`;
		case "keyboard":
			return `
			<rect x="1.3" y="5.4" width="21.4" height="13.2" rx="2.6" ${stroke}/>
			<rect x="4.8" y="9" width="2.6" height="1.9" rx="0.9" fill="${color}"/>
			<rect x="9.1" y="9" width="2.6" height="1.9" rx="0.9" fill="${color}"/>
			<rect x="13.4" y="9" width="2.6" height="1.9" rx="0.9" fill="${color}"/>
			<rect x="17.7" y="9" width="1.9" height="1.9" rx="0.9" fill="${color}"/>
			<rect x="7.4" y="13.4" width="9.2" height="1.9" rx="0.9" fill="${color}"/>`;
		case "gamepad":
			return `
			<path d="M8.4 7.6 h7.2 a6.6 6.6 0 0 1 6.4 8.2 l-0.9 3.6 a2.9 2.9 0 0 1 -5.3 0.8 L14.2 17 H9.8 l-1.6 3.2 a2.9 2.9 0 0 1 -5.3 -0.8 l-0.9 -3.6 A6.6 6.6 0 0 1 8.4 7.6 z" ${stroke}/>
			<path d="M7.2 11.4 v3.2 M5.6 13 h3.2" ${stroke}/>
			<circle cx="16.2" cy="11.8" r="1.2" fill="${color}"/>
			<circle cx="18.6" cy="14.2" r="1.2" fill="${color}"/>`;
		case "phone":
			// The notch is what makes this read as a phone rather than a remote or
			// a battery, and being filled it survives the downscale to ~20px where
			// the hairline earpiece and home indicator it replaces turned to mush.
			return `
			<rect x="6.2" y="1.7" width="11.6" height="20.6" rx="3.6" ${stroke}/>
			<rect x="9.4" y="1.7" width="5.2" height="2" rx="1" fill="${color}"/>`;
		case "tablet":
			return `
			<rect x="3.4" y="2.4" width="17.2" height="19.2" rx="2.6" ${stroke}/>
			<path d="M9.9 18.6 h4.2" ${stroke}/>`;
		case "speaker":
			return `
			<rect x="5.4" y="2.2" width="13.2" height="19.6" rx="3.2" ${stroke}/>
			<circle cx="12" cy="14.6" r="3.6" ${stroke}/>
			<circle cx="12" cy="7" r="1.15" fill="${color}"/>`;
		case "microphone":
			return `
			<rect x="8.9" y="1.5" width="6.2" height="12.2" rx="3.1" ${stroke}/>
			<path d="M5.6 12.2 a6.4 6.4 0 0 0 12.8 0" ${stroke}/>
			<path d="M12 18.6 V22" ${stroke}/>
			<path d="M8.4 22.4 h7.2" ${stroke}/>`;
		case "watch":
			return `
			<rect x="6.2" y="6.2" width="11.6" height="11.6" rx="3.4" ${stroke}/>
			<path d="M9.2 6.2 V2.6 h5.6 v3.6" ${stroke}/>
			<path d="M9.2 17.8 v3.6 h5.6 v-3.6" ${stroke}/>`;
		case "other":
			return `
			<rect x="3.6" y="3.6" width="16.8" height="16.8" rx="4.4" ${stroke}/>
			<circle cx="12" cy="12" r="3.4" ${stroke}/>`;
	}
}

/**
 * Marks the "lowest of several" face: a chevron pointing at the bottom of the
 * pile, in the top left where this plugin keeps its corner markers — the same
 * spot as the charging bolt and the offline glyph.
 *
 * That shared corner is why it yields to the bolt while charging: one marker at
 * a time keeps the corner readable, and a charging device is on its way out of
 * being the problem anyway. The frame still marks a genuinely low one.
 */
function lowestGlyph(color: string, background: string, opacity: number): string {
	// A filled disc first: the chevron sits over the meter, and a bare stroke on
	// top of a coloured bar is hard to pick out. The disc is the key's own
	// background, so it reads as a hole punched in the face rather than a sticker.
	// Tucked into the corner: in "percentage only" style the number runs wide
	// enough that a disc centred any lower would cover the first digit.
	return `<circle cx="11" cy="11" r="10.2" fill="${background}" fill-opacity="${opacity}"/>
	<g fill="none" stroke="${color}" stroke-opacity="${opacity}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
		<path d="M11 6 v9.4"/>
		<path d="M6.8 11.4 L11 15.8 L15.2 11.4"/>
	</g>`;
}

/**
 * Corner marker for a last-known reading: a struck-through circle, in the top
 * left where nothing else in the stack is drawn (the charging bolt owns the top
 * right). Kept at full opacity while the face behind it is faded, so "this is
 * not live" stays legible.
 */
function offlineGlyph(color: string, background: string): string {
	// Same disc as the "lowest" chevron: both are corner markers sitting over the
	// meter, and both need separating from it to be read at a glance.
	return `<circle cx="11" cy="11" r="10.2" fill="${background}"/>
	<g fill="none" stroke="${color}" stroke-opacity="0.75" stroke-width="2" stroke-linecap="round">
		<circle cx="11" cy="11" r="5.5"/>
		<line x1="7.1" y1="14.9" x2="14.9" y2="7.1"/>
	</g>`;
}

/** Horizontal battery outline with a proportional fill. */
function barMeter(
	y: number,
	height: number,
	percent: number | null,
	color: string,
	options: FaceOptions,
	opacity: number,
): string {
	const x = 13;
	const width = 42;
	const pad = 3;
	const clamped = percent === null ? 0 : Math.max(0, Math.min(100, percent));
	const fillWidth = ((width - pad * 2) * clamped) / 100;

	const fill =
		percent !== null
			? `<rect x="${x + pad}" y="${y + pad}" width="${fillWidth.toFixed(2)}" height="${height - pad * 2}" rx="2" fill="${color}" fill-opacity="${opacity}"/>`
			: `<line x1="${x + 12}" y1="${y + 5}" x2="${x + width - 12}" y2="${y + height - 5}" stroke="${color}" stroke-width="3"/>`;

	return `
		<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="4" fill="none" stroke="${options.colors.foreground}" stroke-width="3"/>
		<rect x="${x + width}" y="${y + height * 0.3}" width="4" height="${height * 0.4}" rx="1" fill="${options.colors.foreground}"/>
		${fill}`;
}

/** Donut arc drawn around the edge of the key, behind the stacked content. */
function ringMeter(percent: number | null, color: string, options: FaceOptions, opacity: number): string {
	const radius = RING_SIZE / 2 - RING_STROKE / 2;
	const c = SIZE / 2;
	const circumference = 2 * Math.PI * radius;
	const clamped = percent === null ? 0 : Math.max(0, Math.min(100, percent));
	const arc = (circumference * clamped) / 100;

	const track = `<circle cx="${c}" cy="${c}" r="${radius}" fill="none" stroke="${options.colors.foreground}" stroke-opacity="0.22" stroke-width="${RING_STROKE}"/>`;
	if (percent === null) return track;

	return `${track}<circle cx="${c}" cy="${c}" r="${radius}" fill="none" stroke="${color}" stroke-opacity="${opacity}" stroke-width="${RING_STROKE}" stroke-linecap="round" stroke-dasharray="${arc.toFixed(2)} ${(circumference - arc).toFixed(2)}" transform="rotate(-90 ${c} ${c})"/>`;
}

type Block = { height: number; render: (y: number) => string };

/**
 * A short message on the key, for something the user needs told right now — a
 * press on a device that isn't there. Stream Deck has no toast or tooltip a
 * plugin can raise, so the key itself has to carry the words; the caller puts
 * the normal face back afterwards.
 *
 * The text is sized so its longest word fits the key, then wrapped greedily at
 * that size — at 72px that's a dozen characters a line.
 */
export function noticeKeyImage(message: string, colors: FaceColors): string {
	const words = message.split(/\s+/).filter(Boolean);
	const longest = words.reduce((max, word) => Math.max(max, word.length), 1);
	const fontSize = Math.max(8, Math.min(13, FLAT_INNER_WIDTH / (CHAR_WIDTH_RATIO * longest)));
	const lines = wrapWords(words, Math.floor(FLAT_INNER_WIDTH / (CHAR_WIDTH_RATIO * fontSize)));

	const lineHeight = fontSize * 1.25;
	const triangle = 15;
	const gap = 5;
	const total = triangle + gap + lines.length * lineHeight;
	let cursor = (SIZE - total) / 2;

	const warning = `<g transform="translate(${SIZE / 2} ${(cursor + triangle / 2).toFixed(2)})">
		<path d="M0 -8 L9 8 H-9 Z" fill="none" stroke="${colors.medium}" stroke-width="2.5" stroke-linejoin="round"/>
		<line x1="0" y1="-3" x2="0" y2="3" stroke="${colors.medium}" stroke-width="2.5" stroke-linecap="round"/>
		<circle cx="0" cy="6" r="1.2" fill="${colors.medium}"/>
	</g>`;

	cursor += triangle + gap;
	const text = lines
		.map((line, i) => {
			const y = cursor + (i + 1) * lineHeight - lineHeight * 0.3;
			return `<text x="${SIZE / 2}" y="${y.toFixed(2)}" text-anchor="middle" font-family="${FONT}" font-size="${fontSize.toFixed(1)}" font-weight="600" fill="${colors.foreground}">${escapeXml(line)}</text>`;
		})
		.join("");

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
		<rect width="${SIZE}" height="${SIZE}" fill="${colors.background}"/>
		${warning}
		${text}
	</svg>`;

	return `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}

/**
 * Face for the renaming key: a luggage-tag glyph over "renamed / detected".
 *
 * It shows counts rather than a device because it isn't about one device — the
 * useful thing at a glance is whether any names are in force at all.
 */
export function renameKeyImage(renamed: number, detected: number, colors: FaceColors): string {
	const accent = renamed > 0 ? colors.high : colors.foreground;

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
		<rect width="${SIZE}" height="${SIZE}" fill="${colors.background}"/>
		<g transform="translate(24 12) scale(1)" fill="none" stroke="${accent}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
			<path d="M11.4 1.6 H21 a1.4 1.4 0 0 1 1.4 1.4 v9.6 a1.4 1.4 0 0 1 -0.4 1 l-8.6 8.6 a1.4 1.4 0 0 1 -2 0 L2.4 13.6 a1.4 1.4 0 0 1 0 -2 l8.6 -8.6 a1.4 1.4 0 0 1 0.4 -1.4 z"/>
			<circle cx="17.4" cy="6.6" r="1.6"/>
		</g>
		<text x="${SIZE / 2}" y="52" text-anchor="middle" font-family="${FONT}" font-size="15" font-weight="700" fill="${accent}">${renamed}</text>
		<text x="${SIZE / 2}" y="65" text-anchor="middle" font-family="${FONT}" font-size="10" fill="${colors.foreground}" fill-opacity="0.75">of ${detected}</text>
	</svg>`;

	return `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}

/**
 * Renders the key face as an SVG data URI, which is what setImage expects — a
 * bare <svg> string is silently ignored by Stream Deck and the key keeps its
 * manifest image.
 *
 * Elements stack vertically and are centred as a group, so turning the icon or
 * the name off re-balances the rest instead of leaving a hole. In ring style the
 * ring sits around the edge and the stack renders inside it.
 */
export function batteryKeyImage(options: FaceOptions): string {
	const { percent, status, style, colors } = options;
	const color = meterColor(percent, status, options);
	const label = percent === null ? fallbackLabel(status) : `${percent}%`;

	const isRing = style === "ring";
	const gap = isRing ? 4 : GAP;
	const innerWidth = isRing ? RING_INNER_WIDTH : FLAT_INNER_WIDTH;

	// A small, slow opacity swing reads as "active" without flickering.
	const opacity = status === "charging" ? 0.78 + 0.22 * (options.pulse ?? 1) : 1;

	const blocks: Block[] = [];

	if (options.showIcon) {
		const height = isRing ? 17 : 21;
		const scale = height / ICON_GRID;
		blocks.push({
			height,
			render: (y) =>
				`<g transform="translate(${((SIZE - ICON_GRID * scale) / 2).toFixed(2)} ${y.toFixed(2)}) scale(${scale.toFixed(3)})">${deviceGlyph(options.kind, colors.foreground)}</g>`,
		});
	}

	// A mains device has no level to draw, so the plug takes the place of both the
	// meter and the percentage rather than sitting alongside an empty one.
	const isMains = status === "mains";

	if (isMains) {
		blocks.push({ height: PLUG_HEIGHT, render: (y) => plugGlyph(y, color) });
	}

	if (style === "bar" && !isMains) {
		const height = 16;
		blocks.push({ height, render: (y) => barMeter(y, height, percent, color, options, opacity) });
	}

	if (options.showPercent && !isMains) {
		// Size from the worst case ("100%") rather than the current value, so the
		// layout doesn't jump when the reading crosses 100 or drops to a dash.
		const maxFont = style === "text" ? 30 : 18;
		const fontSize = fitFontSize("100%", innerWidth, maxFont);
		const height = fontSize;
		blocks.push({
			height,
			render: (y) =>
				`<text x="${SIZE / 2}" y="${(y + height * 0.82).toFixed(2)}" text-anchor="middle" font-family="${FONT}" font-size="${fontSize.toFixed(1)}" font-weight="700" fill="${color}" fill-opacity="${opacity}">${label}</text>`,
		});
	}

	if (options.showName) {
		const fontSize = isRing ? 9 : 10;
		const height = fontSize;
		const short = escapeXml(truncateToWidth(options.name, innerWidth, fontSize));
		blocks.push({
			height,
			render: (y) =>
				`<text x="${SIZE / 2}" y="${(y + height * 0.85).toFixed(2)}" text-anchor="middle" font-family="${FONT}" font-size="${fontSize}" fill="${colors.foreground}" fill-opacity="0.8">${short}</text>`,
		});
	}

	// Enabling everything can ask for more height than the key has (and in ring
	// style, more than the ring's inner circle). Close the gaps first, then scale
	// the whole stack down uniformly, so the layout degrades in proportion rather
	// than spilling over the edge.
	// Inside the ring the usable height is less than the inner diameter: a line
	// of text near the top or bottom of a circle has far less width than one
	// across its middle, so the stack is kept to the band where it fits.
	const available = isRing ? (RING_SIZE - RING_STROKE * 2) * 0.8 : SIZE - 4;
	const content = blocks.reduce((sum, b) => sum + b.height, 0);
	const gaps = Math.max(0, blocks.length - 1);

	let spacing = gap;
	if (content + spacing * gaps > available && gaps > 0) {
		spacing = Math.max(1, (available - content) / gaps);
	}

	const total = content + spacing * gaps;
	const scale = total > available ? available / total : 1;

	let cursor = (SIZE - total) / 2;
	const stack = blocks
		.map((block) => {
			const rendered = block.render(cursor);
			cursor += block.height + spacing;
			return rendered;
		})
		.join("");

	const scaledStack =
		scale === 1
			? stack
			: `<g transform="translate(${SIZE / 2} ${SIZE / 2}) scale(${scale.toFixed(3)}) translate(${-SIZE / 2} ${-SIZE / 2})">${stack}</g>`;

	const ring = isRing ? ringMeter(percent, color, options, opacity) : "";

	// A last-known reading is faded as a whole — outline and icon included — so it
	// can't be mistaken for a live one, and marked with a "disconnected" glyph.
	const face =
		status === "stale"
			? `<g opacity="${STALE_OPACITY}">${ring}${scaledStack}</g>${offlineGlyph(colors.foreground, colors.background)}`
			: `${ring}${scaledStack}`;

	// A frame in the meter's colour turns the whole key into the warning when the
	// lowest device is actually low, rather than leaving a small number to be
	// noticed among five healthy keys.
	const frame =
		options.lowest && percent !== null && percent <= options.lowThreshold
			? `<rect x="1.5" y="1.5" width="${SIZE - 3}" height="${SIZE - 3}" rx="7" fill="none" stroke="${color}" stroke-width="3"/>`
			: "";

	const lowestMark =
		options.lowest && status !== "not-found" && status !== "charging"
			? lowestGlyph(color, colors.background, opacity)
			: "";

	// The bolt marks charging even when the colour is close to the "high" colour.
	// Top left, the same corner the offline glyph uses — a device can't be both
	// charging and gone, so they never collide.
	const bolt =
		status === "charging"
			? `<path d="M12 6 l-7 12 h5 l-4 10 11 -14 h-5 z" fill="${colors.charging}" fill-opacity="${opacity}" stroke="${colors.background}" stroke-width="1"/>`
			: "";

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
		<rect width="${SIZE}" height="${SIZE}" fill="${colors.background}"/>
		${face}
		${frame}
		${lowestMark}
		${bolt}
	</svg>`;

	return `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}
