// MIT License — personal-ai
import type { LLMProvider } from './interface.js'
import { OllamaProvider }   from './ollama.js'

type ProviderName = 'ollama' | 'anthropic' | 'openai' | 'groq' | 'gemini' | 'mistral' | 'lmstudio' | 'together'

const PROVIDER_INFO: Record<ProviderName, { envKey?: string; signupUrl?: string }> = {
  ollama:    { signupUrl: 'https://ollama.ai' },
  anthropic: { envKey: 'ANTHROPIC_API_KEY', signupUrl: 'https://console.anthropic.com' },
  openai:    { envKey: 'OPENAI_API_KEY',    signupUrl: 'https://platform.openai.com/api-keys' },
  groq:      { envKey: 'GROQ_API_KEY',      signupUrl: 'https://console.groq.com/keys' },
  gemini:    { envKey: 'GEMINI_API_KEY',    signupUrl: 'https://aistudio.google.com/app/apikey' },
  mistral:   { envKey: 'MISTRAL_API_KEY',   signupUrl: 'https://console.mistral.ai/api-keys/' },
  lmstudio:  { signupUrl: 'https://lmstudio.ai' },
  together:  { envKey: 'TOGETHER_API_KEY',  signupUrl: 'https://api.together.xyz/settings/api-keys' },
}

/** Lazy-load provider modules to avoid importing unused SDKs at startup. */
async function loadProvider(name: ProviderName): Promise<LLMProvider> {
  switch (name) {
    case 'ollama':    return new OllamaProvider()
    case 'anthropic': return new (await import('./anthropic.js')).AnthropicProvider()
    case 'openai':    return new (await import('./openai.js')).OpenAIProvider()
    case 'groq':      return new (await import('./groq.js')).GroqProvider()
    case 'gemini':    return new (await import('./gemini.js')).GeminiProvider()
    case 'mistral':   return new (await import('./mistral.js')).MistralProvider()
    case 'lmstudio':  return new (await import('./lmstudio.js')).LMStudioProvider()
    case 'together':  return new (await import('./together.js')).TogetherProvider()
  }
}

/**
 * Instantiate the configured provider.
 * Validates API key presence before loading — gives clear error with signup URL.
 */
export async function createProvider(providerOverride?: string): Promise<LLMProvider> {
  const name = (providerOverride ?? process.env['PROVIDER'] ?? 'ollama').toLowerCase() as ProviderName

  const info = PROVIDER_INFO[name]
  if (!info) {
    const valid = Object.keys(PROVIDER_INFO).join(', ')
    throw new Error(`Unknown provider "${name}". Valid: ${valid}`)
  }

  if (info.envKey && !process.env[info.envKey]) {
    throw new Error(
      `Provider "${name}" requires ${info.envKey} in .env.\n` +
      `Get a key at: ${info.signupUrl}`,
    )
  }

  return loadProvider(name)
}

/** Check whether required env vars are present for a provider. Used by setup wizard (M7). */
export function validateProviderConfig(provider: string): { valid: boolean; missing: string[]; signupUrl?: string } {
  const info = PROVIDER_INFO[provider.toLowerCase() as ProviderName]
  if (!info) return { valid: false, missing: [`unknown provider: ${provider}`] }
  const missing = info.envKey && !process.env[info.envKey] ? [info.envKey] : []
  return { valid: missing.length === 0, missing, signupUrl: info.signupUrl }
}
