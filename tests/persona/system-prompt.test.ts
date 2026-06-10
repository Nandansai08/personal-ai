import { describe, it, expect } from 'vitest'
import {
  buildSystemPrompt, estimateTokens, trimMemoriesIfNeeded, isGemma3Model
} from '../../src/persona/system-prompt.js'
import type { PersonaConfig, ProfileConfig } from '../../src/persona/types.js'
import type { Memory } from '../../src/memory/types.js'

const persona: PersonaConfig = {
  name: 'Aria',
  user_name: 'Alex',
  tone: 'direct, concise',
  expertise: ['software development'],
  avoid: ['Certainly!'],
  custom_instructions: 'Give concrete steps.',
}

const profile: ProfileConfig = {
  name: 'Assistant',
  description: 'General',
  system_addon: '',
  preferred_model: 'qwen2.5:14b',
  tools_priority: [],
  temperature: 0.7,
}

const coderProfile: ProfileConfig = {
  ...profile,
  name: 'Coder',
  system_addon: 'Write complete code.',
  preferred_model: 'qwen2.5-coder:7b',
  temperature: 0.3,
}

const memories: Memory[] = [
  {
    id: '1', content: 'User prefers TypeScript', type: 'preference',
    tags: [], importance: 8, access_count: 0,
    created_at: new Date().toISOString(), last_accessed: new Date().toISOString(), archived: false,
  },
]

describe('estimateTokens', () => {
  it('estimates roughly 4 chars per token', () => {
    expect(estimateTokens('hello')).toBe(2)
    expect(estimateTokens('a'.repeat(400))).toBe(100)
  })
})

describe('isGemma3Model', () => {
  it('detects gemma3 models', () => {
    expect(isGemma3Model('gemma3:12b')).toBe(true)
    expect(isGemma3Model('gemma3n:4b')).toBe(true)
    expect(isGemma3Model('phi4:latest')).toBe(true)
    expect(isGemma3Model('qwen2.5:14b')).toBe(false)
  })
})

describe('buildSystemPrompt — markdown (qwen)', () => {
  it('contains persona name', () => {
    const p = buildSystemPrompt(persona, profile, [], '', new Date(), false)
    expect(p).toContain('Aria')
  })

  it('contains user name', () => {
    const p = buildSystemPrompt(persona, profile, [], '', new Date(), false)
    expect(p).toContain('Alex')
  })

  it('contains profile system_addon', () => {
    const p = buildSystemPrompt(persona, coderProfile, [], '', new Date(), false)
    expect(p).toContain('Write complete code')
  })

  it('injects memories', () => {
    const p = buildSystemPrompt(persona, profile, memories, '', new Date(), false)
    expect(p).toContain('TypeScript')
  })

  it('puts tools section last', () => {
    const p = buildSystemPrompt(persona, profile, [], 'TOOLS_HERE', new Date(), false)
    expect(p.endsWith('TOOLS_HERE')).toBe(true)
  })

  it('stays under 2000 tokens', () => {
    const p = buildSystemPrompt(persona, profile, memories, '', new Date(), false)
    expect(estimateTokens(p)).toBeLessThanOrEqual(2000)
  })
})

describe('buildSystemPrompt — gemma3 format', () => {
  it('uses numbered list not markdown headers', () => {
    const p = buildSystemPrompt(persona, profile, [], '', new Date(), true)
    expect(p).not.toContain('##')
    expect(p).toMatch(/\d+\./)
  })

  it('stays under 1500 tokens', () => {
    const p = buildSystemPrompt(persona, profile, memories, '', new Date(), true)
    expect(estimateTokens(p)).toBeLessThanOrEqual(1500)
  })
})

describe('trimMemoriesIfNeeded', () => {
  it('returns all memories when prompt fits', () => {
    const result = trimMemoriesIfNeeded(memories, 'short prompt', 2000)
    expect(result).toHaveLength(1)
  })

  it('trims when over limit', () => {
    const bigPrompt = 'x'.repeat(7900) // ~1975 tokens; memory adds ~7 → 1982 > 1980 limit
    const result = trimMemoriesIfNeeded(memories, bigPrompt, 1980)
    expect(result).toHaveLength(0)
  })

  it('keeps high importance memories first', () => {
    const mems: Memory[] = [
      { ...memories[0]!, id: '1', importance: 3, content: 'low' },
      { ...memories[0]!, id: '2', importance: 9, content: 'high' },
    ]
    const result = trimMemoriesIfNeeded(mems, '', 2000)
    expect(result[0]!.content).toBe('high')
  })
})
