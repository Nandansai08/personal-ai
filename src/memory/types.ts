// MIT License — personal-ai

export type MemoryType =
  | 'fact' | 'preference' | 'context' | 'episodic'
  | 'education' | 'career' | 'project' | 'personal'

export const MEMORY_TYPES: MemoryType[] = [
  'fact', 'preference', 'context', 'episodic',
  'education', 'career', 'project', 'personal',
]

export interface Memory {
  id: string
  content: string
  type: MemoryType
  tags: string[]
  importance: number        // 1–10
  access_count: number
  created_at: string        // ISO string
  last_accessed: string     // ISO string
  archived: boolean
}

export interface NewMemory {
  content: string
  type: MemoryType
  tags?: string[]
  importance?: number       // default 5
}

export interface MemoryStats {
  total: number
  byType: Record<MemoryType, number>
  avgImportance: number
  mostAccessed: Memory | null
}
