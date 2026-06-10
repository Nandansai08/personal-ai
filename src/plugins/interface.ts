// MIT License — personal-ai
import type { RegisteredTool } from '../tools/types.js'

export interface PersonalAIPlugin {
  name: string
  description: string
  tools: RegisteredTool[]
  setup?(): Promise<void>
}
