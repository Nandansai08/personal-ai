// MIT License — personal-ai
import OpenAI from 'openai'
import { eventBus } from '../core/events.js'
import { logger } from '../core/logger.js'
import type {
  LLMProvider, ChatRequest, ChatChunk, ProviderHealth, ModelInfo, ToolDefinition,
} from './interface.js'

function toOAITools(tools: ToolDefinition[]): OpenAI.ChatCompletionTool[] {
  return tools.map(t => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }))
}

/**
 * Abstract base for all OpenAI-compatible providers (OpenAI, Groq, LMStudio, Together).
 * Subclasses set name, baseURL, defaultModel, supportsToolUse.
 */
export abstract class OpenAICompatibleProvider implements LLMProvider {
  abstract readonly name: string
  abstract readonly supportsToolUse: boolean
  readonly supportsStreaming = true

  readonly model: string
  protected client: OpenAI
  protected temperature: number

  constructor(apiKey: string, baseURL: string | undefined, model: string, temperature = 0.7) {
    this.model       = model
    this.temperature = temperature
    this.client      = new OpenAI({ apiKey, baseURL })
  }

  async *chat(request: ChatRequest): AsyncGenerator<ChatChunk> {
    const startMs = Date.now()

    const messages: OpenAI.ChatCompletionMessageParam[] = []
    if (request.systemPrompt) {
      messages.push({ role: 'system', content: request.systemPrompt })
    }
    for (const m of request.messages) {
      if (m.role === 'tool') {
        messages.push({ role: 'tool', content: m.content, tool_call_id: m.tool_call_id ?? '' })
      } else if (m.role === 'system') {
        messages.push({ role: 'system', content: m.content })
      } else if (m.role === 'assistant') {
        messages.push({ role: 'assistant', content: m.content })
      } else {
        messages.push({ role: 'user', content: m.content })
      }
    }

    const params: OpenAI.ChatCompletionCreateParamsStreaming = {
      model:       this.model,
      messages,
      temperature: request.temperature ?? this.temperature,
      stream:      true,
    }
    if (request.tools?.length && this.supportsToolUse) {
      params.tools = toOAITools(request.tools)
    }
    if (request.maxTokens) params.max_tokens = request.maxTokens

    let stream: AsyncIterable<OpenAI.ChatCompletionChunk>
    try {
      stream = await this.client.chat.completions.create(params)
    } catch (err) {
      yield { type: 'error', message: `${this.name} request failed: ${String(err)}` }
      return
    }

    let inputTokens  = 0
    let outputTokens = 0
    const toolArgs: Record<string, string> = {}
    const toolNames: Record<string, string> = {}

    try {
      for await (const chunk of stream) {
        const choice = chunk.choices[0]
        if (!choice) continue

        const delta = choice.delta

        if (delta.content) {
          yield { type: 'text', delta: delta.content }
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = String(tc.index)
            if (tc.function?.name) toolNames[idx] = (toolNames[idx] ?? '') + tc.function.name
            if (tc.function?.arguments) toolArgs[idx] = (toolArgs[idx] ?? '') + tc.function.arguments
            if (tc.id) {
              // First chunk with id — emit once args are complete (done at finish_reason)
            }
          }
        }

        if (choice.finish_reason === 'tool_calls') {
          for (const [idx, name] of Object.entries(toolNames)) {
            const argsRaw = toolArgs[idx] ?? '{}'
            let args: unknown = {}
            try { args = JSON.parse(argsRaw) } catch { args = { raw: argsRaw } }
            yield { type: 'tool_call', id: `tc_${idx}_${Date.now()}`, name, arguments: args }
          }
        }

        if (chunk.usage) {
          inputTokens  = chunk.usage.prompt_tokens
          outputTokens = chunk.usage.completion_tokens
        }
      }
    } catch (err) {
      yield { type: 'error', message: `${this.name} stream error: ${String(err)}` }
      return
    }

    const latencyMs = Date.now() - startMs
    eventBus.emit('provider_latency', { provider: this.name, model: this.model, latencyMs })
    if (inputTokens || outputTokens) {
      eventBus.emit('tokens_used', { input: inputTokens, output: outputTokens, provider: this.name })
    }
    logger.debug(this.name, `done in ${latencyMs}ms`)
    yield { type: 'done', usage: { input: inputTokens, output: outputTokens } }
  }

  async healthCheck(): Promise<ProviderHealth> {
    const start = Date.now()
    try {
      await this.client.models.list()
      return { ok: true, latencyMs: Date.now() - start, model: this.model }
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - start, model: this.model, error: String(err) }
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const res = await this.client.models.list()
      return res.data.map(m => ({ id: m.id, name: m.id }))
    } catch { return [] }
  }
}
