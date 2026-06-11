// MIT License — personal-ai
import { describe, it, expect } from 'vitest'
import { ToolRegistry } from '../../src/tools/registry.js'
import type { RegisteredTool } from '../../src/tools/types.js'

function makeTool(requiresConfirmation: boolean): RegisteredTool {
  return {
    requiresConfirmation,
    definition: {
      name: 'danger',
      description: 'test tool',
      parameters: { type: 'object', properties: {} },
    },
    async execute() { return { success: true, data: 'ran' } },
  }
}

describe('tool confirmation gate', () => {
  it('denies a dangerous tool when handler returns false', async () => {
    const reg = new ToolRegistry()
    reg.register(makeTool(true))
    reg.setConfirmHandler(async () => false)
    const r = await reg.dispatch('danger', {})
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/denied/i)
  })

  it('runs a dangerous tool when handler approves', async () => {
    const reg = new ToolRegistry()
    reg.register(makeTool(true))
    reg.setConfirmHandler(async () => true)
    const r = await reg.dispatch('danger', {})
    expect(r.success).toBe(true)
    expect(r.data).toBe('ran')
  })

  it('does not consult handler for safe tools', async () => {
    const reg = new ToolRegistry()
    reg.register(makeTool(false))
    let asked = false
    reg.setConfirmHandler(async () => { asked = true; return false })
    const r = await reg.dispatch('danger', {})
    expect(r.success).toBe(true)
    expect(asked).toBe(false)
  })

  it('runs dangerous tools unconfirmed when no handler installed (legacy)', async () => {
    const reg = new ToolRegistry()
    reg.register(makeTool(true))
    const r = await reg.dispatch('danger', {})
    expect(r.success).toBe(true)
  })
})
