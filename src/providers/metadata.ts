// MIT License — personal-ai
// Single source of truth for provider metadata. Consumed by the factory,
// setup wizard, and CLI — never duplicate this table elsewhere.

export type ProviderName =
  | 'ollama' | 'anthropic' | 'openai' | 'groq'
  | 'gemini' | 'mistral' | 'lmstudio' | 'together'

export interface ProviderMeta {
  key:           ProviderName
  label:         string
  free:          boolean
  local:         boolean
  envKey?:       string
  modelEnvKey:   string
  defaultModel:  string
  hint:          string
  signupUrl?:    string
  testUrl?:      string
  testAuthHeader?: (key: string) => Record<string, string>
  /** Regex matching model names that belong to this provider. */
  modelPattern?: RegExp
}

export const PROVIDER_META: Record<ProviderName, ProviderMeta> = {
  ollama: {
    key: 'ollama', label: 'Ollama', free: true, local: true,
    modelEnvKey: 'OLLAMA_MODEL', defaultModel: 'qwen2.5:14b',
    hint: 'Runs models locally — no API key needed',
    signupUrl: 'https://ollama.ai',
    modelPattern: /:/,  // name:tag convention
  },
  anthropic: {
    key: 'anthropic', label: 'Anthropic (Claude)', free: false, local: false,
    envKey: 'ANTHROPIC_API_KEY', modelEnvKey: 'ANTHROPIC_MODEL', defaultModel: 'claude-sonnet-4-6',
    hint: 'Paid — claude-sonnet-4-6, claude-haiku-4-5',
    signupUrl: 'https://console.anthropic.com',
    testUrl: 'https://api.anthropic.com/v1/models',
    testAuthHeader: k => ({ 'x-api-key': k, 'anthropic-version': '2023-06-01' }),
    modelPattern: /^claude-/i,
  },
  openai: {
    key: 'openai', label: 'OpenAI (GPT)', free: false, local: false,
    envKey: 'OPENAI_API_KEY', modelEnvKey: 'OPENAI_MODEL', defaultModel: 'gpt-4o-mini',
    hint: 'Paid — gpt-4o-mini, gpt-4o',
    signupUrl: 'https://platform.openai.com/api-keys',
    testUrl: 'https://api.openai.com/v1/models',
    testAuthHeader: k => ({ 'Authorization': `Bearer ${k}` }),
    modelPattern: /^gpt-|^o[0-9]-/i,
  },
  groq: {
    key: 'groq', label: 'Groq', free: true, local: false,
    envKey: 'GROQ_API_KEY', modelEnvKey: 'GROQ_MODEL', defaultModel: 'llama-3.3-70b-versatile',
    hint: 'Free 14k req/day — very fast inference',
    signupUrl: 'https://console.groq.com/keys',
    testUrl: 'https://api.groq.com/openai/v1/models',
    testAuthHeader: k => ({ 'Authorization': `Bearer ${k}` }),
    modelPattern: /^llama-\d+\.\d+-\d+[bB]/i,
  },
  gemini: {
    key: 'gemini', label: 'Google Gemini', free: true, local: false,
    envKey: 'GEMINI_API_KEY', modelEnvKey: 'GEMINI_MODEL', defaultModel: 'gemini-2.0-flash',
    hint: 'Free 1500 req/day',
    signupUrl: 'https://aistudio.google.com/app/apikey',
    testUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    // Key goes in a header, never a URL query string (avoids proxy-log leaks)
    testAuthHeader: k => ({ 'x-goog-api-key': k }),
    modelPattern: /^gemini-/i,
  },
  mistral: {
    key: 'mistral', label: 'Mistral', free: false, local: false,
    envKey: 'MISTRAL_API_KEY', modelEnvKey: 'MISTRAL_MODEL', defaultModel: 'mistral-large-latest',
    hint: 'Paid API',
    signupUrl: 'https://console.mistral.ai/api-keys/',
    testUrl: 'https://api.mistral.ai/v1/models',
    testAuthHeader: k => ({ 'Authorization': `Bearer ${k}` }),
    modelPattern: /^mistral-/i,
  },
  lmstudio: {
    key: 'lmstudio', label: 'LM Studio', free: true, local: true,
    modelEnvKey: 'LMSTUDIO_MODEL', defaultModel: 'local-model',
    hint: 'Local server at http://localhost:1234 — no key needed',
    signupUrl: 'https://lmstudio.ai',
  },
  together: {
    key: 'together', label: 'Together.ai', free: false, local: false,
    envKey: 'TOGETHER_API_KEY', modelEnvKey: 'TOGETHER_MODEL',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    hint: '$1 free credit',
    signupUrl: 'https://api.together.xyz/settings/api-keys',
    testUrl: 'https://api.together.xyz/v1/models',
    testAuthHeader: k => ({ 'Authorization': `Bearer ${k}` }),
  },
}

export const PROVIDER_NAMES = Object.keys(PROVIDER_META) as ProviderName[]

export function isProviderName(name: string): name is ProviderName {
  return name in PROVIDER_META
}

/**
 * Infer the provider a model name belongs to.
 * Bare provider names ("ollama") resolve to themselves; otherwise model-name
 * patterns are tried in declaration order (ollama's `:tag` pattern last).
 */
export function inferProvider(model: string): ProviderName | undefined {
  const lower = model.toLowerCase()
  if (isProviderName(lower)) return lower
  for (const meta of Object.values(PROVIDER_META)) {
    if (meta.key === 'ollama') continue // generic `:` pattern checked last
    if (meta.modelPattern?.test(model)) return meta.key
  }
  if (PROVIDER_META.ollama.modelPattern!.test(model)) return 'ollama'
  return undefined
}
