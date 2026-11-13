import type { DeviceKind } from "../audio/device-kind";

/**
 * What a key shows.
 *
 *  - active:   the key's device is the default right now
 *  - inactive: it isn't
 *  - missing:  the key's device isn't connected
 *  - empty:    nothing has been chosen yet
 */
export type KeyFace = {
	kind: DeviceKind;
	state: "active" | "inactive" | "missing" | "empty";
	/** Text under the glyph; empty for none. */
	title: string;
	showIcon: boolean;
	/** For a key that steps through devices: how many, and which is current (-1 for none of them). */
	dots?: { count: number; active: number };
};

const SIZE = 144;
const BACKGROUND = "#000000";
const BRIGHT = "#eaeaea";
const DIM = "#7d828b";
const WARN = "#e35d5d";

/** Same stack the property inspector uses, so a name looks the same in both places. */
const FONT = "Segoe UI, Arial, Helvetica, sans-serif";

/**
 * Drawn in a 48x48 box. `COLOR` is replaced with the real colour when a glyph
 * is drawn, and every element carries its own fill and stroke. `currentColor`
 * and attributes inherited from a group would be tidier, but not every SVG
 * renderer honours them, and a shape that silently isn't drawn is a wrong key.
 */
const STROKE = 'fill="none" stroke="COLOR" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"';

/** An outline. */
const line = (d: string): string => `<path d="${d}" ${STROKE}/>`;
/** A solid shape. */
const solid = (shape: string): string => shape.replace("/>", ' fill="COLOR"/>');

const HEADPHONES =
	line("M9 29v-5a15 15 0 0 1 30 0v5") +
	solid('<rect x="6" y="27" width="10" height="15" rx="3"/>') +
	solid('<rect x="32" y="27" width="10" height="15" rx="3"/>');

const GLYPHS: Record<DeviceKind, string> = {
	speaker:
		solid('<path d="M6 18h9l12-10v32l-12-10H6z"/>') +
		line("M33 17a10 10 0 0 1 0 14") +
		line("M38 10.5a18.5 18.5 0 0 1 0 27"),
	headphones: HEADPHONES,
	headset: HEADPHONES + line("M37 42v1a4 4 0 0 1-4 4h-6") + solid('<circle cx="24" cy="47" r="2.5"/>'),
	earbuds:
		solid('<circle cx="13" cy="16" r="7"/>') +
		line("M19 20v19") +
		solid('<circle cx="35" cy="16" r="7"/>') +
		line("M29 20v19"),
	soundbar:
		line("M7 17h34a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-8a3 3 0 0 1 3-3z") +
		solid('<circle cx="13" cy="24" r="3"/>') +
		solid('<circle cx="35" cy="24" r="3"/>'),
	monitor: line("M7 7h34a3 3 0 0 1 3 3v21a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V10a3 3 0 0 1 3-3z") + line("M24 34v7M15 42h18"),
	tv: line("M7 8h34a3 3 0 0 1 3 3v22a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V11a3 3 0 0 1 3-3z") + line("M13 42l3-6M35 42l-3-6"),
	microphone:
		solid('<rect x="17" y="4" width="14" height="25" rx="7"/>') +
		line("M10 23a14 14 0 0 0 28 0") +
		line("M24 37v7M16 44h16"),
	webcam:
		line("M24 6a14 14 0 1 0 0 28a14 14 0 1 0 0-28z") +
		solid('<circle cx="24" cy="20" r="6"/>') +
		line("M24 34v7M14 42h20"),
	line:
		solid('<rect x="17" y="4" width="14" height="10" rx="2"/>') +
		solid('<rect x="20" y="16" width="8" height="8" rx="1"/>') +
		line("M24 26v9a6 6 0 0 0 6 6h8"),
};

export function escapeXml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

/**
 * Breaks a name into lines that fit the key.
 *
 * By character count, since nothing here can measure text; the limits are set
 * for the worst case of wide capitals. A name that still doesn't fit ends in an
 * ellipsis, so a cut is visibly a cut and not a different device's name.
 */
