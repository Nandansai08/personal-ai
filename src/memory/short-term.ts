// MIT License — personal-ai
import type { MemoryType } from './types.js'
import { normalizeFact, categorizeFact } from './intent.js'

export interface MemoryCandidate {
  content: string
  type: MemoryType
  importance: number
}

const TRIGGERS: Array<{ pattern: RegExp; type: MemoryType; importance: number }> = [
  { pattern: /my name is .+/i,        type: 'fact',       importance: 9 },
  { pattern: /i work at .+/i,         type: 'fact',       importance: 8 },
  { pattern: /i live in .+/i,         type: 'fact',       importance: 8 },
  { pattern: /i(?:'m| am) a .+/i,     type: 'fact',       importance: 7 },
  { pattern: /i prefer .+/i,          type: 'preference', importance: 7 },
  { pattern: /i always .+/i,          type: 'preference', importance: 6 },
  { pattern: /i usually .+/i,         type: 'preference', importance: 6 },
  { pattern: /my favorite .+/i,       type: 'preference', importance: 7 },
  { pattern: /i like .+/i,            type: 'preference', importance: 5 },
  { pattern: /i hate .+/i,            type: 'preference', importance: 6 },
  { pattern: /remember that .+/i,     type: 'context',    importance: 8 },
  { pattern: /you should know .+/i,   type: 'context',    importance: 8 },
]

/** Ring buffer for short-term context window. */
export class CircularBuffer<T> {
  private buf: T[] = []
  private pos = 0

  constructor(private maxSize: number = 30) {}

  push(item: T): void {
    if (this.buf.length < this.maxSize) {
      this.buf.push(item)
    } else {
      this.buf[this.pos] = item
      this.pos = (this.pos + 1) % this.maxSize
    }
  }

  getAll(): T[] {
    if (this.buf.length < this.maxSize) return [...this.buf]
    return [...this.buf.slice(this.pos), ...this.buf.slice(0, this.pos)]
  }

  clear(): void { this.buf = []; this.pos = 0 }
  get size(): number { return this.buf.length }
}

/**
 * Scan text for memory-worthy sentences based on trigger patterns.
 * Returns candidates sorted by importance desc.
 */
export function extractMemoryCandidates(text: string): MemoryCandidate[] {
  const sentences = text
    .split(/[.!?\n]+/)
    .map(s => s.trim())
    .filter(s => s.length > 5)

  const candidates: MemoryCandidate[] = []

  for (const sentence of sentences) {
    for (const { pattern, type, importance } of TRIGGERS) {
      if (pattern.test(sentence)) {
        // Store normalized third-person facts, not raw first-person sentences
        const content = normalizeFact(sentence)
        const refined = categorizeFact(content)
        candidates.push({ content, type: refined === 'fact' ? type : refined, importance })
        break // one trigger per sentence
      }
    }
  }

  return candidates.sort((a, b) => b.importance - a.importance)
}
