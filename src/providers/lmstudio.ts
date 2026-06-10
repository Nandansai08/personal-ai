// MIT License — personal-ai
import { OpenAICompatibleProvider } from './openai-compatible.js'

// fallow-ignore-next-line unused-export
export class LMStudioProvider extends OpenAICompatibleProvider {
  readonly name            = 'lmstudio'
  readonly supportsToolUse = false  // LM Studio tool support varies by model

  constructor() {
    const base  = process.env['LMSTUDIO_BASE_URL'] ?? 'http://localhost:1234/v1'
    const model = process.env['LMSTUDIO_MODEL'] ?? 'local-model'
    const temp  = parseFloat(process.env['LMSTUDIO_TEMPERATURE'] ?? '0.7')
    super('lm-studio', base, model, temp)  // LM Studio doesn't require a real key
  }
}
