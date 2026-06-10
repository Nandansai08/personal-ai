// MIT License — personal-ai
import Anthropic from '@anthropic-ai/sdk'
import { eventBus } from '../core/events.js'
import { logger } from '../core/logger.js'
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

    const messages: Anthropic.MessageParam[] = []
    for (const m of request.messages) {
      if (m.role === 'system') continue  // system goes in system param
      if (m.role === 'tool') {
        messages.push({
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: m.tool_call_id ?? '', content: m.content }],
        })
      } else if (m.role === 'assistant') {
        messages.push({ role: 'assistant', content: m.content })
      } else {
        messages.push({ role: 'user', content: m.content })
      }
    }

    const params: Anthropic.MessageStreamParams = {
      model:       this.model,
      max_tokens:  request.maxTokens ?? this.maxTokens,
      temperature: request.temperature ?? this.temperature,
      messages,
    }
    if (request.systemPrompt) params.system = request.systemPrompt
    if (request.tools?.length) params.tools = toAnthropicTools(request.tools)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let stream: ReturnType<typeof this.client.messages.stream>
    try {
      stream = this.client.messages.stream(params)
    } catch (err) {
      yield { type: 'error', message: `Anthropic request failed: ${String(err)}` }
      return
    }

    let inputTokens = 0
    let outputTokens = 0

    try {
      for await (const event of stream) {
        if (event.type === 'content_block_delta') {
          const delta = event.delta
          if (delta.type === 'text_delta') {
            yield { type: 'text', delta: delta.text }
          } else if (delta.type === 'input_json_delta') {
            // tool input delta — collected by content_block_stop
          }
        } else if (event.type === 'content_block_stop') {
          // check if block was a tool_use
        } else if (event.type === 'message_delta' && event.usage) {
          outputTokens = event.usage.output_tokens
        } else if (event.type === 'message_start' && event.message.usage) {
          inputTokens = event.message.usage.input_tokens
        }
      }

      // Extract tool calls from final message
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
    eventBus.emit('tokens_used', { input: inputTokens, output: outputTokens, provider: 'anthropic' })
    logger.debug('anthropic', `done in ${latencyMs}ms`)
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
      return res.data.map(m => ({ id: m.id, name: m.id, supportsTools: true }))
    } catch { return [] }
  }
}
