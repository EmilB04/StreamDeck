import streamDeck from "@elgato/streamdeck";
import type { PickerItem } from "./switching";

/**
 * The contract between the plugin and its property inspectors.
 *
 * The panels are plain HTML with inline JavaScript, so nothing here is enforced
 * across the wire, but naming both directions in one place makes a mistyped
 * event a compile error on this side rather than a handler that never runs.
 *
 * Keep in step with `com.emilberglund.audioswitch.sdPlugin/ui/*.html`.
 */

/** Everything a panel can ask for. */
export type UiEvent = "getDevices" | "getStatus";

/** What arrives from a panel. Optional throughout: it is whatever the panel actually sent. */
export type UiMessage = {
	event?: UiEvent;
	/** Set by a picker's refresh button. */
	isRefresh?: boolean;
};

/** What Windows is using right now, for the strip at the top of a panel. */
export type UiStatus = {
	/** Full name of the default device, or null when there is none. */
	defaultName: string | null;
	/** Full name of the communications default, or null when there is none. */
	communicationsName: string | null;
};

export type UiReply = { event: "getDevices"; items: PickerItem[] } | { event: "getStatus"; status: UiStatus | null };

/** Replies to the open panel. Everything goes out through here so a payload has to match {@link UiReply}. */
export function replyToPanel(reply: UiReply): Promise<void> {
	return streamDeck.ui.sendToPropertyInspector(reply);
}
