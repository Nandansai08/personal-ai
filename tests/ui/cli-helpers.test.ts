// MIT License — personal-ai
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { inferProvider, patchEnvFile, makeToolXmlStripper, friendlyError } from '../../src/ui/cli.js'

describe('inferProvider', () => {
  it('detects bare provider names', () => {
    expect(inferProvider('ollama')).toBe('ollama')
    expect(inferProvider('GEMINI')).toBe('gemini')
    expect(inferProvider('anthropic')).toBe('anthropic')
  })

  it('detects models by prefix', () => {
    expect(inferProvider('claude-sonnet-4-6')).toBe('anthropic')
    expect(inferProvider('gpt-4o-mini')).toBe('openai')
    expect(inferProvider('gemini-2.0-flash')).toBe('gemini')
    expect(inferProvider('mistral-large-latest')).toBe('mistral')
    expect(inferProvider('llama-3.3-70b-versatile')).toBe('groq')
  })

  it('detects ollama models by colon tag', () => {
    expect(inferProvider('qwen2.5:14b')).toBe('ollama')
    expect(inferProvider('gemma3:12b')).toBe('ollama')
  })

  it('returns undefined for unknown names', () => {
    expect(inferProvider('some-random-model')).toBeUndefined()
  })
})

describe('patchEnvFile', () => {
  function withTmpEnv(initial: string, changes: Record<string, string>): string {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pai-env-')), '.env')
    fs.writeFileSync(file, initial)
    patchEnvFile(file, changes)
    return fs.readFileSync(file, 'utf8')
  }

  it('replaces existing keys', () => {
    const out = withTmpEnv('PROVIDER=gemini\nOLLAMA_MODEL=old\n', { PROVIDER: 'ollama' })
    expect(out).toContain('PROVIDER=ollama')
    expect(out).toContain('OLLAMA_MODEL=old')
  })

  it('appends missing keys', () => {
    const out = withTmpEnv('PROVIDER=ollama\n', { GROQ_MODEL: 'llama-3.3-70b-versatile' })
    expect(out).toContain('GROQ_MODEL=llama-3.3-70b-versatile')
  })

  it('does not corrupt values containing $ replacement patterns', () => {
    const out = withTmpEnv('API_KEY=old\n', { API_KEY: "sk-ab$&cd$'ef$1gh" })
    expect(out).toContain("API_KEY=sk-ab$&cd$'ef$1gh")
  })

  it('only replaces the matching key, not substrings of other keys', () => {
    const out = withTmpEnv('MODEL=a\nOLLAMA_MODEL=b\n', { MODEL: 'c' })
    expect(out).toContain('MODEL=c')
    expect(out).toContain('OLLAMA_MODEL=b')
  })
})

describe('makeToolXmlStripper', () => {
  it('passes plain text through', () => {
    const s = makeToolXmlStripper()
    const out = s.feed('hello world, this is a normal sentence!') + s.flush()
    expect(out).toBe('hello world, this is a normal sentence!')
  })

  it('strips a complete memory block', () => {
    const s = makeToolXmlStripper()
    const out = s.feed('Noted. <memory><action>save</action></memory> Done.') + s.flush()
    expect(out).toBe('Noted.  Done.')
  })

  it('strips blocks split across stream chunks', () => {
    const s = makeToolXmlStripper()
    let out = ''
    for (const chunk of ['Noted. <mem', 'ory><action>save</a', 'ction></memory> Done.']) {
      out += s.feed(chunk)
    }
    out += s.flush()
    expect(out).toBe('Noted.  Done.')
  })

  it('strips web_search blocks closed by </args>', () => {
    const s = makeToolXmlStripper()
    const out = s.feed('Sure. <web_search><query>iit</query><count>1</count></args> rest') + s.flush()
    expect(out).toBe('Sure.  rest')
  })

  it('suppresses an unterminated block on flush', () => {
    const s = makeToolXmlStripper()
    const out = s.feed('Hi <memory><action>save') + s.flush()
    expect(out).toBe('Hi ')
  })
})

describe('friendlyError', () => {
  it('shows ollama pull hint only for ollama', () => {
    const msg = 'model "qwen2.5:14b" not found'
    expect(friendlyError(msg, 'ollama')).toContain('ollama pull qwen2.5:14b')
  })

  it('suggests /switch ollama for non-ollama model-not-found', () => {
    const msg = 'models/qwen2.5:14b is not found'
    const out = friendlyError(msg, 'gemini')
    expect(out).toContain('gemini')
    expect(out).toContain('/switch ollama')
  })

  it('names the provider API key on 401', () => {
    expect(friendlyError('401 unauthorized', 'groq')).toContain('GROQ_API_KEY')
  })
})
