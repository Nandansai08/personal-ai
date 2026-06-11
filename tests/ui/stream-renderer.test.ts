// MIT License — personal-ai
import { describe, it, expect } from 'vitest'
import { createStreamRenderer } from '../../src/ui/cli-helpers.js'

// Strip ANSI color codes so assertions don't depend on chalk's TTY detection
// eslint-disable-next-line no-control-regex
const plain = (s: string): string => s.replace(/\[[0-9;]*m/g, '')

function capture(): { out: () => string; write: (s: string) => void } {
  let buf = ''
  return { out: () => plain(buf), write: (s: string) => { buf += s } }
}

describe('createStreamRenderer', () => {
  it('renders split chunks continuously — the reported bug', () => {
    const { out, write } = capture()
    const r = createStreamRenderer(write)
    r.text('Need anything e')
    r.text('lse related to that?')
    r.usage(719, 58)
    r.finish()
    expect(out()).toContain('Need anything else related to that?')
    // The full sentence must appear BEFORE the usage line, unbroken
    expect(out().indexOf('that?')).toBeLessThan(out().indexOf('[719in'))
  })

  it('flushes held-back text before the usage line (no mid-word split)', () => {
    const { out, write } = capture()
    const r = createStreamRenderer(write)
    r.text('Short tail')   // under 20 chars — fully held by the XML guard
    r.usage(10, 5)
    r.finish()
    const text = out()
    expect(text).toMatch(/Short tail\n\s+\[10in \/ 5out tokens\]/)
  })

  it('does not insert newlines inside continuous text', () => {
    const { out, write } = capture()
    const r = createStreamRenderer(write)
    for (const c of ['The qu', 'ick bro', 'wn fox jumps over the lazy dog']) r.text(c)
    r.finish()
    expect(out()).toBe('The quick brown fox jumps over the lazy dog')
  })

  it('puts tool calls on a fresh line and completes the pending text first', () => {
    const { out, write } = capture()
    const r = createStreamRenderer(write)
    r.text('Let me check the latest score for you now')
    r.toolCall('web_search')
    r.toolResult()
    r.text('Done!')
    r.finish()
    const text = out()
    expect(text).toContain('Let me check the latest score for you now\n')
    expect(text).toContain('⟳ web_search… ✓\n')
    expect(text.indexOf('score for you now')).toBeLessThan(text.indexOf('web_search'))
  })

  it('still strips XML tool blocks from display', () => {
    const { out, write } = capture()
    const r = createStreamRenderer(write)
    r.text('Noted. <memory><action>save</action></memory> All good then, my friend.')
    r.finish()
    expect(out()).toBe('Noted.  All good then, my friend.')
  })

  it('model switch renders as a complete line without breaking text', () => {
    const { out, write } = capture()
    const r = createStreamRenderer(write)
    r.modelSwitch('qwen2.5:14b', 'gemma3:12b')
    r.text('Hello from the other model, nice to meet you')
    r.finish()
    const text = out()
    expect(text).toContain('switching model: qwen2.5:14b → gemma3:12b\n')
    expect(text).toContain('Hello from the other model, nice to meet you')
  })

  it('error output starts on its own line', () => {
    const { out, write } = capture()
    const r = createStreamRenderer(write)
    r.text('Partial response that was interrupted right here')
    r.error('Rate limit hit')
    expect(out()).toMatch(/right here\nError: Rate limit hit\n/)
  })
})
