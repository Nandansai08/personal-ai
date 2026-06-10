import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Helper to build a mock fetch that streams NDJSON
function mockFetch(chunks: object[], done: object): typeof fetch {
  const encoder = new TextEncoder()
  const lines = [...chunks.map(c => JSON.stringify(c)), JSON.stringify(done)].join('\n')
  const stream = new ReadableStream({
    start(ctrl) {
      ctrl.enqueue(encoder.encode(lines))
      ctrl.close()
    },
  })
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    body: stream,
    text: async () => '',
  }) as unknown as typeof fetch
}

describe('OllamaProvider', () => {
  const originalFetch = global.fetch
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env['OLLAMA_BASE_URL']    = 'http://localhost:11434'
    process.env['OLLAMA_NUM_CTX']     = '4096'
    process.env['OLLAMA_TEMPERATURE'] = '0.5'
  })

  afterEach(() => {
    global.fetch = originalFetch
    process.env = { ...originalEnv }
  })

  it('qwen2.5:14b — supportsToolUse is true', async () => {
    process.env['OLLAMA_MODEL'] = 'qwen2.5:14b'
    const { OllamaProvider } = await import('../../src/providers/ollama.js')
    const p = new OllamaProvider()
    expect(p.supportsToolUse).toBe(true)
    expect(p.model).toBe('qwen2.5:14b')
  })

  it('gemma3:12b — supportsToolUse is false', async () => {
    process.env['OLLAMA_MODEL'] = 'gemma3:12b'
    const { OllamaProvider } = await import('../../src/providers/ollama.js')
    const p = new OllamaProvider()
    expect(p.supportsToolUse).toBe(false)
  })

  it('streams text chunks from NDJSON response', async () => {
    process.env['OLLAMA_MODEL'] = 'qwen2.5:14b'

    global.fetch = mockFetch(
      [
        { done: false, message: { role: 'assistant', content: 'Hello' } },
        { done: false, message: { role: 'assistant', content: ' world' } },
      ],
      { done: true, prompt_eval_count: 5, eval_count: 3 },
    )

    const { OllamaProvider } = await import('../../src/providers/ollama.js')
    const p = new OllamaProvider()
    const chunks = []
    for await (const chunk of p.chat({ messages: [{ role: 'user', content: 'hi' }] })) {
      chunks.push(chunk)
    }
    const texts = chunks.filter(c => c.type === 'text').map(c => (c as { delta: string }).delta)
    expect(texts.join('')).toBe('Hello world')
    const done = chunks.find(c => c.type === 'done')
    expect(done).toBeDefined()
  })

  it('yields error chunk on fetch failure', async () => {
    process.env['OLLAMA_MODEL'] = 'qwen2.5:14b'
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch

    const { OllamaProvider } = await import('../../src/providers/ollama.js')
    const p = new OllamaProvider()
    const chunks = []
    for await (const chunk of p.chat({ messages: [] })) chunks.push(chunk)
    expect(chunks[0]?.type).toBe('error')
  })
})
