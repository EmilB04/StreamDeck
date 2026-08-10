/**
 * Turns an expensive fetch into one that several callers can share.
 *
 * The two exec-based providers each run a command that already returns *every*
 * device it knows about, but they were called once per key: eight keys bound to
 * the same provider meant eight `powershell.exe` processes on every poll tick,
 * all asking the same question. This holds the answer for a moment and hands the
 * same in-flight promise to anyone who asks while it's still running.
 *
 * The same shape as the cache in {@link DeviceDiscovery}, extracted because a
 * second and third copy of it were about to be written.
 */
export function coalesce<T>(fetch: () => Promise<T>, ttlMs: number): () => Promise<T> {
	let cache: { at: number; value: T } | undefined;
	let inflight: Promise<T> | undefined;

	return () => {
		if (cache && Date.now() - cache.at < ttlMs) return Promise.resolve(cache.value);

		inflight ??= fetch()
			.then((value) => {
				cache = { at: Date.now(), value };
				return value;
			})
			.finally(() => {
				inflight = undefined;
			});

		return inflight;
	};
}
