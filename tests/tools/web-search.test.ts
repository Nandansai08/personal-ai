import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { webSearchTool } from '../../src/tools/web-search.js'

const mockFetch = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env['SERPER_API_KEY']
  delete process.env['BRAVE_SEARCH_API_KEY']
})

describe('webSearchTool — Serper primary', () => {
  it('returns results from Serper', async () => {
    process.env['SERPER_API_KEY'] = 'test-key'
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        organic: [
          { title: 'Result 1', link: 'https://example.com', snippet: 'A result' },
        ],
      }),
    })

    const result = await webSearchTool.execute({ query: 'TypeScript' })
    expect(result.success).toBe(true)
    const data = result.data as Record<string, unknown>
    expect(data['source']).toBe('serper')
    const results = data['results'] as unknown[]
    expect(results).toHaveLength(1)
  })

  it('prepends answerBox as top result', async () => {
    process.env['SERPER_API_KEY'] = 'test-key'
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        answerBox: { answer: 'India A won by 5 wickets', title: 'Match Result' },
        organic: [{ title: 'Article', link: 'https://example.com', snippet: 'Details' }],
      }),
    })

    const result = await webSearchTool.execute({ query: 'cricket match result' })
    const data = result.data as Record<string, unknown>
    const results = data['results'] as Array<Record<string, unknown>>
    expect(results[0]!['snippet']).toContain('India A won')
  })

  it('falls back to Brave when Serper fails', async () => {
    process.env['BRAVE_SEARCH_API_KEY'] = 'brave-key'
    // No SERPER_API_KEY → skips Serper, tries Brave
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        web: { results: [{ title: 'Brave result', url: 'https://brave.com', description: 'desc' }] },
      }),
    })

    const result = await webSearchTool.execute({ query: 'test' })
    expect(result.success).toBe(true)
    const data = result.data as Record<string, unknown>
    expect(data['source']).toBe('brave')
  })

  it('returns error with setup hint when no keys configured', async () => {
    // DDG also fails
    mockFetch.mockRejectedValue(new Error('network'))
    const result = await webSearchTool.execute({ query: 'test' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('SERPER_API_KEY')
  })

  it('returns error when query is empty', async () => {
    const result = await webSearchTool.execute({ query: '' })
    expect(result.success).toBe(false)
  })

  it('caps count at 10', async () => {
    process.env['SERPER_API_KEY'] = 'test-key'
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ organic: [] }),
    })
    const result = await webSearchTool.execute({ query: 'test', count: 99 })
    expect(result.success).toBe(true)
    const body = JSON.parse(mockFetch.mock.calls[0]![1].body as string) as Record<string, unknown>
    expect(Number(body['num'])).toBeLessThanOrEqual(10)
  })
})
