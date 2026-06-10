// MIT License — personal-ai
import { OpenAICompatibleProvider } from './openai-compatible.js'

const TOGETHER_BASE_URL = 'https://api.together.xyz/v1'

// fallow-ignore-next-line unused-export
export class TogetherProvider extends OpenAICompatibleProvider {
  readonly name            = 'together'
  readonly supportsToolUse = false

  constructor() {
    const key   = process.env['TOGETHER_API_KEY'] ?? ''
    const model = process.env['TOGETHER_MODEL'] ?? 'meta-llama/Llama-3.3-70B-Instruct-Turbo'
    const temp  = parseFloat(process.env['TOGETHER_TEMPERATURE'] ?? '0.7')
    super(key, TOGETHER_BASE_URL, model, temp)
  }
}
