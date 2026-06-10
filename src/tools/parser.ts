// MIT License — personal-ai

import type { ToolCall } from './types.js'

let _idCounter = 0
function genId(): string {
  return `tc_${Date.now()}_${_idCounter++}`
}

/** Strategy 1: Ollama native JSON tool_calls array */
function parseNativeJson(text: string): ToolCall[] | null {
  try {
    const parsed = JSON.parse(text.trim()) as unknown
    if (!Array.isArray(parsed)) return null
    const calls: ToolCall[] = []
    for (const item of parsed) {
      if (typeof item === 'object' && item !== null && 'name' in item) {
        const obj = item as Record<string, unknown>
        calls.push({
          id: genId(),
          name: String(obj['name'] ?? ''),
          arguments: (obj['arguments'] ?? obj['parameters'] ?? {}) as unknown,
        })
      }
    }
    return calls.length > 0 ? calls : null
  } catch {
    return null
  }
}

/** Strategy 2: Gemma3 two-tag XML  <tool>name</tool><args>{}</args> */
function parseGemmaXml(text: string): ToolCall[] | null {
  const toolPattern = /<tool>([\s\S]*?)<\/tool>/g
  const argsPattern = /<args>([\s\S]*?)<\/args>/g

  const toolMatches = [...text.matchAll(toolPattern)]
  const argsMatches = [...text.matchAll(argsPattern)]

  if (toolMatches.length === 0) return null

  const calls: ToolCall[] = []
  for (let i = 0; i < toolMatches.length; i++) {
    const name = toolMatches[i]![1]!.trim()
    let args: unknown = {}
    if (argsMatches[i]) {
      try {
        args = JSON.parse(argsMatches[i]![1]!.trim()) as unknown
      } catch {
        args = {}
      }
    }
    calls.push({ id: genId(), name, arguments: args })
  }
  return calls
}

/** Strategy 3: JSON code block  ```json\n{"name":...,"arguments":...}\n``` */
function parseJsonBlock(text: string): ToolCall[] | null {
  const blockPattern = /```(?:json)?\s*\n([\s\S]*?)\n```/g
  const calls: ToolCall[] = []

  for (const match of text.matchAll(blockPattern)) {
    try {
      const parsed = JSON.parse(match[1]!.trim()) as unknown
      if (typeof parsed === 'object' && parsed !== null && 'name' in parsed) {
        const obj = parsed as Record<string, unknown>
        calls.push({
          id: genId(),
          name: String(obj['name'] ?? ''),
          arguments: (obj['arguments'] ?? obj['parameters'] ?? {}) as unknown,
        })
      }
    } catch {
      // not a tool call block
    }
  }
  return calls.length > 0 ? calls : null
}

/**
 * Parse tool calls from model output using 3 strategies in priority order:
 * 1. Native JSON array (Ollama tool_calls)
 * 2. Gemma3 two-tag XML
 * 3. JSON code block
 */
export function parseToolCalls(text: string): ToolCall[] {
  return (
    parseNativeJson(text) ??
    parseGemmaXml(text) ??
    parseJsonBlock(text) ??
    []
  )
}
