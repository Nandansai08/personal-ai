// MIT License — personal-ai

export type TaskType = 'tools' | 'coding' | 'reasoning' | 'chat' | 'longcontext' | 'quick' | 'default'

export interface AgentProfile {
  name: string
  systemPromptAddon: string
  preferredModel: string
  toolsPriority: string[]
}

export interface PersonaConfig {
  activeProfile: string
  profiles: Record<string, AgentProfile>
}
