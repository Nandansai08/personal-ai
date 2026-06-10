// MIT License — personal-ai
// Native fetch SSE — Mistral API is OpenAI-compatible but we avoid the openai SDK here
import { eventBus } from '../core/events.js'
import { logger } from '../core/logger.js'
import type {
  LLMProvider, ChatRequest, ChatChunk, ProviderHealth, ModelInfo, ToolDefinition,
} from './interface.js'

const DEFAULT_BASE = 'https://api.mistral.ai/v1'

interface MistralDelta {
  content?: string
  tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>
}
interface MistralChunk {
  choices?: Array<{ delta?: MistralDelta; finish_reason?: string | null }>
  usage?: { prompt_tokens: number; completion_tokens: number }
}

function toOAITools(tools: ToolDefinition[]) {
  return tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }))
}

// fallow-ignore-next-line unused-export
export class MistralProvider implements LLMProvider {
  readonly name             = 'mistral'
  readonly supportsToolUse  = true
  readonly supportsStreaming = true
  readonly model: string

  private apiKey:    string
  private baseURL:   string
  private temperature: number

  constructor() {
    this.apiKey      = process.env['MISTRAL_API_KEY']   ?? ''
    this.baseURL     = process.env['MISTRAL_BASE_URL']  ?? DEFAULT_BASE
    this.model       = process.env['MISTRAL_MODEL']     ?? 'mistral-large-latest'
    this.temperature = parseFloat(process.env['MISTRAL_TEMPERATURE'] ?? '0.7')
  }

  async *chat(request: ChatRequest): AsyncGenerator<ChatChunk> {
    const startMs = Date.now()

    const messages: unknown[] = []
    if (request.systemPrompt) messages.push({ role: 'system', content: request.systemPrompt })
    for (const m of request.messages) {
      messages.push({ role: m.role, content: m.content, ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}) })
    }

    const body: Record<string, unknown> = {
      model:       this.model,
      messages,
      temperature: request.temperature ?? this.temperature,
      stream:      true,
    }
    if (request.tools?.length) body['tools'] = toOAITools(request.tools)

    let res: Response
    try {
      res = await fetch(`${this.baseURL}/chat/completions`, {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
    } catch (err) {
      yield { type: 'error', message: `Mistral connection failed: ${String(err)}` }
      return
    }

    if (!res.ok) {
      yield { type: 'error', message: `Mistral HTTP ${res.status}: ${await res.text()}` }
      return
    }
    if (!res.body) { yield { type: 'error', message: 'No response body' }; return }

    const reader  = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer    = ''
    let inputTokens = 0
    let outputTokens = 0
    const toolArgs: Record<string, string> = {}
    const toolNames: Record<string, string> = {}

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue
          let chunk: MistralChunk
          try { chunk = JSON.parse(data) as MistralChunk } catch { continue }

          if (chunk.usage) {
            inputTokens  = chunk.usage.prompt_tokens
            outputTokens = chunk.usage.completion_tokens
          }

          const choice = chunk.choices?.[0]
          if (!choice) continue
          const delta = choice.delta ?? {}

          if (delta.content) yield { type: 'text', delta: delta.content }

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = '0'
              if (tc.function?.name)      toolNames[idx] = (toolNames[idx] ?? '') + tc.function.name
              if (tc.function?.arguments) toolArgs[idx]  = (toolArgs[idx] ?? '') + tc.function.arguments
            }
          }

          if (choice.finish_reason === 'tool_calls') {
            for (const [idx, name] of Object.entries(toolNames)) {
              const argsRaw = toolArgs[idx] ?? '{}'
              let args: unknown = {}
              try { args = JSON.parse(argsRaw) } catch { args = { raw: argsRaw } }
              yield { type: 'tool_call', id: `mtc_${idx}_${Date.now()}`, name, arguments: args }
            }
          }
        }
      }
    } catch (err) {
      yield { type: 'error', message: `Mistral stream error: ${String(err)}` }
      return
    }

    const latencyMs = Date.now() - startMs
    eventBus.emit('provider_latency', { provider: 'mistral', model: this.model, latencyMs })
    eventBus.emit('tokens_used', { input: inputTokens, output: outputTokens, provider: 'mistral' })
    logger.debug('mistral', `done in ${latencyMs}ms`)
    yield { type: 'done', usage: { input: inputTokens, output: outputTokens } }
  }

  async healthCheck(): Promise<ProviderHealth> {
    const start = Date.now()
    try {
      const res = await fetch(`${this.baseURL}/models`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
      })
      if (!res.ok) return { ok: false, latencyMs: Date.now() - start, model: this.model, error: `HTTP ${res.status}` }
      return { ok: true, latencyMs: Date.now() - start, model: this.model }
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - start, model: this.model, error: String(err) }
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const res  = await fetch(`${this.baseURL}/models`, { headers: { 'Authorization': `Bearer ${this.apiKey}` } })
      if (!res.ok) return []
      const data = await res.json() as { data?: Array<{ id: string }> }
      return (data.data ?? []).map(m => ({ id: m.id, name: m.id, supportsTools: true }))
    } catch { return [] }
  }
}