export function wrapTitle(text: string, maxChars: number, maxLines: number): string[] {
	const words = text.trim().split(/\s+/).filter(Boolean);
	const lines: string[] = [];
	let line = "";

	const push = (): void => {
		if (line) lines.push(line);
		line = "";
	};

	for (let word of words) {
		// A single word wider than the key is split, since there's no space to break at.
		while (word.length > maxChars) {
			if (line) push();
			lines.push(word.slice(0, maxChars));
			word = word.slice(maxChars);
		}
		if (!word) continue;

		if (!line) line = word;
		else if (line.length + 1 + word.length <= maxChars) line += ` ${word}`;
		else {
			push();
			line = word;
		}
	}
	push();

	if (lines.length <= maxLines) return lines;

	const kept = lines.slice(0, maxLines);
	const last = kept[maxLines - 1];
	kept[maxLines - 1] = `${last.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
	return kept;
}

/**
 * Names are wrapped to this many characters, and a line that uses the last two
 * is set smaller to make room. Wrapping at the comfortable width instead split
 * a thirteen-letter word across two lines for the sake of one letter.
 */
const WIDE_LINE = 14;
const COMFORTABLE_LINE = 12;

function fitFont(lines: string[], normal: number): number {
	return lines.some((line) => line.length > COMFORTABLE_LINE) ? 16 : normal;
}

function glyph(kind: DeviceKind, centerY: number, scale: number, color: string, struck: boolean): string {
	const offsetX = SIZE / 2 - 24 * scale;
	const offsetY = centerY - 24 * scale;
	// The slash is drawn twice, the wider pass in the background colour, so it
	// reads as crossing the glyph rather than merging into it.
	const slash = struck
		? `<path d="M7 5l34 38" fill="none" stroke="${BACKGROUND}" stroke-width="9" stroke-linecap="round"/>` +
			`<path d="M7 5l34 38" fill="none" stroke="${WARN}" stroke-width="4" stroke-linecap="round"/>`
		: "";
	return (
		`<g transform="translate(${offsetX} ${offsetY}) scale(${scale})">` +
		`${GLYPHS[kind].replace(/COLOR/g, color)}${slash}</g>`
	);
}

function dotsRow(dots: { count: number; active: number }, y: number): string {
	// Past this many the row would run off the key; the name still says where you are.
	const count = Math.min(dots.count, 8);
	if (count < 2) return "";

	const gap = 14;
	const startX = SIZE / 2 - ((count - 1) * gap) / 2;
	let out = "";
	for (let i = 0; i < count; i++) {
		const on = i === dots.active;
		out += `<circle cx="${startX + i * gap}" cy="${y}" r="${on ? 4.5 : 3.5}" fill="${on ? BRIGHT : "#3a3d43"}"/>`;
	}
	return out;
}

/** The key as SVG markup. */
export function keySvg(face: KeyFace): string {
	const lit = face.state === "active";
	const glyphColor = lit ? BRIGHT : DIM;
	const textColor = lit ? BRIGHT : DIM;
	const title = face.title || (face.state === "missing" ? "Not connected" : "");
	const hasDots = !!face.dots && face.dots.count >= 2;

	let body = "";
	let lines: string[];
	let fontSize: number;
	let firstBaseline: number;
	let lineHeight: number;

	if (face.showIcon) {
		lines = wrapTitle(title, WIDE_LINE, 2);
		fontSize = fitFont(lines, 20);
		lineHeight = 22;
		// With nothing to read, the glyph is the whole face and takes the middle.
		const centerY = lines.length === 0 ? (hasDots ? 62 : 72) : lines.length === 1 ? 50 : 42;
		const scale = lines.length === 0 ? 1.7 : 1.15;
		body += glyph(face.kind, centerY, scale, glyphColor, face.state === "missing");
		firstBaseline = lines.length === 1 ? 108 : 94;
	} else {
		lines = wrapTitle(title, WIDE_LINE, 3);
		fontSize = fitFont(lines, 22);
		lineHeight = 26;
		const middle = hasDots ? 64 : 72;
		firstBaseline = middle - ((lines.length - 1) * lineHeight) / 2 + fontSize * 0.35;
	}

	lines.forEach((line, i) => {
		body +=
			`<text x="${SIZE / 2}" y="${firstBaseline + i * lineHeight}" text-anchor="middle" font-family="${FONT}" ` +
			`font-size="${fontSize}" font-weight="600" fill="${textColor}">${escapeXml(line)}</text>`;
	});

	if (face.dots) body += dotsRow(face.dots, 134);

	return (
		`<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">` +
		`<rect width="${SIZE}" height="${SIZE}" fill="${BACKGROUND}"/>${body}</svg>`
	);
}

/** The key as something `setImage` takes. */
export function keyImage(face: KeyFace): string {
	return `data:image/svg+xml;charset=utf8,${encodeURIComponent(keySvg(face))}`;
}
