// MIT License — personal-ai
import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { eventBus } from '../core/events.js'
import { logger } from '../core/logger.js'
import type { Memory, NewMemory, MemoryStats, MemoryType } from './types.js'

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

  constructor(dbPath = DB_PATH) {
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true })
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.migrate()
    logger.debug('memory', `SQLite opened: ${dbPath}`)
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

  /** Save new memory. Never duplicate exact content. */
  save(input: NewMemory): Memory {
    const now = new Date().toISOString()
    const id  = uuidv4()
    const tags = JSON.stringify(input.tags ?? [])
    const importance = input.importance ?? 5

    // Upsert by content — update importance/tags if exists
    const existing = this.db
      .prepare('SELECT * FROM memories WHERE content = ? AND archived = 0')
      .get(input.content) as MemoryRow | undefined

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
    `).run(id, input.content, input.type, tags, importance, now, now)

    eventBus.emit('memory_saved', { type: input.type, importance })
    logger.debug('memory', `saved [${input.type}] importance=${importance}: ${input.content.slice(0, 60)}`)

    return this.db.prepare('SELECT * FROM memories WHERE id = ?').get(id) as unknown as Memory
  }

  /** LIKE search across content. */
  search(query: string, limit = 8): Memory[] {
    const pattern = `%${query}%`
    const rows = this.db.prepare(`
      SELECT * FROM memories
      WHERE content LIKE ? AND archived = 0
      ORDER BY importance DESC, last_accessed DESC
      LIMIT ?
    `).all(pattern, limit) as MemoryRow[]

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
      ORDER BY created_at DESC LIMIT ?
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

    const byType: Record<MemoryType, number> = { fact: 0, preference: 0, context: 0, episodic: 0 }
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

  close(): void {
    this.db.close()
  }
}
