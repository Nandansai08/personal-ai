// MIT License — personal-ai
import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { eventBus } from '../core/events.js'
import { logger } from '../core/logger.js'
import { MEMORY_TYPES } from './types.js'
import type { Memory, NewMemory, MemoryStats, MemoryType } from './types.js'
import { VectorStore } from './vector-store.js'
import type { Embedder } from './embeddings.js'

/** Cosine similarity above which two memories count as near-duplicates. */
const NEAR_DUP_THRESHOLD = 0.92

/** Hybrid retrieval weights: semantic 70%, importance 20%, recency 10%. */
const W_SEMANTIC = 0.7
const W_IMPORTANCE = 0.2
const W_RECENCY = 0.1

const DB_DIR  = path.join(os.homedir(), '.personal-ai')
const DB_PATH = path.join(DB_DIR, 'memory.db')

interface MemoryRow {
  id: string
  content: string
  type: string
  tags: string
  importance: number
  access_count: number
  created_at: string
  last_accessed: string
  archived: number
}

function rowToMemory(row: MemoryRow): Memory {
  return {
    id:            row.id,
    content:       row.content,
    type:          row.type as MemoryType,
    tags:          JSON.parse(row.tags) as string[],
    importance:    row.importance,
    access_count:  row.access_count,
    created_at:    row.created_at,
    last_accessed: row.last_accessed,
    archived:      row.archived === 1,
  }
}

export class LongTermMemory {
  private db: Database.Database
  private vectors: VectorStore
  private embedder: Embedder | undefined

