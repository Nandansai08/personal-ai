// MIT License — personal-ai
import { OpenAICompatibleProvider } from './openai-compatible.js'

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1'

// fallow-ignore-next-line unused-export
export class GroqProvider extends OpenAICompatibleProvider {
  readonly name            = 'groq'
  readonly supportsToolUse = true

  constructor() {
    const key   = process.env['GROQ_API_KEY'] ?? ''
    const model = process.env['GROQ_MODEL'] ?? 'llama-3.3-70b-versatile'
    const temp  = parseFloat(process.env['GROQ_TEMPERATURE'] ?? '0.7')
    super(key, GROQ_BASE_URL, model, temp)
  }
}
