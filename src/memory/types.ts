// MIT License — personal-ai

export interface MemoryEntry {
  id: string
  content: string
  type: 'fact' | 'preference' | 'context' | 'episodic'
  importance: number
  createdAt: Date
  archivedAt?: Date
}

export interface MemorySearchResult {
  entry: MemoryEntry
  score: number
}

export interface MemoryStore {
  save(entry: Omit<MemoryEntry, 'id' | 'createdAt'>): Promise<MemoryEntry>
  search(query: string, limit?: number): Promise<MemorySearchResult[]>
  list(limit?: number): Promise<MemoryEntry[]>
}
