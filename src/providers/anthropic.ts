// MIT License — personal-ai
import Anthropic from '@anthropic-ai/sdk'
import { eventBus } from '../core/events.js'
import { logger } from '../core/logger.js'
import { runHealthCheck } from './utils.js'
import type {
  LLMProvider, ChatRequest, ChatChunk, ProviderHealth, ModelInfo, ToolDefinition,
} from './interface.js'

function toAnthropicTools(tools: ToolDefinition[]): Anthropic.Tool[] {
  return tools.map(t => ({
    name:         t.name,
    description:  t.description,
    input_schema: t.parameters as Anthropic.Tool['input_schema'],
  }))
}

function buildAnthropicMessages(messages: import('./interface.js').Message[]): Anthropic.MessageParam[] {
  const result: Anthropic.MessageParam[] = []
  for (const m of messages) {
    if (m.role === 'system') continue
    if (m.role === 'tool') {
      result.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: m.tool_call_id ?? '', content: m.content }] })
    } else {
      result.push({ role: m.role as 'user' | 'assistant', content: m.content })
    }
  }
  return result
}

interface AnthropicTokenState { input: number; output: number }

function processAnthropicEvent(
  event:  Anthropic.MessageStreamEvent,
  tokens: AnthropicTokenState,
): string | null {
  if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
    return event.delta.text
  }
  if (event.type === 'message_delta' && event.usage) {
    tokens.output = event.usage.output_tokens
  }
  if (event.type === 'message_start' && event.message.usage) {
    tokens.input = event.message.usage.input_tokens
  }
  return null
}

// fallow-ignore-next-line unused-export
export class AnthropicProvider implements LLMProvider {
  readonly name            = 'anthropic'
  readonly supportsToolUse = true
  readonly supportsStreaming = true
  readonly model: string

  private client: Anthropic
  private temperature: number
  private maxTokens: number

  constructor() {
    this.model       = process.env['ANTHROPIC_MODEL']       ?? 'claude-sonnet-4-6'
    this.temperature = parseFloat(process.env['ANTHROPIC_TEMPERATURE'] ?? '0.7')
    this.maxTokens   = parseInt(process.env['ANTHROPIC_MAX_TOKENS']   ?? '1024', 10)
    this.client      = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] })
  }

  async *chat(request: ChatRequest): AsyncGenerator<ChatChunk> {
    const startMs = Date.now()

    const messages = buildAnthropicMessages(request.messages)

    const params: Anthropic.MessageStreamParams = {
      model:       request.model ?? this.model,
      max_tokens:  request.maxTokens ?? this.maxTokens,
      temperature: request.temperature ?? this.temperature,
      messages,
    }
    if (request.systemPrompt) params.system = request.systemPrompt
    if (request.tools?.length) params.tools = toAnthropicTools(request.tools)

     
    let stream: ReturnType<typeof this.client.messages.stream>
    try {
      stream = this.client.messages.stream(params)
    } catch (err) {
      yield { type: 'error', message: `Anthropic request failed: ${String(err)}` }
      return
    }

    const tokens: AnthropicTokenState = { input: 0, output: 0 }

    try {
      for await (const event of stream) {
        const text = processAnthropicEvent(event, tokens)
        if (text !== null) yield { type: 'text', delta: text }
      }

      const finalMsg = await stream.finalMessage()
      for (const block of finalMsg.content) {
        if (block.type === 'tool_use') {
          yield { type: 'tool_call', id: block.id, name: block.name, arguments: block.input }
        }
      }
    } catch (err) {
      yield { type: 'error', message: `Anthropic stream error: ${String(err)}` }
      return
    }

    const latencyMs = Date.now() - startMs
    eventBus.emit('provider_latency', { provider: 'anthropic', model: this.model, latencyMs })
    eventBus.emit('tokens_used', { input: tokens.input, output: tokens.output, provider: 'anthropic' })
    logger.debug('anthropic', `done in ${latencyMs}ms`)
    yield { type: 'done', usage: { input: tokens.input, output: tokens.output } }
  }

  // fallow-ignore dup:7cc3932e — mirrors openai-compatible; both use SDK .models.list(), can't deduplicate across SDKs
  async healthCheck(): Promise<ProviderHealth> {
    return runHealthCheck(this.model, () => this.client.models.list().then(() => undefined))
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const res = await this.client.models.list()
      return res.data.map(m => ({ id: m.id, name: m.id, supportsTools: true }))
    } catch { return [] }
  }
}
