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
	charging: "#3ddc84",
	background: "#1e2024",
	foreground: "#eaeaea",
};

/** The blue this plugin used to ship as the charging colour, kept for migration. */
export const LEGACY_CHARGING_COLOR = "#3ba7ff";

const MUTED = "#5a5f66";
const SIZE = 72;
const GAP = 4;

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

/** Vertical extent of each icon glyph in its own drawing coordinates. */
const ICON_BOX: Record<DeviceKind, { top: number; height: number }> = {
	headset: { top: 11, height: 22 },
	mouse: { top: 3, height: 25 },
	keyboard: { top: 8, height: 20 },
	gamepad: { top: 10, height: 20 },
	other: { top: 5, height: 24 },
};

function fitFontSize(text: string, maxWidth: number, maxFont: number): number {
	const byWidth = maxWidth / (CHAR_WIDTH_RATIO * Math.max(1, text.length));
	return Math.max(8, Math.min(maxFont, byWidth));
}

function truncateToWidth(text: string, maxWidth: number, fontSize: number): string {
	const maxChars = Math.max(3, Math.floor(maxWidth / (CHAR_WIDTH_RATIO * fontSize)));
	return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}

function meterColor(percent: number | null, status: BatteryStatus, options: FaceOptions): string {
	if (status === "unsupported" || status === "not-found" || status === "error") return MUTED;
	if (status === "charging") return options.colors.charging;
	if (percent === null) return MUTED;
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

function escapeXml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

/**
 * Line-art glyph for the device's form factor. Drawn at its natural position;
 * callers translate (and for the ring, scale) it into the slot the layout gave it.
 */
function deviceIcon(kind: DeviceKind, color: string): string {
	switch (kind) {
		case "headset":
			return `
			<path d="M23 26 v-4 a13 11 0 0 1 26 0 v4" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
			<rect x="19" y="22" width="7" height="10" rx="3" fill="${color}"/>
			<rect x="46" y="22" width="7" height="10" rx="3" fill="${color}"/>
			<path d="M47 27 q-3 5 -8 5" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
			<circle cx="38" cy="32" r="1.6" fill="${color}"/>`;
		case "mouse":
			return `
			<rect x="27" y="3" width="18" height="25" rx="9" fill="none" stroke="${color}" stroke-width="2.5"/>
			<line x1="36" y1="4" x2="36" y2="14" stroke="${color}" stroke-width="2"/>
			<rect x="34" y="7" width="4" height="6" rx="2" fill="${color}"/>`;
		case "keyboard":
			return `
			<rect x="13" y="8" width="46" height="20" rx="3" fill="none" stroke="${color}" stroke-width="2.5"/>
			<rect x="18" y="13" width="5" height="3" rx="1" fill="${color}"/>
			<rect x="27" y="13" width="5" height="3" rx="1" fill="${color}"/>
			<rect x="36" y="13" width="5" height="3" rx="1" fill="${color}"/>
			<rect x="45" y="13" width="5" height="3" rx="1" fill="${color}"/>
			<rect x="24" y="20" width="24" height="3" rx="1.5" fill="${color}"/>`;
		case "gamepad":
			return `
			<path d="M22 10 h28 a10 10 0 0 1 9 12 l-2 7 a5 5 0 0 1 -9 1 l-3 -5 h-18 l-3 5 a5 5 0 0 1 -9 -1 l-2 -7 a10 10 0 0 1 9 -12 z" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>
			<line x1="23" y1="16" x2="23" y2="22" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
			<line x1="20" y1="19" x2="26" y2="19" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
			<circle cx="47" cy="17" r="2" fill="${color}"/>
			<circle cx="52" cy="21" r="2" fill="${color}"/>`;
		case "other":
			return `
			<rect x="24" y="5" width="24" height="24" rx="5" fill="none" stroke="${color}" stroke-width="2.5"/>
			<circle cx="36" cy="17" r="4" fill="none" stroke="${color}" stroke-width="2.5"/>
			<line x1="36" y1="5" x2="36" y2="9" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>`;
	}
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
	const gap = isRing ? 3 : GAP;
	const iconScale = isRing ? 0.7 : 1;
	const innerWidth = isRing ? RING_INNER_WIDTH : FLAT_INNER_WIDTH;

	// A small, slow opacity swing reads as "active" without flickering.
	const opacity = status === "charging" ? 0.78 + 0.22 * (options.pulse ?? 1) : 1;

	const blocks: Block[] = [];

	if (options.showIcon) {
		const box = ICON_BOX[options.kind];
		blocks.push({
			height: box.height * iconScale,
			render: (y) =>
				`<g transform="translate(${((SIZE / 2) * (1 - iconScale)).toFixed(2)} ${(y - box.top * iconScale).toFixed(2)}) scale(${iconScale})">${deviceIcon(options.kind, colors.foreground)}</g>`,
		});
	}

	if (style === "bar") {
		const height = 16;
		blocks.push({ height, render: (y) => barMeter(y, height, percent, color, options, opacity) });
	}

	if (options.showPercent) {
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
	const available = isRing ? RING_SIZE - RING_STROKE * 2 - 2 : SIZE - 4;
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

	// The bolt marks charging even when the colour is close to the "high" colour.
	const bolt =
		status === "charging"
			? `<path d="M62 6 l-7 12 h5 l-4 10 11 -14 h-5 z" fill="${colors.charging}" fill-opacity="${opacity}" stroke="${colors.background}" stroke-width="1"/>`
			: "";

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
		<rect width="${SIZE}" height="${SIZE}" fill="${colors.background}"/>
		${ring}
		${scaledStack}
		${bolt}
	</svg>`;

	return `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}
