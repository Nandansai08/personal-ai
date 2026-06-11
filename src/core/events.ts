// MIT License — personal-ai

/** All observable events emitted across the system. */
export type EventMap = {
  'user_message':     { content: string; length: number }
  'model_selected':   { model: string; task: string; reason: string }
  'tool_called':      { name: string; args: unknown; durationMs: number }
  'tool_result':      { name: string; success: boolean; resultSize: number }
  'memory_saved':     { type: string; importance: number }
  'memory_retrieved': { query: string; count: number }
  'provider_latency': { provider: string; model: string; latencyMs: number }
  'tokens_used':      { input: number; output: number; provider: string }
  'error':            { context: string; message: string; stack?: string }
  'session_started':  { provider: string; model: string }
  'session_ended':    { messageCount: number; toolCallCount: number }
}

type AnyHandler = (data: unknown) => void
type Handlers = Map<string, AnyHandler[]>

class EventBus {
  private handlers: Handlers = new Map()

  /**
   * Subscribe to an event. Returns an unsubscribe function.
   */
  on<K extends keyof EventMap>(event: K, handler: (data: EventMap[K]) => void): () => void {
    if (!this.handlers.has(event)) this.handlers.set(event, [])
    const erased = handler as AnyHandler  // type erased for storage; emit() restores K
    this.handlers.get(event)!.push(erased)
    return () => {
      const list = this.handlers.get(event)
      if (list) {
        const idx = list.indexOf(erased)
        if (idx !== -1) list.splice(idx, 1)
      }
    }
  }

  /**
   * Emit an event to all subscribers. Handler errors are caught and logged — never throw.
   */
  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    const list = this.handlers.get(event) ?? []
    for (const h of list) {
      try {
         
        (h as (d: EventMap[K]) => void)(data)
      } catch (err) {
        console.error(`[EventBus] handler error on "${event}":`, err)
      }
    }
  }

  /**
   * Subscribe to an event exactly once.
   */
  once<K extends keyof EventMap>(event: K, handler: (data: EventMap[K]) => void): void {
    const unsub = this.on(event, (data) => {
      unsub()
      handler(data)
    })
  }
}

export const eventBus = new EventBus()
