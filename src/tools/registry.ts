// MIT License — personal-ai

import type { RegisteredTool, ToolDefinition, ToolResult, ConfirmHandler } from './types.js'
import { eventBus } from '../core/events.js'

export class ToolRegistry {
  private tools = new Map<string, RegisteredTool>()
  private confirmHandler: ConfirmHandler | undefined

  /**
   * Install a confirmation handler for tools marked requiresConfirmation.
   * Without a handler such tools run unconfirmed (legacy behavior) — the CLI
   * installs an interactive y/n prompt at startup.
   */
  setConfirmHandler(handler: ConfirmHandler | undefined): void {
    this.confirmHandler = handler
  }

  /** Register a tool. Overwrites if same name. */
  register(tool: RegisteredTool): void {
    this.tools.set(tool.definition.name, tool)
  }

  /** Returns true if tool exists. */
  has(name: string): boolean {
    return this.tools.has(name)
  }

  /** Total registered tool count. */
  count(): number {
    return this.tools.size
  }

  /** All registered tools. */
  getAll(): RegisteredTool[] {
    return [...this.tools.values()]
  }

  /**
   * Execute a tool by name. Never throws — returns error ToolResult on failure.
   * Emits tool_called and tool_result events with timing.
   */
  async dispatch(name: string, args: unknown): Promise<ToolResult> {
    const tool = this.tools.get(name)
    const start = Date.now()

    if (!name) {
      return { success: false, data: null, error: 'Tool name was empty — model sent malformed tool call' }
    }
    if (!tool) {
      const result: ToolResult = { success: false, data: null, error: `Unknown tool: ${name}` }
      return result
    }

    if (tool.requiresConfirmation && this.confirmHandler) {
      const approved = await this.confirmHandler(name, args)
      if (!approved) {
        eventBus.emit('tool_called', { name, args, durationMs: 0 })
        eventBus.emit('tool_result', { name, success: false, resultSize: 0 })
        return { success: false, data: null, error: `User denied ${name} call` }
      }
    }

    try {
      const result = await tool.execute(args)
      const durationMs = Date.now() - start
      eventBus.emit('tool_called', { name, args, durationMs })
      eventBus.emit('tool_result', { name, success: result.success, resultSize: JSON.stringify(result.data).length })
      return result
    } catch (err) {
      const durationMs = Date.now() - start
      const error = err instanceof Error ? err.message : String(err)
      const result: ToolResult = { success: false, data: null, error }
      eventBus.emit('tool_called', { name, args, durationMs })
      eventBus.emit('tool_result', { name, success: false, resultSize: 0 })
      return result
    }
  }

  /** Format tools as OpenAI-compatible native tool definitions. */
  formatNative(): ToolDefinition[] {
    return this.getAll().map(t => t.definition)
  }

  /** Format tools as XML instructions for Gemma3 / XML-fallback models. */
  formatForPrompt(): string {
    if (this.tools.size === 0) return ''
    const lines: string[] = ['Available tools (respond with <tool>name</tool><args>{...}</args>):']
    for (const tool of this.tools.values()) {
      const { name, description, parameters } = tool.definition
      const params = Object.entries(parameters.properties)
        .map(([k, v]) => `  ${k} (${v.type}): ${v.description ?? ''}`)
        .join('\n')
      lines.push(`\n${name}: ${description}\nParameters:\n${params}`)
    }
    return lines.join('\n')
  }
}

/** Singleton registry shared across the application. */
export const toolRegistry = new ToolRegistry()
