// MIT License — personal-ai
import { describe, it, expect } from 'vitest'
import { detectMemoryIntent, normalizeFact, categorizeFact, extractTags } from '../../src/memory/intent.js'
import { AssistantEngine } from '../../src/core/assistant.js'
import { ConversationContext } from '../../src/core/context.js'
import { LongTermMemory } from '../../src/memory/long-term.js'
import type { LLMProvider, ChatChunk, ChatRequest } from '../../src/providers/interface.js'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

describe('detectMemoryIntent', () => {
  it('detects "remember my name is Nandan"', () => {
    const i = detectMemoryIntent('remember my name is Nandan')
    expect(i).not.toBeNull()
    expect(i!.fact).toBe("User's name is Nandan")
    expect(i!.type).toBe('personal')
    expect(i!.importance).toBe(9)
    expect(i!.confirmation).toContain('your name is Nandan')
  })

  it('detects "remember i study CSE at IIT Dhanbad"', () => {
    const i = detectMemoryIntent('remember i study CSE at IIT Dhanbad')
    expect(i).not.toBeNull()
    expect(i!.fact).toBe('User studies CSE at IIT Dhanbad')
    expect(i!.type).toBe('education')
    expect(i!.importance).toBeGreaterThanOrEqual(8)
    expect(i!.tags).toContain('education')
    expect(i!.tags).toContain('cse')
    expect(i!.tags).toContain('iit-dhanbad')
  })

  it('detects "remember i am in 2nd year"', () => {
    const i = detectMemoryIntent('remember i am in 2nd year')
    expect(i).not.toBeNull()
    expect(i!.fact).toBe('User is in 2nd year')
    expect(i!.type).toBe('education')
  })

  it('detects "don\'t forget that i prefer TypeScript"', () => {
    const i = detectMemoryIntent("don't forget that i prefer TypeScript")
    expect(i).not.toBeNull()
    expect(i!.fact).toBe('User prefers TypeScript')
    expect(i!.type).toBe('preference')
    expect(i!.tags).toContain('typescript')
  })

  it('detects "save this: PersonalAI is my main project"', () => {
    const i = detectMemoryIntent('save this: PersonalAI is my main project')
    expect(i).not.toBeNull()
    expect(i!.fact).toContain('PersonalAI')
    expect(i!.type).toBe('project')
  })

  it('detects the full IIT Dhanbad example with composite info', () => {
    const i = detectMemoryIntent('remember i am studying in CSE, IIT Dhanbad, 2nd year')
    expect(i).not.toBeNull()
    expect(i!.fact).toContain('CSE')
    expect(i!.fact).toContain('IIT Dhanbad')
    expect(i!.fact).toMatch(/^User/)
    expect(i!.type).toBe('education')
  })

  it('returns null for normal chat', () => {
    expect(detectMemoryIntent('what is the weather today?')).toBeNull()
    expect(detectMemoryIntent('can you remind me how loops work')).toBeNull()
    expect(detectMemoryIntent('I remember that movie fondly')).toBeNull() // not at start
  })

  it('supports keep in mind / you should know / note that', () => {
    expect(detectMemoryIntent('keep in mind that i live in Hyderabad')!.fact).toBe('User lives in Hyderabad')
    expect(detectMemoryIntent('you should know i work at Google')!.fact).toBe('User works at Google')
    expect(detectMemoryIntent('note that i use vim')!.fact).toBe('User uses vim')
  })
})

describe('normalizeFact', () => {
  it('rewrites first person to third person', () => {
    expect(normalizeFact('my name is Nandan')).toBe("User's name is Nandan")
    expect(normalizeFact('i am studying CSE at IIT Dhanbad')).toBe('User studies CSE at IIT Dhanbad')
    expect(normalizeFact('my favorite language is TypeScript')).toBe("User's favorite language is TypeScript")
    expect(normalizeFact('i am a software engineer')).toBe('User is a software engineer')
  })

  it('strips trailing punctuation and collapses whitespace', () => {
    expect(normalizeFact('i   like   cricket!!')).toBe('User likes cricket')
  })
})

describe('categorizeFact', () => {
  it('assigns categories', () => {
    expect(categorizeFact('User studies CSE at IIT Dhanbad')).toBe('education')
    expect(categorizeFact('User works at Google')).toBe('career')
    expect(categorizeFact('User is building a startup project')).toBe('project')
    expect(categorizeFact('User prefers TypeScript')).toBe('preference')
    expect(categorizeFact("User's name is Nandan")).toBe('personal')
    expect(categorizeFact('User has a red car')).toBe('fact')
  })
})

describe('extractTags', () => {
  it('includes category and entity tags', () => {
    const tags = extractTags('User studies CSE at IIT Dhanbad', 'education')
    expect(tags).toEqual(expect.arrayContaining(['education', 'cse', 'iit-dhanbad']))
  })
})

describe('engine short-circuits on memory intent', () => {
  it('saves memory and yields confirmation without calling the provider', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pai-intent-'))
    const memory = new LongTermMemory(path.join(tmp, 'm.db'))
    let providerCalled = false
    const provider: LLMProvider = {
      name: 'fake', model: 'm', supportsToolUse: false, supportsStreaming: true,
      async *chat(_r: ChatRequest): AsyncGenerator<ChatChunk> {
        providerCalled = true
        yield { type: 'done' }
      },
    }
    const context = new ConversationContext()
    const engine = new AssistantEngine({ provider, getSystemPrompt: () => '', memory, context })

    const chunks: ChatChunk[] = []
    for await (const c of engine.chat('remember i am studying in CSE, IIT Dhanbad, 2nd year')) chunks.push(c)

    expect(providerCalled).toBe(false)
    const text = chunks.find(c => c.type === 'text') as { delta: string }
    expect(text.delta).toMatch(/^✓ I've remembered/)

    const saved = memory.search('CSE Dhanbad')
    expect(saved.length).toBeGreaterThan(0)
    expect(saved[0]!.content).toMatch(/^User/)
    expect(saved[0]!.type).toBe('education')
    expect(saved[0]!.importance).toBeGreaterThanOrEqual(8)

    memory.close()
    fs.rmSync(tmp, { recursive: true, force: true })
  })
})
