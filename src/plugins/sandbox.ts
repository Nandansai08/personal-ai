// MIT License — personal-ai
// Error boundary for plugin code: plugins must never crash PersonalAI.
// Every plugin call is wrapped in a timeout and a catch; failures are
// returned as values.

import { logger } from '../core/logger.js'

export const HOOK_TIMEOUT_MS = 2_000
export const LIFECYCLE_TIMEOUT_MS = 5_000

export type SandboxResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string }

/**
 * Run a plugin-supplied async function with a timeout and error boundary.
 * Never throws. Timeouts and exceptions come back as `{ ok: false }`.
 */
export async function sandboxed<T>(
  pluginName: string,
  what: string,
  fn: () => Promise<T>,
  timeoutMs = HOOK_TIMEOUT_MS,
): Promise<SandboxResult<T>> {
  let timer: NodeJS.Timeout | undefined
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs)
      timer.unref?.()
    })
    const value = await Promise.race([fn(), timeout])
    return { ok: true, value }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    logger.warn('plugins', `${pluginName}.${what} failed: ${error}`)
    return { ok: false, error }
  } finally {
    if (timer) clearTimeout(timer)
  }
}
