// MIT License — personal-ai

import type { RegisteredTool, ToolResult } from './types.js'

const ALLOWED = /^[\d\s+\-*/%.()e,Ee]+$/

/**
 * Safe expression evaluator. Only allows numeric chars + basic operators.
 * No eval of arbitrary code.
 */
function safeEval(expr: string): number {
  const cleaned = expr.replace(/\s/g, '')
  if (!ALLOWED.test(cleaned)) {
    throw new Error(`Invalid characters in expression: ${expr}`)
  }
  // Use Function constructor with numeric-only whitelist validated above
   
  const result = new Function(`"use strict"; return (${cleaned})`)() as unknown
  if (typeof result !== 'number' || !isFinite(result)) {
    throw new Error(`Expression did not evaluate to a finite number: ${expr}`)
  }
  return result
}

export const calculatorTool: RegisteredTool = {
  definition: {
    name: 'calculator',
    description: 'Evaluate math expression.',
    parameters: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'e.g. "(2+3)*4"' },
      },
      required: ['expression'],
    },
  },
  async execute(args: unknown): Promise<ToolResult> {
    const a = args as Record<string, unknown>
    const expression = String(a['expression'] ?? '').trim()
    if (!expression) return { success: false, data: null, error: 'expression required' }

    try {
      const result = safeEval(expression)
      return { success: true, data: { expression, result } }
    } catch (err) {
      return { success: false, data: null, error: String(err) }
    }
  },
}
