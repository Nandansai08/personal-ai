// MIT License — personal-ai
import type { LLMProvider } from './interface.js'
import { OllamaProvider }   from './ollama.js'
import { PROVIDER_META, PROVIDER_NAMES, isProviderName, type ProviderName } from './metadata.js'

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
  const name = (providerOverride ?? process.env['PROVIDER'] ?? 'ollama').toLowerCase()

  if (!isProviderName(name)) {
    throw new Error(`Unknown provider "${name}". Valid: ${PROVIDER_NAMES.join(', ')}`)
  }

  const info = PROVIDER_META[name]
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
  const name = provider.toLowerCase()
  if (!isProviderName(name)) return { valid: false, missing: [`unknown provider: ${provider}`] }
  const info = PROVIDER_META[name]
  const missing = info.envKey && !process.env[info.envKey] ? [info.envKey] : []
  return { valid: missing.length === 0, missing, signupUrl: info.signupUrl }
}
