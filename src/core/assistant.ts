// MIT License — personal-ai
import type { LLMProvider, ChatChunk, ToolDefinition } from '../providers/interface.js'
import type { ConversationContext } from './context.js'
import type { LongTermMemory } from '../memory/long-term.js'
import type { ProfileManager } from '../persona/profiles.js'
import { extractMemoryCandidates } from '../memory/short-term.js'
import { logger } from './logger.js'

export interface AssistantOptions {
  tools?: ToolDefinition[]
  temperature?: number
}

export class AssistantEngine {
  constructor(
    private provider: LLMProvider,
    private getSystemPrompt: () => string,
    private context: ConversationContext,
    private memory?: LongTermMemory,
    private profileManager?: ProfileManager,
  ) {}

  async *chat(userMessage: string, options?: AssistantOptions): AsyncGenerator<ChatChunk> {
    // Retrieve relevant memories
    let memoryContext = ''
    if (this.memory) {
      const memories = this.memory.search(userMessage, 8)
      if (memories.length > 0) {
        memoryContext = '\n\nRelevant memories:\n' +
          memories.map(m => `- [${m.type}] ${m.content}`).join('\n')
        logger.debug('assistant', `injected ${memories.length} memories`)
      }
    }

    this.context.addUser(userMessage)

    const temperature = options?.temperature
      ?? this.profileManager?.getTemperature()

    const request = {
      messages:     [...this.context.getMessages()],
      systemPrompt: this.getSystemPrompt() + memoryContext,
      tools:        options?.tools,
      temperature,
    }

    let assistantText = ''
    for await (const chunk of this.provider.chat(request)) {
      if (chunk.type === 'text') assistantText += chunk.delta
      yield chunk
    }

    if (assistantText) {
      this.context.addAssistant(assistantText)

      if (this.memory) {
        const candidates = extractMemoryCandidates(userMessage)
        for (const c of candidates) {
          this.memory.save({ content: c.content, type: c.type, importance: c.importance })
        }
        if (candidates.length > 0) {
          logger.debug('assistant', `saved ${candidates.length} memory candidates`)
        }
      }
    }
  }

}
