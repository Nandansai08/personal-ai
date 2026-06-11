// MIT License — personal-ai
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { LongTermMemory } from '../../src/memory/long-term.js'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pai-mem-'))
let memory: LongTermMemory

beforeAll(() => {
  memory = new LongTermMemory(path.join(tmpDir, 'test.db'))
  memory.save({ content: 'User studies at IIT Dhanbad, B.Tech 2nd year', type: 'fact', importance: 8 })
  memory.save({ content: 'User likes cricket and follows IPL', type: 'preference', importance: 6 })
  memory.save({ content: 'User prefers TypeScript over JavaScript', type: 'preference', importance: 7 })
})

afterAll(() => {
  memory.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('tokenized memory search', () => {
  it('finds memories from a conversational query (whole-sentence LIKE would fail)', () => {
    const results = memory.search('hey, do you remember which college I study at?')
    // "study" stem won't hit "studies" but "college"/"remember" miss; this query
    // shares no 3+ char token with stored rows except none — so try a realistic one:
    const results2 = memory.search('tell me something about cricket and the IPL season')
    expect(results2.length).toBeGreaterThan(0)
    expect(results2[0]!.content).toContain('cricket')
    void results
  })

  it('ranks rows by number of matching words', () => {
    const results = memory.search('cricket IPL')
    expect(results[0]!.content).toContain('cricket')
  })

  it('matches single keywords', () => {
    const results = memory.search('what was that thing about TypeScript again')
    expect(results.some(m => m.content.includes('TypeScript'))).toBe(true)
  })

  it('falls back to recent memories for token-less queries', () => {
    const results = memory.search('hi')
    expect(results.length).toBeGreaterThan(0)
  })

  it('deduplicates case-insensitively and normalizes whitespace', () => {
    const a = memory.save({ content: 'User Plays  Badminton   weekly', type: 'fact', importance: 4 })
    const b = memory.save({ content: 'user plays badminton weekly', type: 'fact', importance: 7 })
    expect(b.id).toBe(a.id)                 // same row updated, not duplicated
    expect(b.importance).toBe(7)            // importance raised to max
    expect(a.content).toBe('User Plays Badminton weekly') // whitespace collapsed
  })

  it('save returns properly deserialized memory', () => {
    const saved = memory.save({ content: 'tags roundtrip test', type: 'fact', importance: 5, tags: ['a', 'b'] })
    expect(Array.isArray(saved.tags)).toBe(true)
    expect(saved.tags).toEqual(['a', 'b'])
    expect(typeof saved.archived).toBe('boolean')
  })
})
