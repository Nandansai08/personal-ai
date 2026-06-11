// MIT License — personal-ai
// Hook runner: aggregates hooks across loaded plugins and runs them inside
// the sandbox. A failing hook logs, bumps the plugin's failure count, and
// the chain continues — plugins never break the assistant.

import { sandboxed } from './sandbox.js'
import type { PluginHooks, PluginRecord } from './types.js'
import type { Memory } from '../memory/types.js'

interface HookEntry {
  record: PluginRecord
  hooks: PluginHooks
}

export class HookRunner {
  private entries: HookEntry[] = []

  register(record: PluginRecord): void {
    if (record.plugin?.hooks) this.entries.push({ record, hooks: record.plugin.hooks })
  }

  unregister(name: string): void {
    this.entries = this.entries.filter(e => e.record.manifest.name !== name)
  }

  count(): number {
    return this.entries.length
  }

  /** Chain: each plugin may transform the prompt; failures keep the previous value. */
  async beforePrompt(prompt: string): Promise<string> {
    let current = prompt
    for (const { record, hooks } of this.entries) {
      if (!hooks.beforePrompt) continue
      const r = await sandboxed(record.manifest.name, 'beforePrompt', () => hooks.beforePrompt!(current))
      if (r.ok && typeof r.value === 'string') current = r.value
      else record.failureCount++
    }
    return current
  }

  /** Chain: each plugin may transform the response; failures keep the previous value. */
  async afterResponse(response: string): Promise<string> {
    let current = response
    for (const { record, hooks } of this.entries) {
      if (!hooks.afterResponse) continue
      const r = await sandboxed(record.manifest.name, 'afterResponse', () => hooks.afterResponse!(current))
      if (r.ok && typeof r.value === 'string') current = r.value
      else record.failureCount++
    }
    return current
  }

  async beforeToolCall(toolName: string, args: unknown): Promise<void> {
    for (const { record, hooks } of this.entries) {
      if (!hooks.beforeToolCall) continue
      const r = await sandboxed(record.manifest.name, 'beforeToolCall', () => hooks.beforeToolCall!(toolName, args))
      if (!r.ok) record.failureCount++
    }
  }

  async afterToolCall(toolName: string, result: unknown): Promise<void> {
    for (const { record, hooks } of this.entries) {
      if (!hooks.afterToolCall) continue
      const r = await sandboxed(record.manifest.name, 'afterToolCall', () => hooks.afterToolCall!(toolName, result))
      if (!r.ok) record.failureCount++
    }
  }

  async memoryStored(memory: Memory): Promise<void> {
    for (const { record, hooks } of this.entries) {
      if (!hooks.memoryStored) continue
      const r = await sandboxed(record.manifest.name, 'memoryStored', () => hooks.memoryStored!(memory))
      if (!r.ok) record.failureCount++
    }
  }

  async sessionStarted(): Promise<void> {
    for (const { record, hooks } of this.entries) {
      if (!hooks.sessionStarted) continue
      const r = await sandboxed(record.manifest.name, 'sessionStarted', () => hooks.sessionStarted!())
      if (!r.ok) record.failureCount++
    }
  }

  async sessionEnded(): Promise<void> {
    for (const { record, hooks } of this.entries) {
      if (!hooks.sessionEnded) continue
      const r = await sandboxed(record.manifest.name, 'sessionEnded', () => hooks.sessionEnded!())
      if (!r.ok) record.failureCount++
    }
  }
}
