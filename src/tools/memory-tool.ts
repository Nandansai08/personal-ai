// MIT License — personal-ai

import type { RegisteredTool, ToolResult } from './types.js'
import type { LongTermMemory } from '../memory/long-term.js'

/**
 * Creates the memory tool bound to a LongTermMemory instance.
 * Kept as a factory so the tool shares the same DB connection as the assistant.
 */
export function createMemoryTool(memory: LongTermMemory): RegisteredTool {
  return {
    definition: {
      name: 'memory',
      description: 'Save, search, or retrieve memories about the user. Use to remember important facts, preferences, and context.',
      parameters: {
        type: 'object',
        properties: {
          action:  { type: 'string', description: 'save | search | list | stats', enum: ['save', 'search', 'list', 'stats'] },
          content: { type: 'string', description: 'Memory content (for save)' },
          type:    { type: 'string', description: 'fact | preference | context | episodic', enum: ['fact', 'preference', 'context', 'episodic'] },
          query:   { type: 'string', description: 'Search query (for search)' },
          limit:   { type: 'number', description: 'Max results (for search/list, default 8)' },
          importance: { type: 'number', description: 'Importance 1-10 (for save, default 5)' },
        },
        required: ['action'],
      },
    },
    async execute(args: unknown): Promise<ToolResult> {
      const a = args as Record<string, unknown>
      const action = String(a['action'] ?? '').trim()

      switch (action) {
        case 'save': {
          const content = String(a['content'] ?? '').trim()
          if (!content) return { success: false, data: null, error: 'content required' }
          const type = (a['type'] as 'fact' | 'preference' | 'context' | 'episodic') ?? 'fact'
          const importance = Math.min(10, Math.max(1, Number(a['importance'] ?? 5)))
          const saved = memory.save({ content, type, importance })
          return { success: true, data: saved }
        }
        case 'search': {
          const query = String(a['query'] ?? '').trim()
          if (!query) return { success: false, data: null, error: 'query required' }
          const limit = Number(a['limit'] ?? 8)
          const results = memory.search(query, limit)
          return { success: true, data: results }
        }
        case 'list': {
          const limit = Number(a['limit'] ?? 10)
          const results = memory.getRecent(limit)
          return { success: true, data: results }
        }
        case 'stats': {
          return { success: true, data: memory.getStats() }
        }
        default:
          return { success: false, data: null, error: `Unknown action: ${action}` }
      }
    },
  }
}
