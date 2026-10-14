/** Bound network work even if an upstream client retries or ignores abort. */
export async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([work, new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error('Service response timed out')), ms) })])
  } finally { if (timer) clearTimeout(timer) }
}
export function timeoutFetch(ms: number, send: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController()
    const original = init?.signal ?? (input instanceof Request ? input.signal : null)
    const signal = original ? AbortSignal.any([original, controller.signal]) : controller.signal
    try { return await withTimeout(send(input, { ...init, signal }), ms) }
    catch (error) { controller.abort(); throw error }
  }
}
