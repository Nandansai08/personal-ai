// MIT License — personal-ai
import OpenAI from 'openai'
import { eventBus } from '../core/events.js'
import { logger } from '../core/logger.js'
import { buildOAIMessages, flushToolCalls, runHealthCheck } from './utils.js'
import type {
  LLMProvider, ChatRequest, ChatChunk, ProviderHealth, ModelInfo, ToolDefinition,
} from './interface.js'

function toOAITools(tools: ToolDefinition[]): OpenAI.ChatCompletionTool[] {
  return tools.map(t => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }))
}

interface OAIChunkResult {
  yields:       ChatChunk[]
  inputTokens?: number
  outputTokens?: number
}

function processOAIChunk(
  chunk:     OpenAI.ChatCompletionChunk,
  toolNames: Record<string, string>,
  toolArgs:  Record<string, string>,
): OAIChunkResult {
  const choice = chunk.choices[0]
  const yields: ChatChunk[] = []
  if (!choice) return { yields }

  const delta = choice.delta
  if (delta.content) yields.push({ type: 'text', delta: delta.content })

  for (const tc of delta.tool_calls ?? []) {
    const idx = String(tc.index)
    if (tc.function?.name)      toolNames[idx] = (toolNames[idx] ?? '') + tc.function.name
    if (tc.function?.arguments) toolArgs[idx]  = (toolArgs[idx] ?? '') + tc.function.arguments
  }

  if (choice.finish_reason === 'tool_calls') yields.push(...flushToolCalls(toolNames, toolArgs, 'tc'))

  return {
    yields,
    inputTokens:  chunk.usage?.prompt_tokens,
    outputTokens: chunk.usage?.completion_tokens,
  }
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

    const messages = buildOAIMessages(request.messages, request.systemPrompt) as OpenAI.ChatCompletionMessageParam[]

    const params: OpenAI.ChatCompletionCreateParamsStreaming = {
      model:       request.model ?? this.model,
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
        const result = processOAIChunk(chunk, toolNames, toolArgs)
        for (const c of result.yields) yield c
        if (result.inputTokens  !== undefined) inputTokens  = result.inputTokens
        if (result.outputTokens !== undefined) outputTokens = result.outputTokens
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
    return runHealthCheck(this.model, () => this.client.models.list().then(() => undefined))
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const res = await this.client.models.list()
      return res.data.map(m => ({ id: m.id, name: m.id }))
    } catch { return [] }
  }
}
