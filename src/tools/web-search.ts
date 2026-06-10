// MIT License — personal-ai

import type { RegisteredTool, ToolResult } from './types.js'

const SERPER_ENDPOINT = 'https://google.serper.dev/search'
const BRAVE_ENDPOINT  = 'https://api.search.brave.com/res/v1/web/search'
const DDG_ENDPOINT    = 'https://api.duckduckgo.com/'

interface SearchResult {
  title: string
  url: string
  snippet: string
}

// ── Serper ───────────────────────────────────────────────────────────────────

interface SerperOrganic {
  title: string
  link: string
  snippet?: string
}
interface SerperResponse {
  organic?: SerperOrganic[]
  answerBox?: { answer?: string; snippet?: string; title?: string }
  knowledgeGraph?: { description?: string; title?: string }
}

async function searchSerper(query: string, count: number): Promise<SearchResult[]> {
  const key = process.env['SERPER_API_KEY']
  if (!key) throw new Error('SERPER_API_KEY not set')

  const res = await fetch(SERPER_ENDPOINT, {
    method: 'POST',
    headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, num: count }),
  })
  if (!res.ok) throw new Error(`Serper HTTP ${res.status}`)
  const data = await res.json() as SerperResponse

  const results: SearchResult[] = (data.organic ?? []).slice(0, count).map(r => ({
    title:   r.title,
    url:     r.link,
    snippet: r.snippet ?? '',
  }))

  // Prepend answerBox/knowledgeGraph as a top result if present
  const direct = data.answerBox?.answer ?? data.answerBox?.snippet ?? data.knowledgeGraph?.description
  if (direct) {
    results.unshift({
      title:   data.answerBox?.title ?? data.knowledgeGraph?.title ?? 'Direct Answer',
      url:     '',
      snippet: direct,
    })
  }

  return results
}

// ── Brave ────────────────────────────────────────────────────────────────────

interface BraveResult { title: string; url: string; description?: string }
interface BraveResponse { web?: { results?: BraveResult[] } }

async function searchBrave(query: string, count: number): Promise<SearchResult[]> {
  const key = process.env['BRAVE_SEARCH_API_KEY']
  if (!key) throw new Error('BRAVE_SEARCH_API_KEY not set')

  const url = `${BRAVE_ENDPOINT}?q=${encodeURIComponent(query)}&count=${count}`
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json', 'X-Subscription-Token': key },
  })
  if (!res.ok) throw new Error(`Brave HTTP ${res.status}`)
  const data = await res.json() as BraveResponse
  return (data.web?.results ?? []).map(r => ({ title: r.title, url: r.url, snippet: r.description ?? '' }))
}

// ── DuckDuckGo (last resort — Instant Answers only, no sports/news) ──────────

interface DdgResult { Text: string; FirstURL: string }
interface DdgResponse { RelatedTopics?: Array<{ Text?: string; FirstURL?: string }> }

async function searchDdg(query: string, count: number): Promise<SearchResult[]> {
  const url = `${DDG_ENDPOINT}?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } })
  if (!res.ok) throw new Error(`DDG HTTP ${res.status}`)
  const data = await res.json() as DdgResponse
  const results = (data.RelatedTopics ?? [])
    .filter((t): t is DdgResult => typeof t.Text === 'string' && typeof t.FirstURL === 'string')
    .slice(0, count)
    .map(t => ({ title: t.Text.split(' - ')[0] ?? t.Text, url: t.FirstURL, snippet: t.Text }))
  if (results.length === 0) throw new Error('DDG returned no results')
  return results
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

/** Priority: Serper → Brave → DDG. Returns up to `count` results. */
export async function webSearch(query: string, count = 5): Promise<ToolResult> {
  const noSerper = !process.env['SERPER_API_KEY']
  const noBrave  = !process.env['BRAVE_SEARCH_API_KEY']

  const engines: Array<{ name: string; fn: () => Promise<SearchResult[]> }> = []
  if (!noSerper) engines.push({ name: 'serper',      fn: () => searchSerper(query, count) })
  if (!noBrave)  engines.push({ name: 'brave',       fn: () => searchBrave(query, count) })
  engines.push(  { name: 'duckduckgo', fn: () => searchDdg(query, count) })

  let lastErr = ''
  for (const engine of engines) {
    try {
      const results = await engine.fn()
      return { success: true, data: { query, source: engine.name, results } }
    } catch (err) {
      lastErr = String(err)
    }
  }

  // All engines failed
  const hint = (noSerper && noBrave)
    ? 'No search API key configured. Add SERPER_API_KEY to .env — free at https://serper.dev (2500 searches, no card needed).'
    : `All search engines failed: ${lastErr}`
  return { success: false, data: null, error: hint }
}

export const webSearchTool: RegisteredTool = {
  definition: {
    name: 'web_search',
    description: 'Search web for current/live information.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        count: { type: 'number', description: 'Results count, max 10' },
      },
      required: ['query'],
    },
  },
  async execute(args: unknown): Promise<ToolResult> {
    const a = args as Record<string, unknown>
    const query = String(a['query'] ?? '').trim()
    if (!query) return { success: false, data: null, error: 'query is required' }
    const count = Math.min(Number(a['count'] ?? 5), 10)
    return webSearch(query, count)
  },
}
