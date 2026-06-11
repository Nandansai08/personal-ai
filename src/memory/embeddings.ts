// MIT License — personal-ai
// Local-first embeddings. Default: nomic-embed-text via Ollama's HTTP API
// (native fetch — no provider SDK, so the golden rule holds).

export interface Embedder {
  readonly name: string
  /** Returns the embedding vector, or null if embedding is unavailable. */
  embed(text: string): Promise<number[] | null>
}

/**
 * Ollama-backed embedder. Tries EMBEDDINGS_MODEL (default nomic-embed-text),
 * falls back gracefully: any failure returns null and the memory system
 * degrades to tokenized keyword search.
 */
export function createOllamaEmbedder(baseUrl?: string, model?: string): Embedder {
  const url = baseUrl ?? process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434'
  const m   = model ?? process.env['EMBEDDINGS_MODEL'] ?? 'nomic-embed-text'
  let unavailable = false // cache hard failures so we don't retry per message

  return {
    name: `ollama/${m}`,
    async embed(text: string): Promise<number[] | null> {
      if (unavailable) return null
      try {
        const res = await fetch(`${url}/api/embeddings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: m, prompt: text }),
          signal: AbortSignal.timeout(10_000),
        })
        if (!res.ok) {
          if (res.status === 404) unavailable = true // model not pulled
          return null
        }
        const data = await res.json() as { embedding?: number[] }
        return Array.isArray(data.embedding) && data.embedding.length > 0 ? data.embedding : null
      } catch {
        unavailable = true // connection refused — Ollama not running
        return null
      }
    },
  }
}

/** Cosine similarity between two vectors. Returns 0 for mismatched/empty. */
export function cosineSimilarity(a: number[] | Float32Array, b: number[] | Float32Array): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!, y = b[i]!
    dot += x * y
    na  += x * x
    nb  += y * y
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom === 0 ? 0 : dot / denom
}
