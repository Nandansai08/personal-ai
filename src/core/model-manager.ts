// MIT License — personal-ai
import { eventBus } from './events.js'
import { logger } from './logger.js'
import type { ProfileManager } from '../persona/profiles.js'

export type TaskType = 'chat' | 'tools' | 'coding' | 'reasoning' | 'longcontext' | 'quick'

export interface ModelsConfig {
  default: string
  tasks: Partial<Record<TaskType, string>>
}

const NATIVE_TOOL_PREFIXES = [
  'qwen2.5:', 'qwen2.5-coder:', 'llama3.1:', 'llama3.2:', 'mistral-nemo:', 'mistral:',
  'claude-', 'gpt-', 'gemini-', 'llama-', 'mixtral-',
]

const CODING_RE     = /\b(write|code|function|class|bug|debug|implement|fix|typescript|javascript|python|react|refactor|snippet)\b/i
const TOOLS_RE      = /\b(save|add|note|task|remind|search|find|calculate|list|show me|what are my|look up|weather|news|score)\b/i
const REASONING_RE  = /\b(explain|analyze|compare|pros and cons|why|how does|evaluate|difference between|best way)\b/i

export class ModelManager {
  private manualOverride: string | null = null
  private config: ModelsConfig

  constructor(config: ModelsConfig, private profileManager?: ProfileManager) {
    this.config = config
  }

  /**
   * Detect task type from message content and context size.
   * Keyword intent wins over message length — "fix the bug" is coding,
   * not 'quick', even at 11 chars.
   */
  detectTask(message: string, contextSize: number): TaskType {
    if (message.length > 1500 || contextSize > 25)            return 'longcontext'
    if (CODING_RE.test(message))                              return 'coding'
    if (TOOLS_RE.test(message))                               return 'tools'
    if (REASONING_RE.test(message))                           return 'reasoning'
    if (message.length < 30)                                  return 'quick'
    return 'chat'
  }

  /**
   * Select the best model for this message.
   * Priority: manualOverride > profileOverride > task-based routing.
   */
  selectModel(message: string, contextSize: number): string {
    if (this.manualOverride) return this.manualOverride

    const profileModel = this.profileManager?.getPreferredModel()
    if (profileModel) {
      logger.debug('model-manager', `profile override: ${profileModel}`)
      return profileModel
    }

    const task  = this.detectTask(message, contextSize)
    let   model = this.config.tasks[task] ?? this.config.default

    // Fallback: if task needs tools but model can't do it, use tools model
    if (task === 'tools' && !this.isToolCapable(model)) {
      const toolsModel = this.config.tasks.tools ?? this.config.default
      logger.debug('model-manager', `tool fallback: ${model} → ${toolsModel}`)
      model = toolsModel
    }

    eventBus.emit('model_selected', { model, task, reason: `task=${task}` })
    logger.debug('model-manager', `selected ${model} for task=${task}`)
    return model
  }

  isToolCapable(model: string): boolean {
    return NATIVE_TOOL_PREFIXES.some(p => model.startsWith(p))
  }

  /** Pin to a specific model. Call setAuto() to resume auto-routing. */
  setModel(model: string): void {
    this.manualOverride = model
    logger.debug('model-manager', `manual override: ${model}`)
  }

  /** Resume automatic task-based routing. */
  setAuto(): void {
    this.manualOverride = null
    logger.debug('model-manager', 'auto routing enabled')
  }

  getCurrentModel(): string {
    return this.manualOverride || this.profileManager?.getPreferredModel() || this.config.default
  }

  // fallow-ignore-next-line unused-class-member
  reload(config: ModelsConfig): void {
    this.config = config
  }

  getStats(): { current: string; mode: 'manual' | 'auto' | 'profile'; config: ModelsConfig } {
    const mode = this.manualOverride ? 'manual'
      : this.profileManager?.getPreferredModel() ? 'profile'
      : 'auto'
    return { current: this.getCurrentModel(), mode, config: this.config }
  }
}

/** Default config matching CLAUDE.md task routing table. */
export function defaultModelsConfig(): ModelsConfig {
  return {
    default: process.env['OLLAMA_MODEL'] ?? 'qwen2.5:14b',
    tasks: {
      tools:       process.env['OLLAMA_MODEL']       ?? 'qwen2.5:14b',
      coding:      process.env['OLLAMA_CODER_MODEL'] ?? 'qwen2.5:14b',
      reasoning:   process.env['OLLAMA_MODEL']       ?? 'qwen2.5:14b',
      chat:        process.env['OLLAMA_CHAT_MODEL']  ?? 'gemma3:12b',
      longcontext: process.env['OLLAMA_CHAT_MODEL']  ?? 'gemma3:12b',
      quick:       process.env['OLLAMA_CHAT_MODEL']  ?? 'gemma3:12b',
    },
  }
}
