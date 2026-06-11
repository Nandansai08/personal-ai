// MIT License — personal-ai
// SQLite-backed vector store. Vectors live in a side table keyed by memory id
// — existing databases keep working; the table is created on demand.

import type Database from 'better-sqlite3'
import { cosineSimilarity } from './embeddings.js'

export interface ScoredId {
  memoryId: string
  similarity: number
}

export class VectorStore {
  constructor(private db: Database.Database) {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memory_vectors (
        memory_id TEXT PRIMARY KEY,
        model     TEXT NOT NULL,
        dims      INTEGER NOT NULL,
        vector    BLOB NOT NULL
      );
    `)
  }

  put(memoryId: string, vector: number[], model: string): void {
    const buf = Buffer.from(new Float32Array(vector).buffer)
    this.db.prepare(`
      INSERT INTO memory_vectors (memory_id, model, dims, vector)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(memory_id) DO UPDATE SET model = excluded.model, dims = excluded.dims, vector = excluded.vector
    `).run(memoryId, model, vector.length, buf)
  }

  get(memoryId: string): Float32Array | null {
    const row = this.db.prepare('SELECT vector FROM memory_vectors WHERE memory_id = ?')
      .get(memoryId) as { vector: Buffer } | undefined
    if (!row) return null
    return new Float32Array(row.vector.buffer, row.vector.byteOffset, row.vector.byteLength / 4)
  }

  delete(memoryId: string): void {
    this.db.prepare('DELETE FROM memory_vectors WHERE memory_id = ?').run(memoryId)
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM memory_vectors').get() as { n: number }).n
  }

  /**
   * Brute-force cosine search over all stored vectors. Fine for a personal
   * assistant's scale (thousands of memories); swap for sqlite-vec if it
   * ever becomes a bottleneck.
   */
  search(queryVector: number[], limit = 16): ScoredId[] {
    const rows = this.db.prepare(`
      SELECT v.memory_id, v.vector
      FROM memory_vectors v
      JOIN memories m ON m.id = v.memory_id AND m.archived = 0
    `).all() as Array<{ memory_id: string; vector: Buffer }>

    const scored: ScoredId[] = rows.map(r => ({
      memoryId: r.memory_id,
      similarity: cosineSimilarity(
        queryVector,
        new Float32Array(r.vector.buffer, r.vector.byteOffset, r.vector.byteLength / 4),
      ),
    }))
    scored.sort((a, b) => b.similarity - a.similarity)
    return scored.slice(0, limit)
  }
}
