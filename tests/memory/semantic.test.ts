// MIT License — personal-ai
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import Database from 'better-sqlite3'
import { LongTermMemory } from '../../src/memory/long-term.js'
import { cosineSimilarity } from '../../src/memory/embeddings.js'
import type { Embedder } from '../../src/memory/embeddings.js'

/**
 * Deterministic fake embedder: bag-of-words over a fixed vocabulary.
 * Sentences sharing words get high cosine similarity — no network needed.
 */
const VOCAB = [
  'cricket', 'ipl', 'sport', 'match', 'typescript', 'javascript', 'code',
  'programming', 'iit', 'dhanbad', 'cse', 'student', 'studies', 'college',
  'name', 'nandan', 'user', 'food', 'biryani', 'likes', 'plays', 'watches',
]
const fakeEmbedder: Embedder = {
  name: 'fake/bow',
  async embed(text: string): Promise<number[]> {
    const words = text.toLowerCase().split(/\W+/)
    return VOCAB.map(v => words.filter(w => w === v).length)
  },
}

let tmpDir: string
let memory: LongTermMemory

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pai-sem-'))
  memory = new LongTermMemory(path.join(tmpDir, 'sem.db'))
  memory.setEmbedder(fakeEmbedder)
})

afterEach(() => {
  memory.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('cosineSimilarity', () => {
  it('is 1 for identical vectors, 0 for orthogonal', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1)
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0)
    expect(cosineSimilarity([], [])).toBe(0)
    expect(cosineSimilarity([1], [1, 2])).toBe(0)
  })
})

describe('semantic retrieval', () => {
  it('retrieves by meaning-adjacent words, ranked by similarity', async () => {
    await memory.saveSmart({ content: 'User watches cricket and the IPL', type: 'preference', importance: 5 })
    await memory.saveSmart({ content: 'User studies CSE at IIT Dhanbad', type: 'education', importance: 5 })
    await memory.saveSmart({ content: 'User likes biryani food', type: 'preference', importance: 5 })

    const results = await memory.searchSemantic('cricket match sport', 3)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0]!.content).toContain('cricket')
  })

  it('hybrid ranking boosts importance between similar candidates', async () => {
    await memory.saveSmart({ content: 'User plays cricket', type: 'fact', importance: 1 })
    await memory.saveSmart({ content: 'User watches cricket', type: 'fact', importance: 10 })

    const results = await memory.searchSemantic('cricket', 2)
    expect(results).toHaveLength(2)
    expect(results[0]!.importance).toBe(10)
  })

  it('searchSmart falls back to keyword search without an embedder', async () => {
    memory.setEmbedder(undefined)
    memory.save({ content: 'User prefers TypeScript over JavaScript', type: 'preference', importance: 7 })
    const results = await memory.searchSmart('something about typescript maybe')
    expect(results.some(m => m.content.includes('TypeScript'))).toBe(true)
  })
})

describe('semantic deduplication', () => {
  it('merges near-identical memories instead of storing duplicates', async () => {
    const a = await memory.saveSmart({ content: 'User studies CSE at IIT Dhanbad', type: 'education', importance: 5 })
    // Different wording, same meaning (same vocab hits → high cosine)
    const b = await memory.saveSmart({ content: 'User studies CSE in IIT Dhanbad', type: 'education', importance: 8 })
    expect(b.deduped).toBe(true)
    expect(b.memory.id).toBe(a.memory.id)
    expect(b.memory.importance).toBe(8) // max-merged
    expect(memory.getStats().total).toBe(1)
  })

  it('stores genuinely different memories separately', async () => {
    const a = await memory.saveSmart({ content: 'User watches cricket', type: 'preference', importance: 5 })
    const b = await memory.saveSmart({ content: 'User likes biryani food', type: 'preference', importance: 5 })
    expect(b.deduped).toBe(false)
    expect(b.memory.id).not.toBe(a.memory.id)
    expect(memory.getStats().total).toBe(2)
  })
})

describe('index rebuild and stats', () => {
  it('rebuildIndex embeds existing keyword-only memories', async () => {
    memory.setEmbedder(undefined)
    memory.save({ content: 'User plays cricket', type: 'fact', importance: 5 })
    memory.save({ content: 'User studies at IIT Dhanbad', type: 'education', importance: 5 })
    expect(memory.getIndexStats().indexed).toBe(0)

    memory.setEmbedder(fakeEmbedder)
    const n = await memory.rebuildIndex()
    expect(n).toBe(2)
    expect(memory.getIndexStats().indexed).toBe(2)

    const results = await memory.searchSemantic('cricket sport', 2)
    expect(results[0]!.content).toContain('cricket')
  })
})

describe('migration — existing databases keep working', () => {
  it('opens a pre-embeddings database and adds the vector table', () => {
    const oldDb = path.join(tmpDir, 'old.db')
    // Simulate a database created before the embeddings milestone
    const raw = new Database(oldDb)
    raw.exec(`
      CREATE TABLE memories (
        id TEXT PRIMARY KEY, content TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'fact',
        tags TEXT NOT NULL DEFAULT '[]', importance INTEGER NOT NULL DEFAULT 5,
        access_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
        last_accessed TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO memories VALUES ('m1', 'User plays cricket', 'fact', '[]', 5, 0, '2025-01-01', '2025-01-01', 0);
    `)
    raw.close()

    const migrated = new LongTermMemory(oldDb)
    expect(migrated.getStats().total).toBe(1)           // old data intact
    expect(migrated.getIndexStats().indexed).toBe(0)    // vector table exists, empty
    expect(migrated.search('cricket')[0]!.content).toContain('cricket')
    migrated.close()
  })
})

describe('summarization', () => {
  it('summarizes low-value memories and archives the originals', async () => {
    for (let i = 0; i < 12; i++) {
      memory.save({ content: `User mentioned trivial detail number ${i}`, type: 'context', importance: 2 })
    }
    const before = memory.getStats().total
    expect(before).toBe(12)

    const result = await memory.summarizeLowValue(async prompt => {
      expect(prompt).toContain('trivial detail')
      return 'User mentioned twelve trivial details across conversations.'
    }, { minCount: 10 })

    expect(result.summarized).toBe(12)
    expect(result.summary).not.toBeNull()
    expect(result.summary!.tags).toContain('summary')
    // 12 archived + 1 summary remaining active
    expect(memory.getStats().total).toBe(1)
  })

  it('does nothing below the minimum count', async () => {
    memory.save({ content: 'Single trivial note', type: 'context', importance: 1 })
    const result = await memory.summarizeLowValue(async () => 'should not be called', { minCount: 10 })
    expect(result.summarized).toBe(0)
    expect(memory.getStats().total).toBe(1)
  })
})
