// MIT License — personal-ai
import type { LLMProvider, ChatChunk, ToolDefinition } from '../providers/interface.js'
import type { ConversationContext } from './context.js'

export interface AssistantOptions {
  tools?: ToolDefinition[]
  temperature?: number
}

/** Orchestrates the provider + context to handle one user turn. */
export class AssistantEngine {
  constructor(
    private provider: LLMProvider,
    private getSystemPrompt: () => string,
    private context: ConversationContext,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private _memory?: unknown,
  ) {}

  async *chat(userMessage: string, options?: AssistantOptions): AsyncGenerator<ChatChunk> {
    this.context.addUser(userMessage)

    const request = {
      messages: [...this.context.getMessages()],
      systemPrompt: this.getSystemPrompt(),
      tools: options?.tools,
      temperature: options?.temperature,
    }

    let assistantText = ''
    for await (const chunk of this.provider.chat(request)) {
      if (chunk.type === 'text') assistantText += chunk.delta
      yield chunk
    }

    if (assistantText) this.context.addAssistant(assistantText)
  }
}
