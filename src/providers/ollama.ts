// MIT License — personal-ai
import { eventBus } from '../core/events.js'
import type {
  LLMProvider, ChatRequest, ChatChunk, ProviderHealth, ModelInfo, TokenUsage
} from './interface.js'

// Models that accept a native `tools` array in the Ollama API
const NATIVE_TOOL_MODELS = [
  'qwen2.5:', 'qwen2.5-coder:', 'llama3.1:', 'llama3.2:', 'mistral-nemo:', 'mistral:',
]
// Models that need XML tool injection in the system prompt
const XML_FALLBACK_MODELS = ['gemma3:', 'gemma3n:', 'phi4:', 'phi3:']

function isNativeToolModel(model: string): boolean {
  return NATIVE_TOOL_MODELS.some(p => model.startsWith(p))
}

function xmlToolInstructions(tools: import('./interface.js').ToolDefinition[]): string {
  const defs = tools
    .map(t => `  ${t.name}: ${t.description}\n  params: ${JSON.stringify(t.parameters)}`)
    .join('\n\n')
  return [
    'You have access to these tools. To call a tool, output ONLY:',
    '<tool>tool_name</tool>',
    '<args>{"key": "value"}</args>',
    '',
    'Available tools:',
    defs,
  ].join('\n')
}

interface OllamaMessage {
  role: string
  content: string
  tool_calls?: unknown[]
  tool_call_id?: string
  name?: string
}

interface OllamaDoneChunk {
  done: true
  prompt_eval_count?: number
  eval_count?: number
}

interface OllamaStreamChunk {
  done: false
  message?: {
    role?: string
    content?: string
    tool_calls?: Array<{
      function: { name: string; arguments: unknown }
    }>
  }
}

type OllamaChunk = OllamaStreamChunk | OllamaDoneChunk

export class OllamaProvider implements LLMProvider {
  readonly name = 'ollama'
  readonly supportsStreaming = true

  private baseUrl: string
  private numCtx: number
  private temperature: number

  readonly model: string
  readonly supportsToolUse: boolean

  constructor() {
    this.baseUrl = process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434'
    this.model    = process.env['OLLAMA_MODEL']    ?? 'qwen2.5:14b'
    this.numCtx   = parseInt(process.env['OLLAMA_NUM_CTX'] ?? '8192', 10)
    this.temperature = parseFloat(process.env['OLLAMA_TEMPERATURE'] ?? '0.7')
    this.supportsToolUse = isNativeToolModel(this.model)
  }

  async *chat(request: ChatRequest): AsyncGenerator<ChatChunk> {
    const startMs = Date.now()
    const useNative = isNativeToolModel(this.model) && (request.tools?.length ?? 0) > 0
    const useXml = !useNative && (request.tools?.length ?? 0) > 0

    const messages: OllamaMessage[] = []

    if (request.systemPrompt) {
      let sysContent = request.systemPrompt
      if (useXml && request.tools) sysContent += '\n\n' + xmlToolInstructions(request.tools)
      messages.push({ role: 'system', content: sysContent })
    } else if (useXml && request.tools) {
      messages.push({ role: 'system', content: xmlToolInstructions(request.tools) })
    }

    for (const m of request.messages) {
      messages.push({ role: m.role, content: m.content, ...(m.name ? { name: m.name } : {}) })
    }

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      stream: true,
      options: {
        num_ctx: this.numCtx,
        temperature: request.temperature ?? this.temperature,
      },
    }
    if (useNative && request.tools) body['tools'] = request.tools

    let response: Response
    try {
      response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      yield { type: 'error', message: `Ollama connection failed: ${msg}` }
      return
    }

    if (!response.ok) {
      yield { type: 'error', message: `Ollama HTTP ${response.status}: ${await response.text()}` }
      return
    }

    const reader = response.body?.getReader()
    if (!reader) { yield { type: 'error', message: 'No response body' }; return }

    const decoder = new TextDecoder()
    let buffer = ''
    let usage: TokenUsage | undefined

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
          if (d.prompt_eval_count !== undefined || d.eval_count !== undefined) {
            usage = { input: d.prompt_eval_count ?? 0, output: d.eval_count ?? 0 }
          }
          continue
        }

        const msg = (parsed as OllamaStreamChunk).message
        if (!msg) continue

        if (msg.tool_calls?.length) {
          for (const tc of msg.tool_calls) {
            const id = `tc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
            yield { type: 'tool_call', id, name: tc.function.name, arguments: tc.function.arguments }
          }
        } else if (msg.content) {
          const content = msg.content
          if (useXml) {
            yield* parseXmlChunks(content)
          } else {
            yield { type: 'text', delta: content }
          }
        }
      }
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
      const res = await fetch(`${this.baseUrl}/api/tags`)
      if (!res.ok) return []
      const data = await res.json() as { models?: Array<{ name: string; details?: { parameter_size?: string } }> }
      return (data.models ?? []).map(m => ({
        id: m.name,
        name: m.name,
        supportsTools: isNativeToolModel(m.name),
      }))
    } catch { return [] }
  }
}

// Naive XML tool-call parser for gemma3 / phi models
function* parseXmlChunks(content: string): Generator<ChatChunk> {
  const toolRe = /<tool>([\s\S]*?)<\/tool>\s*<args>([\s\S]*?)<\/args>/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = toolRe.exec(content)) !== null) {
    if (match.index > last) {
      yield { type: 'text', delta: content.slice(last, match.index) }
    }
    const name = (match[1] ?? '').trim()
    const argsRaw = (match[2] ?? '').trim()
    let args: unknown = {}
    try { args = JSON.parse(argsRaw) } catch { args = { raw: argsRaw } }
    const id = `xml_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    yield { type: 'tool_call', id, name, arguments: args }
    last = toolRe.lastIndex
  }
  if (last < content.length) yield { type: 'text', delta: content.slice(last) }
}
