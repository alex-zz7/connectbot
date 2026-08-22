export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Poll `fn` until it returns a truthy value, the deadline, or the request aborts. */
export async function waitUntil<T>(
  fn: () => Promise<T | null | undefined | false>,
  opts: { ms?: number; interval?: number; signal?: AbortSignal } = {},
): Promise<T | null> {
  const deadline = Date.now() + (opts.ms ?? 18_000);
  const interval = opts.interval ?? 700;
  while (Date.now() < deadline) {
    if (opts.signal?.aborted) return null;
    const value = await fn();
    if (value) return value;
    const left = deadline - Date.now();
    if (left <= 0) break;
    await sleep(Math.min(interval, left));
  }
  return null;
}
