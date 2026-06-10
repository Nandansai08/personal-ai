import { describe, it, expect } from 'vitest'
import { parseToolCalls } from '../../src/tools/parser.js'

describe('parseToolCalls — strategy 1: native JSON array', () => {
  it('parses array with name+arguments', () => {
    const input = JSON.stringify([{ name: 'web_search', arguments: { query: 'hello' } }])
    const calls = parseToolCalls(input)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.name).toBe('web_search')
    expect((calls[0]!.arguments as Record<string, unknown>)['query']).toBe('hello')
  })

  it('parses array with name+parameters variant', () => {
    const input = JSON.stringify([{ name: 'calculator', parameters: { expression: '2+2' } }])
    const calls = parseToolCalls(input)
    expect(calls[0]!.name).toBe('calculator')
  })

  it('returns empty for non-array JSON', () => {
    const calls = parseToolCalls(JSON.stringify({ name: 'foo' }))
    expect(calls).toHaveLength(0)
  })

  it('returns empty for invalid JSON', () => {
    expect(parseToolCalls('not json')).toHaveLength(0)
  })
})

describe('parseToolCalls — strategy 2: Gemma3 XML', () => {
  it('parses two-tag XML', () => {
    const input = '<tool>web_search</tool><args>{"query": "TypeScript tips"}</args>'
    const calls = parseToolCalls(input)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.name).toBe('web_search')
    expect((calls[0]!.arguments as Record<string, unknown>)['query']).toBe('TypeScript tips')
  })

  it('handles malformed args gracefully', () => {
    const input = '<tool>calculator</tool><args>not json</args>'
    const calls = parseToolCalls(input)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.name).toBe('calculator')
    expect(calls[0]!.arguments).toEqual({})
  })

  it('handles missing args tag', () => {
    const input = '<tool>notes</tool>'
    const calls = parseToolCalls(input)
    expect(calls[0]!.name).toBe('notes')
    expect(calls[0]!.arguments).toEqual({})
  })

  it('parses multiple tool calls', () => {
    const input = '<tool>a</tool><args>{}</args><tool>b</tool><args>{}</args>'
    const calls = parseToolCalls(input)
    expect(calls).toHaveLength(2)
    expect(calls[0]!.name).toBe('a')
    expect(calls[1]!.name).toBe('b')
  })
})

describe('parseToolCalls — strategy 3: JSON code block', () => {
  it('parses json code block', () => {
    const input = '```json\n{"name":"calculator","arguments":{"expression":"3*4"}}\n```'
    const calls = parseToolCalls(input)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.name).toBe('calculator')
  })

  it('parses plain code block', () => {
    const input = '```\n{"name":"notes","arguments":{"action":"list"}}\n```'
    const calls = parseToolCalls(input)
    expect(calls[0]!.name).toBe('notes')
  })

  it('ignores code blocks without name field', () => {
    const input = '```json\n{"foo":"bar"}\n```'
    const calls = parseToolCalls(input)
    expect(calls).toHaveLength(0)
  })
})

describe('parseToolCalls — priority', () => {
  it('native JSON wins over XML when text is JSON array', () => {
    const input = JSON.stringify([{ name: 'native_tool', arguments: {} }])
    const calls = parseToolCalls(input)
    expect(calls[0]!.name).toBe('native_tool')
  })

  it('each call gets unique id', () => {
    const input = '<tool>a</tool><args>{}</args><tool>b</tool><args>{}</args>'
    const calls = parseToolCalls(input)
    expect(calls[0]!.id).not.toBe(calls[1]!.id)
  })
})
