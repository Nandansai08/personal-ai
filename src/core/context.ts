// MIT License — personal-ai
import type { Message } from '../providers/interface.js'
import { eventBus } from './events.js'

/** Manages the in-memory message history for one conversation. */
export class ConversationContext {
  private messages: Message[] = []
  private toolCallCount = 0

  addUser(content: string): void {
    this.messages.push({ role: 'user', content })
    eventBus.emit('user_message', { content, length: content.length })
  }

  addAssistant(content: string): void {
    this.messages.push({ role: 'assistant', content })
  }

  /** Used in M4 when tool results are wired in. */
  addTool(name: string, toolCallId: string, result: string): void {
    this.messages.push({ role: 'tool', content: result, tool_call_id: toolCallId, name })
    this.toolCallCount++
  }

  getMessages(): ReadonlyArray<Message> {
    return this.messages
  }

  getToolCallCount(): number {
    return this.toolCallCount
  }

  clear(): void {
    this.messages = []
    this.toolCallCount = 0
  }

  /** Replace history with a previously saved session. */
  restore(messages: Message[]): void {
    this.messages = [...messages]
  }

  get messageCount(): number {
    return this.messages.length
  }
}
