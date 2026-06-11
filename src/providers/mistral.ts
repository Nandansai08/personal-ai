// MIT License — personal-ai
// Native fetch SSE — Mistral API is OpenAI-compatible but we avoid the openai SDK here
import { eventBus } from '../core/events.js'
import { logger } from '../core/logger.js'
import { buildOAIMessages, flushToolCalls, runHealthCheck, readStreamLines } from './utils.js'
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

interface MistralLineResult {
  yields:       ChatChunk[]
  inputTokens?: number
  outputTokens?: number
}

function processMistralLine(
  data:      string,
  toolNames: Record<string, string>,
  toolArgs:  Record<string, string>,
): MistralLineResult {
  const yields: ChatChunk[] = []
  let chunk: MistralChunk
  try { chunk = JSON.parse(data) as MistralChunk } catch { return { yields } }

  const inputTokens  = chunk.usage?.prompt_tokens
  const outputTokens = chunk.usage?.completion_tokens

  const choice = chunk.choices?.[0]
  if (!choice) return { yields, inputTokens, outputTokens }

  const delta = choice.delta ?? {}
  if (delta.content) yields.push({ type: 'text', delta: delta.content })

  for (const tc of delta.tool_calls ?? []) {
    const idx = '0'
    if (tc.function?.name)      toolNames[idx] = (toolNames[idx] ?? '') + tc.function.name
    if (tc.function?.arguments) toolArgs[idx]  = (toolArgs[idx] ?? '') + tc.function.arguments
  }

  if (choice.finish_reason === 'tool_calls') yields.push(...flushToolCalls(toolNames, toolArgs, 'mtc'))

  return { yields, inputTokens, outputTokens }
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

    const messages = buildOAIMessages(request.messages, request.systemPrompt)

    const body: Record<string, unknown> = {
      model:       request.model ?? this.model,
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

    let inputTokens = 0
    let outputTokens = 0
    const toolArgs: Record<string, string> = {}
    const toolNames: Record<string, string> = {}

    try {
      for await (const line of readStreamLines(res.body)) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') continue
        const result = processMistralLine(data, toolNames, toolArgs)
        for (const c of result.yields) yield c
        if (result.inputTokens  !== undefined) inputTokens  = result.inputTokens
        if (result.outputTokens !== undefined) outputTokens = result.outputTokens
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
    return runHealthCheck(this.model, async () => {
      const res = await fetch(`${this.baseURL}/models`, { headers: { 'Authorization': `Bearer ${this.apiKey}` } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    })
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
