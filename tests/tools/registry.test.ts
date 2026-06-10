import { describe, it, expect, beforeEach } from 'vitest'
import { ToolRegistry } from '../../src/tools/registry.js'
import type { RegisteredTool, ToolResult } from '../../src/tools/types.js'

function makeTool(name: string, result: ToolResult): RegisteredTool {
  return {
    definition: {
      name,
      description: `${name} description`,
      parameters: { type: 'object', properties: { x: { type: 'string' } } },
    },
    execute: async () => result,
  }
}

describe('ToolRegistry', () => {
  let registry: ToolRegistry

  beforeEach(() => {
    registry = new ToolRegistry()
  })

  it('registers and counts tools', () => {
    registry.register(makeTool('a', { success: true, data: 1 }))
    registry.register(makeTool('b', { success: true, data: 2 }))
    expect(registry.count()).toBe(2)
    expect(registry.has('a')).toBe(true)
    expect(registry.has('z')).toBe(false)
  })

  it('dispatch returns success result', async () => {
    registry.register(makeTool('echo', { success: true, data: 'ok' }))
    const result = await registry.dispatch('echo', {})
    expect(result.success).toBe(true)
    expect(result.data).toBe('ok')
  })

  it('dispatch returns error for unknown tool — never throws', async () => {
    const result = await registry.dispatch('nonexistent', {})
    expect(result.success).toBe(false)
    expect(result.error).toContain('Unknown tool')
  })

  it('dispatch catches thrown errors — never throws', async () => {
    const throwing: RegisteredTool = {
      definition: { name: 'boom', description: '', parameters: { type: 'object', properties: {} } },
      execute: async () => { throw new Error('exploded') },
    }
    registry.register(throwing)
    const result = await registry.dispatch('boom', {})
    expect(result.success).toBe(false)
    expect(result.error).toContain('exploded')
  })

  it('getAll returns all tools', () => {
    registry.register(makeTool('x', { success: true, data: null }))
    registry.register(makeTool('y', { success: true, data: null }))
    expect(registry.getAll()).toHaveLength(2)
  })

  it('formatNative returns tool definitions', () => {
    registry.register(makeTool('search', { success: true, data: null }))
    const defs = registry.formatNative()
    expect(defs[0]!.name).toBe('search')
  })

  it('formatForPrompt includes tool names', () => {
    registry.register(makeTool('calculator', { success: true, data: null }))
    const prompt = registry.formatForPrompt()
    expect(prompt).toContain('calculator')
    expect(prompt).toContain('<tool>')
  })

  it('formatForPrompt returns empty string when no tools', () => {
    expect(registry.formatForPrompt()).toBe('')
  })
})
