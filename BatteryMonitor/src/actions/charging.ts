/**
 * Guessing whether a device is on a charger, for providers that can't say.
 *
 * The Windows PnP battery property — which is how a phone or a plain Bluetooth
 * peripheral reports — carries a percentage and nothing else, so a handset on a
 * cable looks exactly like one in a pocket. The one thing that can't happen off
 * a charger is the level going *up*, so that's the whole signal.
 *
 * Kept apart from the action because it's the only interesting decision in the
 * charging story, and testing it through a Stream Deck key would mean standing
 * up the whole plugin to assert on a boolean.
 */

/**
 * How long a level may hold below 100% before the guess is dropped.
 *
 * A charger keeps nudging the level up every few minutes; something unplugged
 * just holds wherever it stopped. Past a real charge's cadence, a hold looks
 * like a phone back in a pocket rather than one still on the cable.
 */
export const CHARGE_HOLD_MS = 20 * 60_000;

/** What the key remembers between polls to keep the guess going. */
export type ChargeGuess = {
	/** Device this guess is about, so re-pointing the key discards it. */
	deviceKey?: string;
	/** Whether the level was last seen rising. */
	rising: boolean;
	/** When it last rose, which is what times the guess out. */
	risingSince?: number;
};

/**
 * Folds a new reading into the guess.
 *
 * Rising means charging. A drop means it isn't. A level that merely *holds*
 * keeps the guess — but only at 100%, where holding is what a full battery on a
 * charger does, or for {@link CHARGE_HOLD_MS} below that, after which a hold is
 * better explained by the cable having been pulled out.
 *
 * Returns a fresh object rather than mutating, so a caller can't half-apply it.
 */
export function nextChargeGuess(
	guess: ChargeGuess,
	previousPercent: number | undefined,
	percent: number,
	now: number,
): ChargeGuess {
	let { rising, risingSince } = guess;

	if (previousPercent !== undefined) {
		if (percent > previousPercent) {
			rising = true;
			risingSince = now;
		} else if (percent < previousPercent) {
			return { ...guess, rising: false, risingSince: undefined };
		}
	}

	if (!rising) return { ...guess, rising: false, risingSince: undefined };

	// A full battery sitting on a charger holds indefinitely and is still
	// charging; below full, a hold that outlasts the window is an unplugged one.
	if (percent < 100 && risingSince !== undefined && now - risingSince > CHARGE_HOLD_MS) {
		return { ...guess, rising: false, risingSince: undefined };
	}

	return { ...guess, rising, risingSince };
}
