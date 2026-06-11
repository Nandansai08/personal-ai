// MIT License — personal-ai
// Plugin system types. Plugins extend PersonalAI locally (custom tools,
// hooks); MCP remains the integration path for external services.

import type { RegisteredTool } from '../tools/types.js'
import type { Memory } from '../memory/types.js'

export interface PluginHooks {
  /** Modify the system prompt before each model call. */
  beforePrompt?(prompt: string): Promise<string>
  /** Modify the assistant's final response text (stored context + non-stream consumers). */
  afterResponse?(response: string): Promise<string>
  /** Observe a tool call before it executes. */
  beforeToolCall?(toolName: string, args: unknown): Promise<void>
  /** Observe a tool result after execution. */
  afterToolCall?(toolName: string, result: unknown): Promise<void>
  /** Triggered when a memory is stored. */
  memoryStored?(memory: Memory): Promise<void>
  sessionStarted?(): Promise<void>
  sessionEnded?(): Promise<void>
}

export interface PersonalAIPlugin {
  name: string
  version: string
  description: string
  tools?: RegisteredTool[]
  hooks?: PluginHooks
  initialize?(): Promise<void>
  shutdown?(): Promise<void>
}

/** plugin.json on disk. */
export interface PluginManifest {
  name: string
  version: string
  description: string
  /** Entry module relative to the plugin directory, e.g. "./index.js" */
  main: string
  enabled: boolean
}

export type PluginStatus = 'healthy' | 'failed' | 'disabled'

export interface PluginRecord {
  manifest: PluginManifest
  dir: string
  status: PluginStatus
  plugin?: PersonalAIPlugin
  error?: string
  loadMs?: number
  toolCount: number
  hookCount: number
  /** Hook/tool failures observed since load — health signal, not fatal. */
  failureCount: number
}

/** Validation result for a manifest read from disk. */
export type ManifestResult =
  | { ok: true; manifest: PluginManifest }
  | { ok: false; error: string }
