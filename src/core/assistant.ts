// MIT License — personal-ai
import type { LLMProvider, ChatChunk } from '../providers/interface.js'
import type { ConversationContext } from './context.js'
import type { LongTermMemory } from '../memory/long-term.js'
import type { ProfileManager } from '../persona/profiles.js'
import type { ToolRegistry } from '../tools/registry.js'
import type { ModelManager } from './model-manager.js'
import type { ToolCall } from '../tools/types.js'
import { parseToolCalls } from '../tools/parser.js'
import { extractMemoryCandidates } from '../memory/short-term.js'
import { isGemma3Model } from '../persona/system-prompt.js'
import { logger } from './logger.js'

const MAX_ITER = 6

export interface AssistantOptions {
  temperature?: number
}

type GetSystemPrompt = (memories: import('../memory/types.js').Memory[], toolsSection: string) => string

export class AssistantEngine {
  private lastModel: string | undefined

  constructor(
    private provider: LLMProvider,
    private getSystemPrompt: GetSystemPrompt,
    private memory: LongTermMemory | undefined,
    private registry: ToolRegistry | undefined,
    private profileManager?: ProfileManager,
    private context?: ConversationContext,
    private modelManager?: ModelManager,
  ) {}

  async *chat(userMessage: string, options?: AssistantOptions): AsyncGenerator<ChatChunk> {
    const memories = this.memory ? this.memory.search(userMessage, 8) : []

    // Model selection via ModelManager if available
    const selectedModel = this.modelManager
      ? this.modelManager.selectModel(userMessage, this.context?.getMessages().length ?? 0)
      : this.provider.model

    if (this.modelManager && this.lastModel && this.lastModel !== selectedModel) {
      yield { type: 'model_switch', from: this.lastModel, to: selectedModel }
    }
    this.lastModel = selectedModel

    // For Ollama provider, update its model dynamically if modelManager selected a different one
    if (this.modelManager && 'setModel' in this.provider && typeof (this.provider as Record<string, unknown>)['setModel'] === 'function') {
      ;(this.provider as unknown as { setModel(m: string): void }).setModel(selectedModel)
    }

    const isGemma = isGemma3Model(selectedModel)
    const toolsSection = (this.registry && this.registry.count() > 0 && isGemma)
      ? this.registry.formatForPrompt()
      : ''

    const systemPrompt = this.getSystemPrompt(memories, toolsSection)

    const nativeTools = (this.registry && !isGemma && this.provider.supportsToolUse)
      ? this.registry.formatNative()
      : undefined

    this.context?.addUser(userMessage)

    const temperature = options?.temperature ?? this.profileManager?.getTemperature()

    let iterations = 0
    while (iterations < MAX_ITER) {
      iterations++
      let assistantText = ''
      const nativeToolCalls: ToolCall[] = []
      let doneChunk: ChatChunk | undefined

      const request = {
        messages:     this.context ? [...this.context.getMessages()] : [{ role: 'user' as const, content: userMessage }],
        systemPrompt,
        tools:        nativeTools,
        temperature,
        model:        selectedModel,
      }

      for await (const chunk of this.provider.chat(request)) {
        if (chunk.type === 'text') {
          assistantText += chunk.delta
          yield chunk
        } else if (chunk.type === 'tool_call') {
          // Native tool call from provider (qwen2.5, llama3.1, etc.)
          nativeToolCalls.push({ id: chunk.id, name: chunk.name, arguments: chunk.arguments })
          // Don't yield — will yield after dispatch
        } else if (chunk.type === 'done') {
          doneChunk = chunk
        } else if (chunk.type === 'error') {
          yield chunk
        }
      }

      // Native tool models: only use native chunks, never parse text (avoids false positives)
      // XML/code-block parsing only for Gemma3 / phi which lack native tool use
      const parsedCalls = nativeToolCalls.length > 0
        ? nativeToolCalls
        : (isGemma ? parseToolCalls(assistantText) : [])

      if (parsedCalls.length === 0 || !this.registry) {
        if (assistantText) {
          this.context?.addAssistant(assistantText)
          this._saveMemoryCandidates(userMessage)
        }
        if (doneChunk) yield doneChunk
        return
      }

      logger.debug('assistant', `tool calls: ${parsedCalls.map(t => t.name).join(', ')} (iter ${iterations})`)
      this.context?.addAssistant(assistantText)

      for (const tc of parsedCalls) {
        yield { type: 'tool_call', id: tc.id, name: tc.name, arguments: tc.arguments }
        const result = await this.registry.dispatch(tc.name, tc.arguments)
        yield { type: 'tool_result', id: tc.id, name: tc.name, result: result.data }

        const resultText = result.success
          ? `Tool ${tc.name} result:\n${JSON.stringify(result.data, null, 2)}`
          : `Tool ${tc.name} error: ${result.error ?? 'unknown'}`
        this.context?.addUser(resultText)
      }
    }

    logger.warn('assistant', `reached max iterations (${MAX_ITER})`)
    yield { type: 'error', message: `Reached max tool iterations (${MAX_ITER})` }
  }

  private _saveMemoryCandidates(userMessage: string): void {
    if (!this.memory) return
    const candidates = extractMemoryCandidates(userMessage)
    for (const c of candidates) {
      this.memory.save({ content: c.content, type: c.type, importance: c.importance })
    }
    if (candidates.length > 0) {
      logger.debug('assistant', `saved ${candidates.length} memory candidates`)
    }
  }
}
