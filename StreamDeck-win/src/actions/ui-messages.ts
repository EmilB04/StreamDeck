import streamDeck from "@elgato/streamdeck";

/**
 * The contract between the plugin and its property inspectors.
 *
 * The panels are plain HTML with inline JavaScript, so nothing here can be
 * enforced across the wire — but naming both directions in one place means the
 * three actions can't drift from each other, and a mistyped event name is a
 * compile error on this side rather than a handler that silently never runs.
 *
 * Keep in step with the `send({ event: … })` calls in
 * `com.emilberglund.batterymonitor.sdPlugin/ui/*.html`.
 */

/** Everything a panel can ask for. */
export type UiEvent =
	"getStatus" | "getApps" | "getDevices" | "getHeadsetTool" | "openHeadsetTool" | "shareAppearance" | "clearRenames";

/**
 * What arrives from a panel. `event` stays optional because the payload is
 * whatever the panel actually sent — an older or hand-edited one may send
 * nothing recognisable, and that has to be a miss rather than a crash.
 */
export type UiMessage = {
	event?: UiEvent;
	/** Set by the panel's refresh button, to force a rescan rather than reuse the cache. */
	isRefresh?: boolean;
};

/**
 * How a status line is coloured in the panel. Written to `data-state` and
 * styled from `inspector.css`, so these names are a shared vocabulary with the
 * stylesheet, not just with the HTML.
 */
export type StatusTone = "ok" | "idle" | "charging" | "offline";

/** The status strip at the top of a panel; null while the key hasn't drawn yet. */
export type UiStatus = {
	label: string;
	percent: number | null;
	state: string;
	tone: StatusTone;
};

/** One entry in a panel's device or application dropdown. */
export type UiItem = { label: string; value: string };

/** What the plugin sends back, keyed by the event it answers. */
export type UiReply =
	| { event: "getStatus"; status: UiStatus | null }
	| { event: "getApps"; items: UiItem[] }
	| { event: "getDevices"; items: UiItem[]; renames?: Record<string, string> }
	| { event: "getHeadsetTool"; installed: boolean; binary: string | null };

/**
 * Replies to the open panel. Everything goes out through here so a payload has
 * to match {@link UiReply} — the shapes were previously written inline at each
 * call site, which let the same event answer differently from two actions.
 */
export function replyToPanel(reply: UiReply): Promise<void> {
	return streamDeck.ui.sendToPropertyInspector(reply);
}
