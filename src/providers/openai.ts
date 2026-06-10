// MIT License — personal-ai
import { OpenAICompatibleProvider } from './openai-compatible.js'

// fallow-ignore-next-line unused-export
export class OpenAIProvider extends OpenAICompatibleProvider {
  readonly name         = 'openai'
  readonly supportsToolUse = true

  constructor() {
    const key   = process.env['OPENAI_API_KEY'] ?? ''
    const base  = process.env['OPENAI_BASE_URL']
    const model = process.env['OPENAI_MODEL'] ?? 'gpt-4o-mini'
    const temp  = parseFloat(process.env['OPENAI_TEMPERATURE'] ?? '0.7')
    super(key, base, model, temp)
  }
}