  constructor(dbPath = DB_PATH) {
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true })
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.migrate()
    // VectorStore creates its side table on demand — existing DBs migrate
    // transparently and keep working without vectors.
    this.vectors = new VectorStore(this.db)
    logger.debug('memory', `SQLite opened: ${dbPath}`)
  }

  /** Enable semantic indexing/retrieval. Without an embedder, keyword search is used. */
  setEmbedder(embedder: Embedder | undefined): void {
    this.embedder = embedder
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id           TEXT PRIMARY KEY,
        content      TEXT NOT NULL,
        type         TEXT NOT NULL DEFAULT 'fact',
        tags         TEXT NOT NULL DEFAULT '[]',
        importance   INTEGER NOT NULL DEFAULT 5,
        access_count INTEGER NOT NULL DEFAULT 0,
        created_at   TEXT NOT NULL,
        last_accessed TEXT NOT NULL,
        archived     INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_type     ON memories(type);
      CREATE INDEX IF NOT EXISTS idx_archived ON memories(archived);
      CREATE INDEX IF NOT EXISTS idx_importance ON memories(importance);
    `)
  }

  /** Save new memory. Normalizes whitespace; never duplicates (case-insensitive). */
  save(input: NewMemory): Memory {
    const now = new Date().toISOString()
    const id  = randomUUID()
    const tags = JSON.stringify(input.tags ?? [])
    const importance = input.importance ?? 5

    // Normalize: trim + collapse internal whitespace so "a  b" === "a b"
    const content = input.content.trim().replace(/\s+/g, ' ')

    // Upsert by content (case-insensitive) — update importance if exists
    const existing = this.db
      .prepare('SELECT * FROM memories WHERE LOWER(content) = LOWER(?) AND archived = 0')
      .get(content) as MemoryRow | undefined

    if (existing) {
      this.db.prepare(`
        UPDATE memories SET importance = MAX(importance, ?), last_accessed = ? WHERE id = ?
      `).run(importance, now, existing.id)
      logger.debug('memory', `updated existing: ${existing.id}`)
      return rowToMemory({ ...existing, importance: Math.max(existing.importance, importance), last_accessed: now })
    }

    this.db.prepare(`
      INSERT INTO memories (id, content, type, tags, importance, access_count, created_at, last_accessed)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?)
    `).run(id, content, input.type, tags, importance, now, now)

    eventBus.emit('memory_saved', { type: input.type, importance })
    logger.debug('memory', `saved [${input.type}] importance=${importance}: ${input.content.slice(0, 60)}`)

    const row = this.db.prepare('SELECT * FROM memories WHERE id = ?').get(id) as MemoryRow
    return rowToMemory(row)
  }

  /**
   * Tokenized LIKE search: splits the query into words and ranks rows by how
   * many words match. A whole-sentence LIKE almost never matches, so this is
   * what makes retrieval actually work for conversational queries.
   */
  search(query: string, limit = 8): Memory[] {
    const words = query
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter(w => w.length >= 3)   // skip stopword-length noise
      .slice(0, 12)                 // cap clause count

    if (words.length === 0) return this.getRecent(limit)

    const clauses = words.map(() => '(CASE WHEN content LIKE ? THEN 1 ELSE 0 END)').join(' + ')
    const params  = words.map(w => `%${w}%`)
    const rows = this.db.prepare(`
      SELECT * FROM (
        SELECT *, (${clauses}) AS hits FROM memories WHERE archived = 0
      ) WHERE hits > 0
      ORDER BY hits DESC, importance DESC, last_accessed DESC
      LIMIT ?
    `).all(...params, limit) as MemoryRow[]

    const results = rows.map(rowToMemory)
    if (results.length > 0) this.incrementAccessBatch(results.map(m => m.id))

    eventBus.emit('memory_retrieved', { query, count: results.length })
    logger.debug('memory', `search "${query}" → ${results.length} results`)
    return results
  }

  getByType(type: MemoryType, limit = 20): Memory[] {
    const rows = this.db.prepare(`
      SELECT * FROM memories WHERE type = ? AND archived = 0
      ORDER BY importance DESC, last_accessed DESC LIMIT ?
    `).all(type, limit) as MemoryRow[]
    logger.debug('memory', `getByType ${type} → ${rows.length}`)
    return rows.map(rowToMemory)
  }

  getRecent(limit = 10): Memory[] {
    const rows = this.db.prepare(`
      SELECT * FROM memories WHERE archived = 0
      ORDER BY created_at DESC, ROWID DESC LIMIT ?
    `).all(limit) as MemoryRow[]
    logger.debug('memory', `getRecent → ${rows.length}`)
    return rows.map(rowToMemory)
  }

  getAll(limit = 100): Memory[] {
    const rows = this.db.prepare(`
      SELECT * FROM memories WHERE archived = 0
      ORDER BY importance DESC, last_accessed DESC LIMIT ?
    `).all(limit) as MemoryRow[]
    return rows.map(rowToMemory)
  }

  /** Soft-delete — never hard delete per spec. */
  archive(id: string): void {
    this.db.prepare('UPDATE memories SET archived = 1 WHERE id = ?').run(id)
    logger.debug('memory', `archived: ${id}`)
  }

  incrementAccess(id: string): void {
    const now = new Date().toISOString()
    this.db.prepare(`
      UPDATE memories SET access_count = access_count + 1, last_accessed = ? WHERE id = ?
    `).run(now, id)
  }

  private incrementAccessBatch(ids: string[]): void {
    const now = new Date().toISOString()
    const update = this.db.prepare(
      'UPDATE memories SET access_count = access_count + 1, last_accessed = ? WHERE id = ?'
    )
    const tx = this.db.transaction((list: string[]) => {
      for (const id of list) update.run(now, id)
    })
    tx(ids)
  }

  getStats(): MemoryStats {
    const total = (this.db.prepare('SELECT COUNT(*) as n FROM memories WHERE archived = 0').get() as { n: number }).n

    const byTypeRows = this.db.prepare(`
      SELECT type, COUNT(*) as n FROM memories WHERE archived = 0 GROUP BY type
    `).all() as Array<{ type: string; n: number }>

    const byType = Object.fromEntries(MEMORY_TYPES.map(t => [t, 0])) as Record<MemoryType, number>
    for (const r of byTypeRows) byType[r.type as MemoryType] = r.n

    const avgRow = this.db.prepare(
      'SELECT AVG(importance) as avg FROM memories WHERE archived = 0'
    ).get() as { avg: number | null }

    const topRow = this.db.prepare(`
      SELECT * FROM memories WHERE archived = 0 ORDER BY access_count DESC LIMIT 1
    `).get() as MemoryRow | undefined

    return {
      total,
      byType,
      avgImportance: Math.round((avgRow.avg ?? 0) * 10) / 10,
      mostAccessed: topRow ? rowToMemory(topRow) : null,
    }
  }

  getById(id: string): Memory | null {
    const row = this.db.prepare('SELECT * FROM memories WHERE id = ?').get(id) as MemoryRow | undefined
    return row ? rowToMemory(row) : null
  }

  // ── Semantic layer (M-embeddings) ───────────────────────────────────────

  /**
   * Save with semantic dedup: a new memory whose embedding is ≥ 0.92 cosine
   * similar to an existing one merges into it (importance max-merged) instead
   * of creating a near-identical row. Falls back to plain save() when no
   * embedder is available.
   */
  async saveSmart(input: NewMemory): Promise<{ memory: Memory; deduped: boolean }> {
    if (!this.embedder) return { memory: this.save(input), deduped: false }

    const vector = await this.embedder.embed(input.content)
    if (!vector) return { memory: this.save(input), deduped: false }

    const [nearest] = this.vectors.search(vector, 1)
    if (nearest && nearest.similarity >= NEAR_DUP_THRESHOLD) {
      const existing = this.getById(nearest.memoryId)
      if (existing) {
        const importance = Math.max(existing.importance, input.importance ?? 5)
        this.db.prepare('UPDATE memories SET importance = ?, last_accessed = ? WHERE id = ?')
          .run(importance, new Date().toISOString(), existing.id)
        logger.debug('memory', `near-dup (${nearest.similarity.toFixed(3)}) merged into ${existing.id}`)
        return { memory: { ...existing, importance }, deduped: true }
      }
    }

    const memory = this.save(input)
    this.vectors.put(memory.id, vector, this.embedder.name)
    return { memory, deduped: false }
  }

  /**
   * Hybrid semantic search: 70% cosine similarity, 20% importance, 10% recency.
   * Falls back to tokenized keyword search when embeddings are unavailable.
   */
  async searchSemantic(query: string, limit = 8): Promise<Memory[]> {
    if (!this.embedder || this.vectors.count() === 0) return this.search(query, limit)

    const queryVec = await this.embedder.embed(query)
    if (!queryVec) return this.search(query, limit)

    const candidates = this.vectors.search(queryVec, limit * 3)
    const now = Date.now()
    const scored = candidates
      .map(c => {
        const memory = this.getById(c.memoryId)
        if (!memory || memory.archived) return null
        const ageDays = (now - new Date(memory.last_accessed).getTime()) / 86_400_000
        const recency = Math.exp(-ageDays / 30)
        const score = W_SEMANTIC * c.similarity
                    + W_IMPORTANCE * (memory.importance / 10)
                    + W_RECENCY * recency
        return { memory, score }
      })
      .filter((x): x is { memory: Memory; score: number } => x !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)

    const results = scored.map(s => s.memory)
    if (results.length > 0) this.incrementAccessBatch(results.map(m => m.id))
    eventBus.emit('memory_retrieved', { query, count: results.length })
    logger.debug('memory', `semantic search "${query.slice(0, 40)}" → ${results.length}`)
    return results
  }

  /** Semantic when available, keyword otherwise — the engine's entry point. */
  async searchSmart(query: string, limit = 8): Promise<Memory[]> {
    if (this.embedder && this.vectors.count() > 0) return this.searchSemantic(query, limit)
    return this.search(query, limit)
  }

  /** Re-embed every active memory. Returns how many were indexed. */
  async rebuildIndex(onProgress?: (done: number, total: number) => void): Promise<number> {
    if (!this.embedder) return 0
    const all = this.getAll(10_000)
    let done = 0
    for (const m of all) {
      const vec = await this.embedder.embed(m.content)
      if (vec) { this.vectors.put(m.id, vec, this.embedder.name); done++ }
      onProgress?.(done, all.length)
    }
    logger.debug('memory', `rebuilt vector index: ${done}/${all.length}`)
    return done
  }

  /** Vector index stats for /memory stats. */
  getIndexStats(): { indexed: number; embedder: string | null } {
    return { indexed: this.vectors.count(), embedder: this.embedder?.name ?? null }
  }

  /**
   * Summarize low-value memories (importance ≤ 3, never accessed) into a
   * single summary memory and archive the originals. `generate` is any
   * text-in/text-out function — provider-blind by design.
   */
  async summarizeLowValue(
    generate: (prompt: string) => Promise<string>,
    opts: { minCount?: number; maxImportance?: number } = {},
  ): Promise<{ summarized: number; summary: Memory | null }> {
    const minCount = opts.minCount ?? 10
    const maxImportance = opts.maxImportance ?? 3

    const rows = this.db.prepare(`
      SELECT * FROM memories
      WHERE archived = 0 AND importance <= ? AND access_count = 0
      ORDER BY created_at ASC
    `).all(maxImportance) as MemoryRow[]

    if (rows.length < minCount) return { summarized: 0, summary: null }

    const list = rows.map(r => `- ${r.content}`).join('\n')
    const prompt = `Summarize these minor facts about the user into one short paragraph. Keep every distinct fact:\n${list}`
    const text = (await generate(prompt)).trim()
    if (!text) return { summarized: 0, summary: null }

    const summary = this.save({ content: text, type: 'context', importance: 5, tags: ['summary'] })
    const archive = this.db.prepare('UPDATE memories SET archived = 1 WHERE id = ?')
    const tx = this.db.transaction((ids: string[]) => { for (const id of ids) archive.run(id) })
    tx(rows.map(r => r.id))

    logger.debug('memory', `summarized ${rows.length} low-value memories into ${summary.id}`)
    return { summarized: rows.length, summary }
  }

  close(): void {
    this.db.close()
  }
}
