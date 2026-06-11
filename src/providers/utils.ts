// MIT License — personal-ai
import type { Message, ChatChunk, ProviderHealth } from './interface.js'

interface OAIMessage {
  role:          string
  content:       string
  tool_call_id?: string
}

/** Convert internal Message[] to OpenAI-compatible message array. */
export function buildOAIMessages(messages: Message[], systemPrompt?: string): OAIMessage[] {
  const out: OAIMessage[] = []
  if (systemPrompt) out.push({ role: 'system', content: systemPrompt })
  for (const m of messages) {
    if (m.role === 'system') continue
    if (m.role === 'tool') {
      // OpenAI-style APIs reject role:'tool' without a preceding assistant
      // tool_calls message (which we don't thread). Downgrade to user text —
      // the content already carries [TOOL OUTPUT] framing.
      out.push({ role: 'user', content: m.content })
      continue
    }
    out.push({
      role:          m.role,
      content:       m.content,
      ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
    })
  }
  return out
}

/** Yield each newline-delimited text line from a ReadableStream. */
export async function* readStreamLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader  = body.getReader()
  const decoder = new TextDecoder()
  let buffer    = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) yield line
  }
}

/** Wrap a provider health-check probe in the standard start/try/catch/return envelope. */
export async function runHealthCheck(model: string, probe: () => Promise<void>): Promise<ProviderHealth> {
  const start = Date.now()
  try {
    await probe()
    return { ok: true, latencyMs: Date.now() - start, model }
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, model, error: String(err) }
  }
}

/** Flush accumulated streaming tool-call chunks into ChatChunk events. */
export function flushToolCalls(
  toolNames: Record<string, string>,
  toolArgs:  Record<string, string>,
  idPrefix:  string,
): ChatChunk[] {
  return Object.entries(toolNames).map(([idx, name]) => {
    const argsRaw = toolArgs[idx] ?? '{}'
    let args: unknown = {}
    try { args = JSON.parse(argsRaw) } catch { args = { raw: argsRaw } }
    return { type: 'tool_call' as const, id: `${idPrefix}_${idx}_${Date.now()}`, name, arguments: args }
  })
}
