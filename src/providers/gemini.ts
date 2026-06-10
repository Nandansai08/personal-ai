// MIT License — personal-ai
import { GoogleGenerativeAI, type FunctionDeclaration } from '@google/generative-ai'
import { eventBus } from '../core/events.js'
import { logger } from '../core/logger.js'
import type {
  LLMProvider, ChatRequest, ChatChunk, ProviderHealth, ModelInfo, ToolDefinition,
} from './interface.js'

function toGeminiTools(tools: ToolDefinition[]): FunctionDeclaration[] {
  return tools.map(t => ({
    name:        t.name,
    description: t.description,
    parameters:  t.parameters as FunctionDeclaration['parameters'],
  }))
}

// fallow-ignore-next-line unused-export
export class GeminiProvider implements LLMProvider {
  readonly name             = 'gemini'
  readonly supportsToolUse  = true
  readonly supportsStreaming = true
  readonly model: string

  private client: GoogleGenerativeAI
  private temperature: number

  constructor() {
    this.model       = process.env['GEMINI_MODEL']       ?? 'gemini-2.0-flash'
    this.temperature = parseFloat(process.env['GEMINI_TEMPERATURE'] ?? '0.7')
    this.client      = new GoogleGenerativeAI(process.env['GEMINI_API_KEY'] ?? '')
  }

  async *chat(request: ChatRequest): AsyncGenerator<ChatChunk> {
    const startMs = Date.now()

    const genModel = this.client.getGenerativeModel({
      model:           request.model ?? this.model,
      systemInstruction: request.systemPrompt,
      generationConfig: { temperature: request.temperature ?? this.temperature },
      ...(request.tools?.length ? {
        tools: [{ functionDeclarations: toGeminiTools(request.tools) }],
      } : {}),
    })

    // Build history (all but last user message)
    const history = request.messages.slice(0, -1).map(m => ({
      role:  m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))

    const lastMsg = request.messages[request.messages.length - 1]
    const userPart = lastMsg?.content ?? ''

    const chat = genModel.startChat({ history })

    let inputTokens = 0
    let outputTokens = 0

    try {
      const result = await chat.sendMessageStream(userPart)

      for await (const chunk of result.stream) {
        const text = chunk.text()
        if (text) yield { type: 'text', delta: text }

        // Tool calls
        const calls = chunk.functionCalls()
        if (calls) {
          for (const call of calls) {
            yield { type: 'tool_call', id: `gem_${Date.now()}`, name: call.name, arguments: call.args }
          }
        }
      }

      const final = await result.response
      inputTokens  = final.usageMetadata?.promptTokenCount ?? 0
      outputTokens = final.usageMetadata?.candidatesTokenCount ?? 0
    } catch (err) {
      yield { type: 'error', message: `Gemini error: ${String(err)}` }
      return
    }

    const latencyMs = Date.now() - startMs
    eventBus.emit('provider_latency', { provider: 'gemini', model: this.model, latencyMs })
    eventBus.emit('tokens_used', { input: inputTokens, output: outputTokens, provider: 'gemini' })
    logger.debug('gemini', `done in ${latencyMs}ms`)
    yield { type: 'done', usage: { input: inputTokens, output: outputTokens } }
  }

  async healthCheck(): Promise<ProviderHealth> {
    const start = Date.now()
    try {
      const m = this.client.getGenerativeModel({ model: this.model })
      await m.countTokens('ping')
      return { ok: true, latencyMs: Date.now() - start, model: this.model }
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - start, model: this.model, error: String(err) }
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    return [
      { id: 'gemini-2.0-flash',    name: 'Gemini 2.0 Flash',    supportsTools: true },
      { id: 'gemini-1.5-pro',      name: 'Gemini 1.5 Pro',      supportsTools: true },
      { id: 'gemini-1.5-flash',    name: 'Gemini 1.5 Flash',    supportsTools: true },
    ]
  }
}
