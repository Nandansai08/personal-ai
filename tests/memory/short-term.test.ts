import { describe, it, expect } from 'vitest'
import { CircularBuffer, extractMemoryCandidates } from '../../src/memory/short-term.js'

describe('CircularBuffer', () => {
  it('stores items up to maxSize', () => {
    const buf = new CircularBuffer<number>(3)
    buf.push(1); buf.push(2); buf.push(3)
    expect(buf.getAll()).toEqual([1, 2, 3])
    expect(buf.size).toBe(3)
  })

  it('overwrites oldest when full', () => {
    const buf = new CircularBuffer<number>(3)
    buf.push(1); buf.push(2); buf.push(3); buf.push(4)
    expect(buf.getAll()).toEqual([2, 3, 4])
  })

  it('clear resets buffer', () => {
    const buf = new CircularBuffer<string>(5)
    buf.push('a'); buf.push('b')
    buf.clear()
    expect(buf.size).toBe(0)
    expect(buf.getAll()).toEqual([])
  })
})

describe('extractMemoryCandidates', () => {
  it('extracts name fact', () => {
    const c = extractMemoryCandidates('My name is Nandan.')
    expect(c.length).toBeGreaterThan(0)
    expect(c[0]!.type).toBe('personal')
    expect(c[0]!.importance).toBeGreaterThanOrEqual(9)
  })

  it('extracts preference', () => {
    const c = extractMemoryCandidates('I prefer dark mode in all editors.')
    expect(c[0]!.type).toBe('preference')
  })

  it('extracts remember-that as context', () => {
    const c = extractMemoryCandidates('Remember that the deadline is Friday.')
    expect(c[0]!.type).toBe('context')
    expect(c[0]!.importance).toBeGreaterThanOrEqual(8)
  })

  it('returns empty for plain text', () => {
    const c = extractMemoryCandidates('What is the weather today?')
    expect(c.length).toBe(0)
  })

  it('handles multiple triggers in one message', () => {
    const c = extractMemoryCandidates('My name is Nandan. I prefer vim. I hate meetings.')
    expect(c.length).toBe(3)
  })

  it('sorts by importance descending', () => {
    const c = extractMemoryCandidates('My name is Nandan. I like coffee.')
    expect(c[0]!.importance).toBeGreaterThanOrEqual(c[1]!.importance)
  })
})
