import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { LongTermMemory } from '../../src/memory/long-term.js'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'

function tmpDb(): string {
  return path.join(os.tmpdir(), `personal-ai-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
}

describe('LongTermMemory', () => {
  let db: string
  let mem: LongTermMemory

  beforeEach(() => {
    db = tmpDb()
    mem = new LongTermMemory(db)
  })

  afterEach(() => {
    mem.close()
    if (fs.existsSync(db)) fs.unlinkSync(db)
  })

  it('save and retrieve by search', () => {
    mem.save({ content: 'I prefer dark mode', type: 'preference', importance: 7 })
    const results = mem.search('dark mode')
    expect(results.length).toBe(1)
    expect(results[0]!.content).toBe('I prefer dark mode')
    expect(results[0]!.type).toBe('preference')
  })

  it('search returns empty for no match', () => {
    mem.save({ content: 'I like coffee', type: 'preference' })
    expect(mem.search('python').length).toBe(0)
  })

  it('no duplicate on same content — updates importance', () => {
    mem.save({ content: 'I like TypeScript', type: 'preference', importance: 5 })
    mem.save({ content: 'I like TypeScript', type: 'preference', importance: 9 })
    const all = mem.getAll()
    expect(all.length).toBe(1)
    expect(all[0]!.importance).toBe(9)
  })

  it('getByType filters correctly', () => {
    mem.save({ content: 'My name is Nandan', type: 'fact', importance: 9 })
    mem.save({ content: 'I prefer vim', type: 'preference', importance: 6 })
    expect(mem.getByType('fact').length).toBe(1)
    expect(mem.getByType('preference').length).toBe(1)
    expect(mem.getByType('context').length).toBe(0)
  })

  it('getRecent returns newest first', () => {
    mem.save({ content: 'first', type: 'fact' })
    mem.save({ content: 'second', type: 'fact' })
    const recent = mem.getRecent(2)
    expect(recent[0]!.content).toBe('second')
  })

  it('archive hides from search and getAll', () => {
    const saved = mem.save({ content: 'temporary note', type: 'context' })
    mem.archive(saved.id)
    expect(mem.search('temporary').length).toBe(0)
    expect(mem.getAll().length).toBe(0)
  })

  it('incrementAccess bumps access_count', () => {
    const saved = mem.save({ content: 'access test', type: 'fact' })
    mem.incrementAccess(saved.id)
    mem.incrementAccess(saved.id)
    const results = mem.search('access test')
    expect(results[0]!.access_count).toBe(2) // 2 manual + 1 from search = but search runs after fetch
  })

  it('getStats returns correct counts', () => {
    mem.save({ content: 'fact one', type: 'fact', importance: 8 })
    mem.save({ content: 'pref one', type: 'preference', importance: 6 })
    mem.save({ content: 'pref two', type: 'preference', importance: 4 })
    const stats = mem.getStats()
    expect(stats.total).toBe(3)
    expect(stats.byType.fact).toBe(1)
    expect(stats.byType.preference).toBe(2)
    expect(stats.avgImportance).toBeCloseTo(6, 0)
  })

  it('getAll respects limit', () => {
    for (let i = 0; i < 5; i++) mem.save({ content: `item ${i}`, type: 'fact' })
    expect(mem.getAll(3).length).toBe(3)
  })
})
