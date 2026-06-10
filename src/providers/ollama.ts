// MIT License — personal-ai
import { eventBus } from '../core/events.js'
import { logger } from '../core/logger.js'
import type {
  LLMProvider, ChatRequest, ChatChunk, ProviderHealth, ModelInfo, TokenUsage,
  ToolDefinition,
} from './interface.js'

const NATIVE_TOOL_PREFIXES = [
  'qwen2.5:', 'qwen2.5-coder:', 'llama3.1:', 'llama3.2:', 'mistral-nemo:', 'mistral:',
]

function isNativeToolModel(model: string): boolean {
  return NATIVE_TOOL_PREFIXES.some(p => model.startsWith(p))
}

function xmlToolInstructions(tools: ToolDefinition[]): string {
  const defs = tools
    .map(t => `  ${t.name}: ${t.description}\n  params: ${JSON.stringify(t.parameters)}`)
    .join('\n\n')
  return [
    'To call a tool output ONLY:',
    '<tool>tool_name</tool>',
    '<args>{"key": "value"}</args>',
    '',
    'Available tools:',
    defs,
  ].join('\n')
}

function* parseXmlChunks(content: string): Generator<ChatChunk> {
  const re = /<tool>([\s\S]*?)<\/tool>\s*<args>([\s\S]*?)<\/args>/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(content)) !== null) {
    if (match.index > last) yield { type: 'text', delta: content.slice(last, match.index) }
    const name    = (match[1] ?? '').trim()
    const argsRaw = (match[2] ?? '').trim()
    let args: unknown = {}
    try { args = JSON.parse(argsRaw) } catch { args = { raw: argsRaw } }
    yield { type: 'tool_call', id: `xml_${Date.now()}`, name, arguments: args }
    last = re.lastIndex
  }
  if (last < content.length) yield { type: 'text', delta: content.slice(last) }
}

interface OllamaStreamChunk {
  done: false
  message?: { content?: string; tool_calls?: Array<{ function: { name: string; arguments: unknown } }> }
}
interface OllamaDoneChunk { done: true; prompt_eval_count?: number; eval_count?: number }
type OllamaChunk = OllamaStreamChunk | OllamaDoneChunk

function buildMessages(request: ChatRequest, useXml: boolean): unknown[] {
  const messages: unknown[] = []
  if (request.systemPrompt) {
    let sys = request.systemPrompt
    if (useXml && request.tools) sys += '\n\n' + xmlToolInstructions(request.tools)
    messages.push({ role: 'system', content: sys })
  } else if (useXml && request.tools) {
    messages.push({ role: 'system', content: xmlToolInstructions(request.tools) })
  }
  for (const m of request.messages) {
    messages.push({ role: m.role, content: m.content, ...(m.name ? { name: m.name } : {}) })
  }
  return messages
}

function* processStreamChunk(chunk: OllamaStreamChunk, useXml: boolean): Generator<ChatChunk> {
  const msg = chunk.message
  if (!msg) return
  if (msg.tool_calls?.length) {
    for (const tc of msg.tool_calls) {
      const name = tc.function?.name ?? (tc as unknown as Record<string, unknown>)['name'] as string ?? ''
      let args: unknown = tc.function?.arguments ?? {}
      // Ollama sometimes returns arguments as a JSON string
      if (typeof args === 'string') {
        try { args = JSON.parse(args) } catch { args = { raw: args } }
      }
      yield { type: 'tool_call', id: `tc_${Date.now()}`, name, arguments: args }
    }
  } else if (msg.content) {
    if (useXml) { yield* parseXmlChunks(msg.content) }
    else         { yield { type: 'text', delta: msg.content } }
  }
}

async function* readNdjsonStream(
  body: ReadableStream<Uint8Array>,
  useXml: boolean,
): AsyncGenerator<ChatChunk | { usage: TokenUsage }> {
  const reader  = body.getReader()
  const decoder = new TextDecoder()
  let buffer    = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      let parsed: OllamaChunk
      try { parsed = JSON.parse(trimmed) as OllamaChunk } catch { continue }
      if (parsed.done) {
        const d = parsed as OllamaDoneChunk
        yield { usage: { input: d.prompt_eval_count ?? 0, output: d.eval_count ?? 0 } }
      } else {
        yield* processStreamChunk(parsed as OllamaStreamChunk, useXml)
      }
    }
  }
}

