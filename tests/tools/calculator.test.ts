import { describe, it, expect } from 'vitest'
import { calculatorTool } from '../../src/tools/calculator.js'

describe('calculatorTool', () => {
  it('evaluates basic arithmetic', async () => {
    const r = await calculatorTool.execute({ expression: '2 + 3' })
    expect(r.success).toBe(true)
    expect((r.data as Record<string, unknown>)['result']).toBe(5)
  })

  it('evaluates complex expression', async () => {
    const r = await calculatorTool.execute({ expression: '(10 + 5) * 2 / 3' })
    expect(r.success).toBe(true)
    expect((r.data as Record<string, unknown>)['result']).toBeCloseTo(10)
  })

  it('handles modulo', async () => {
    const r = await calculatorTool.execute({ expression: '17 % 5' })
    expect((r.data as Record<string, unknown>)['result']).toBe(2)
  })

  it('rejects expression with forbidden chars', async () => {
    const r = await calculatorTool.execute({ expression: 'process.exit(1)' })
    expect(r.success).toBe(false)
    expect(r.error).toContain('Invalid characters')
  })

  it('rejects empty expression', async () => {
    const r = await calculatorTool.execute({ expression: '' })
    expect(r.success).toBe(false)
  })

  it('handles division', async () => {
    const r = await calculatorTool.execute({ expression: '100 / 4' })
    expect((r.data as Record<string, unknown>)['result']).toBe(25)
  })
})
