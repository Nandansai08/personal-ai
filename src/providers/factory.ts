// MIT License — personal-ai
import type { LLMProvider } from './interface.js'
import { OllamaProvider } from './ollama.js'

/** Instantiate a provider by name (or default to 'ollama'). */
export async function createProvider(model?: string): Promise<LLMProvider> {
  const providerName = model ?? process.env['PROVIDER'] ?? 'ollama'
  switch (providerName.toLowerCase()) {
    case 'ollama':
    default:
      return new OllamaProvider()
  }
}

/** Check whether required env vars are present for a provider. */
export function validateProviderConfig(provider: string): { valid: boolean; missing: string[] } {
  const required: Record<string, string[]> = {
    ollama:    [],
    anthropic: ['ANTHROPIC_API_KEY'],
    openai:    ['OPENAI_API_KEY'],
    groq:      ['GROQ_API_KEY'],
    gemini:    ['GEMINI_API_KEY'],
    mistral:   ['MISTRAL_API_KEY'],
    together:  ['TOGETHER_API_KEY'],
  }
  const keys = required[provider.toLowerCase()] ?? []
  const missing = keys.filter(k => !process.env[k])
  return { valid: missing.length === 0, missing }
}