export class OllamaProvider implements LLMProvider {
  readonly name            = 'ollama'
  readonly supportsStreaming = true
  model:           string
  supportsToolUse: boolean

  private baseUrl:      string
  private defaultModel: string
  private numCtx:       number
  private numPredict:   number
  private temperature:  number

  constructor() {
    this.baseUrl      = process.env['OLLAMA_BASE_URL']    ?? 'http://localhost:11434'
    this.defaultModel = process.env['OLLAMA_MODEL']       ?? 'qwen2.5:14b'
    this.model        = this.defaultModel
    this.numCtx       = parseInt(process.env['OLLAMA_NUM_CTX']      ?? '4096', 10)
    this.numPredict   = parseInt(process.env['OLLAMA_NUM_PREDICT']   ?? '512',  10)
    this.temperature  = parseFloat(process.env['OLLAMA_TEMPERATURE'] ?? '0.7')
    this.supportsToolUse = isNativeToolModel(this.model)
  }

  // fallow-ignore-next-line unused-class-member
  setModel(model: string): void {
    this.model = model
    this.supportsToolUse = isNativeToolModel(model)
  }

  async *chat(request: ChatRequest): AsyncGenerator<ChatChunk> {
    const startMs   = Date.now()
    const useNative = isNativeToolModel(this.model) && (request.tools?.length ?? 0) > 0
    const useXml    = !useNative && (request.tools?.length ?? 0) > 0

    const body: Record<string, unknown> = {
      model:    this.model,
      messages: buildMessages(request, useXml),
      stream:   true,
      options:  { num_ctx: this.numCtx, num_predict: this.numPredict, temperature: request.temperature ?? this.temperature },
    }
    if (useNative && request.tools) {
      body['tools'] = request.tools.map(t => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }))
    }

    let response: Response
    try {
      response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch (err) {
      yield { type: 'error', message: `Ollama connection failed: ${err instanceof Error ? err.message : String(err)}` }
      return
    }

    if (!response.ok) {
      const errText = await response.text()
      // Model not pulled — fall back to default and retry once
      if (response.status === 404 && errText.includes('not found') && body['model'] !== this.defaultModel) {
        const missing = String(body['model'])
        logger.warn('ollama', `model "${missing}" not found, falling back to "${this.defaultModel}" (run: ollama pull ${missing})`)
        yield { type: 'model_switch', from: missing, to: this.defaultModel }
        body['model'] = this.defaultModel
        this.model = this.defaultModel
        try {
          response = await fetch(`${this.baseUrl}/api/chat`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
          })
        } catch (err) {
          yield { type: 'error', message: `Ollama connection failed: ${err instanceof Error ? err.message : String(err)}` }
          return
        }
        if (!response.ok) {
          yield { type: 'error', message: `Ollama HTTP ${response.status}: ${await response.text()}` }
          return
        }
      } else {
        yield { type: 'error', message: `Ollama HTTP ${response.status}: ${errText}` }
        return
      }
    }
    if (!response.body) { yield { type: 'error', message: 'No response body' }; return }

    let usage: TokenUsage | undefined
    for await (const item of readNdjsonStream(response.body, useXml)) {
      if ('usage' in item) { usage = item.usage; continue }
      yield item as ChatChunk
    }

    const latencyMs = Date.now() - startMs
    eventBus.emit('provider_latency', { provider: 'ollama', model: this.model, latencyMs })
    if (usage) eventBus.emit('tokens_used', { input: usage.input, output: usage.output, provider: 'ollama' })
    yield { type: 'done', usage }
  }

  async healthCheck(): Promise<ProviderHealth> {
    const start = Date.now()
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`)
      const latencyMs = Date.now() - start
      if (!res.ok) return { ok: false, latencyMs, model: this.model, error: `HTTP ${res.status}` }
      eventBus.emit('session_started', { provider: 'ollama', model: this.model })
      return { ok: true, latencyMs, model: this.model }
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - start, model: this.model, error: String(err) }
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const res  = await fetch(`${this.baseUrl}/api/tags`)
      if (!res.ok) return []
      const data = await res.json() as { models?: Array<{ name: string }> }
      return (data.models ?? []).map(m => ({
        id: m.name, name: m.name, supportsTools: isNativeToolModel(m.name),
      }))
    } catch { return [] }
  }
}
