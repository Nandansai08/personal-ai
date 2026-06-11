// MIT License — personal-ai
import { describe, it, expect } from 'vitest'
import { PROVIDER_META, PROVIDER_NAMES, inferProvider, isProviderName } from '../../src/providers/metadata.js'

describe('provider metadata', () => {
  it('has all 8 providers', () => {
    expect(PROVIDER_NAMES).toHaveLength(8)
  })

  it('every provider has a model env key and default model', () => {
    for (const meta of Object.values(PROVIDER_META)) {
      expect(meta.modelEnvKey).toMatch(/_MODEL$/)
      expect(meta.defaultModel.length).toBeGreaterThan(0)
    }
  })

  it('cloud providers have env keys, local ones do not', () => {
    expect(PROVIDER_META.ollama.envKey).toBeUndefined()
    expect(PROVIDER_META.lmstudio.envKey).toBeUndefined()
    expect(PROVIDER_META.anthropic.envKey).toBe('ANTHROPIC_API_KEY')
  })

  it('isProviderName guards correctly', () => {
    expect(isProviderName('ollama')).toBe(true)
    expect(isProviderName('not-a-provider')).toBe(false)
  })

  it('inferProvider matches each provider default model to its provider', () => {
    expect(inferProvider(PROVIDER_META.anthropic.defaultModel)).toBe('anthropic')
    expect(inferProvider(PROVIDER_META.openai.defaultModel)).toBe('openai')
    expect(inferProvider(PROVIDER_META.gemini.defaultModel)).toBe('gemini')
    expect(inferProvider(PROVIDER_META.mistral.defaultModel)).toBe('mistral')
    expect(inferProvider(PROVIDER_META.groq.defaultModel)).toBe('groq')
    expect(inferProvider(PROVIDER_META.ollama.defaultModel)).toBe('ollama')
  })
})
