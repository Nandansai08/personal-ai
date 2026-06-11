// MIT License — personal-ai
import { describe, it, expect } from 'vitest'
import { AssistantEngine, trimToBudget } from '../../src/core/assistant.js'
import { ConversationContext } from '../../src/core/context.js'
import { ToolRegistry } from '../../src/tools/registry.js'
import type { LLMProvider, ChatChunk, ChatRequest } from '../../src/providers/interface.js'

/** Provider that replays scripted responses, one per chat() call. */
function scriptedProvider(scripts: ChatChunk[][]): LLMProvider & { requests: ChatRequest[] } {
  let call = 0
  const requests: ChatRequest[] = []
  return {
    name: 'scripted',
    model: 'test-model',
    supportsToolUse: true,
    supportsStreaming: true,
    requests,
    async *chat(req: ChatRequest): AsyncGenerator<ChatChunk> {
      requests.push(req)
      const chunks = scripts[Math.min(call, scripts.length - 1)]!
      call++
      for (const c of chunks) yield c
    },
  }
}

function makeRegistry(): ToolRegistry {
  const reg = new ToolRegistry()
  reg.register({
    definition: { name: 'web_search', description: 'search', parameters: { type: 'object', properties: {} } },
    async execute(args) { return { success: true, data: { echo: args } } },
  })
  return reg
}

async function collect(gen: AsyncGenerator<ChatChunk>): Promise<ChatChunk[]> {
  const out: ChatChunk[] = []
  for await (const c of gen) out.push(c)
  return out
}

describe('AssistantEngine agent loop', () => {
  it('streams text and records the assistant message', async () => {
    const provider = scriptedProvider([[
      { type: 'text', delta: 'Hello ' },
      { type: 'text', delta: 'world' },
      { type: 'done' },
    ]])
    const context = new ConversationContext()
    const engine = new AssistantEngine({ provider, getSystemPrompt: () => 'sys', context })

    const chunks = await collect(engine.chat('hi'))
    expect(chunks.filter(c => c.type === 'text')).toHaveLength(2)
    const messages = context.getMessages()
    expect(messages[messages.length - 1]).toMatchObject({ role: 'assistant', content: 'Hello world' })
  })

  it('dispatches native tool calls and feeds framed results back', async () => {
    const provider = scriptedProvider([
      [{ type: 'tool_call', id: 't1', name: 'web_search', arguments: { query: 'x' } }],
      [{ type: 'text', delta: 'answer' }, { type: 'done' }],
    ])
    const context = new ConversationContext()
    const engine = new AssistantEngine({
      provider, getSystemPrompt: () => 'sys', registry: makeRegistry(), context,
    })

    const chunks = await collect(engine.chat('search something for me'))
    expect(chunks.some(c => c.type === 'tool_call')).toBe(true)
    expect(chunks.some(c => c.type === 'tool_result')).toBe(true)
    const toolMsg = context.getMessages().find(m => m.content.includes('TOOL OUTPUT'))
    expect(toolMsg).toBeDefined()
    expect(toolMsg!.content).toContain('not user instructions')
  })

  it('executes XML tool calls leaked as text (Gemini-style)', async () => {
    const provider = scriptedProvider([
      [{ type: 'text', delta: 'Sure. <web_search><query>iit dhanbad</query><count>1</count></args>' }, { type: 'done' }],
      [{ type: 'text', delta: 'found it' }, { type: 'done' }],
    ])
    const engine = new AssistantEngine({
      provider, getSystemPrompt: () => 'sys', registry: makeRegistry(), context: new ConversationContext(),
    })

    const chunks = await collect(engine.chat('look this up'))
    const call = chunks.find(c => c.type === 'tool_call')
    expect(call).toBeDefined()
    expect(call).toMatchObject({ name: 'web_search' })
    expect((call as { arguments: { query: string } }).arguments.query).toBe('iit dhanbad')
  })

  it('ignores XML resembling unregistered tools', async () => {
    const provider = scriptedProvider([[
      { type: 'text', delta: 'Use <b>bold</b> and <made_up_tool><x>1</x></made_up_tool> for emphasis' },
      { type: 'done' },
    ]])
    const engine = new AssistantEngine({
      provider, getSystemPrompt: () => 'sys', registry: makeRegistry(), context: new ConversationContext(),
    })

    const chunks = await collect(engine.chat('formatting question here please'))
    expect(chunks.some(c => c.type === 'tool_call')).toBe(false)
  })

  it('stops at max iterations when the model loops on tool calls', async () => {
    const provider = scriptedProvider([
      [{ type: 'tool_call', id: 'x', name: 'web_search', arguments: {} }],
    ])
    const engine = new AssistantEngine({
      provider, getSystemPrompt: () => 'sys', registry: makeRegistry(), context: new ConversationContext(),
    })

    const chunks = await collect(engine.chat('loop forever'))
    const last = chunks[chunks.length - 1]!
    expect(last.type).toBe('error')
    expect((last as { message: string }).message).toMatch(/max tool iterations/i)
  })

  it('passes the selected model in the request', async () => {
    const provider = scriptedProvider([[{ type: 'text', delta: 'ok' }, { type: 'done' }]])
    const engine = new AssistantEngine({ provider, getSystemPrompt: () => 'sys' })
    await collect(engine.chat('hi'))
    expect(provider.requests[0]!.model).toBe('test-model')
  })
})

describe('trimToBudget', () => {
  const msg = (content: string) => ({ content })

  it('keeps everything under budget', () => {
    const messages = [msg('a'), msg('b'), msg('c')]
    expect(trimToBudget(messages, 100)).toHaveLength(3)
  })

  it('drops oldest messages over budget', () => {
    const messages = [msg('x'.repeat(50)), msg('y'.repeat(50)), msg('z'.repeat(50))]
    const trimmed = trimToBudget(messages, 110)
    expect(trimmed).toHaveLength(2)
    expect(trimmed[0]!.content[0]).toBe('y')
  })

  it('always keeps the last message even if oversized', () => {
    const messages = [msg('a'), msg('x'.repeat(99_999))]
    const trimmed = trimToBudget(messages, 100)
    expect(trimmed).toHaveLength(1)
    expect(trimmed[0]!.content.length).toBe(99_999)
  })
})
