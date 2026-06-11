// MIT License — personal-ai
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createProvider, validateProviderConfig } from '../../src/providers/factory.js'

describe('validateProviderConfig', () => {
  it('returns valid for ollama (no key needed)', () => {
    const r = validateProviderConfig('ollama')
    expect(r.valid).toBe(true)
    expect(r.missing).toHaveLength(0)
  })

  it('returns invalid for anthropic when key missing', () => {
    const saved = process.env['ANTHROPIC_API_KEY']
    delete process.env['ANTHROPIC_API_KEY']
    const r = validateProviderConfig('anthropic')
    expect(r.valid).toBe(false)
    expect(r.missing).toContain('ANTHROPIC_API_KEY')
    expect(r.signupUrl).toContain('anthropic')
    if (saved) process.env['ANTHROPIC_API_KEY'] = saved
  })

  it('returns valid for anthropic when key present', () => {
    process.env['ANTHROPIC_API_KEY'] = 'test-key'
    const r = validateProviderConfig('anthropic')
    expect(r.valid).toBe(true)
    delete process.env['ANTHROPIC_API_KEY']
  })

  it('returns invalid for unknown provider', () => {
    const r = validateProviderConfig('nonexistent')
    expect(r.valid).toBe(false)
  })

  it('is case-insensitive', () => {
    const r = validateProviderConfig('OLLAMA')
    expect(r.valid).toBe(true)
  })
})

describe('createProvider', () => {
  let savedProvider: string | undefined

  beforeEach(() => {
    savedProvider = process.env['PROVIDER']
  })

  afterEach(() => {
    if (savedProvider !== undefined) process.env['PROVIDER'] = savedProvider
    else delete process.env['PROVIDER']
  })

  it('defaults to ollama when PROVIDER unset', async () => {
    delete process.env['PROVIDER']
    const p = await createProvider()
    expect(p.name).toBe('ollama')
  })

  it('uses PROVIDER env var', async () => {
    process.env['PROVIDER'] = 'ollama'
    const p = await createProvider()
    expect(p.name).toBe('ollama')
  })

  it('accepts providerOverride argument', async () => {
    const p = await createProvider('ollama')
    expect(p.name).toBe('ollama')
  })

  it('throws on unknown provider', async () => {
    await expect(createProvider('bogus')).rejects.toThrow('Unknown provider')
  })

  it('throws when API key missing for cloud provider', async () => {
    const saved = process.env['ANTHROPIC_API_KEY']
    delete process.env['ANTHROPIC_API_KEY']
    await expect(createProvider('anthropic')).rejects.toThrow('ANTHROPIC_API_KEY')
    if (saved) process.env['ANTHROPIC_API_KEY'] = saved
  })

  it('loads provider when API key present', async () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test'
    const p = await createProvider('anthropic')
    expect(p.name).toBe('anthropic')
    delete process.env['ANTHROPIC_API_KEY']
  })
})
