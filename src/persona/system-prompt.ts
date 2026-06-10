// MIT License — personal-ai
import type { PersonaConfig, ProfileConfig } from './types.js'
import type { Memory } from '../memory/types.js'

const GEMMA3_MODELS = ['gemma3:', 'gemma3n:', 'phi4:', 'phi3:']

export function isGemma3Model(model: string): boolean {
  return GEMMA3_MODELS.some(p => model.startsWith(p))
}

/** Rough token estimate: ~4 chars per token. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/** Trim memories list until prompt fits within maxTokens. */
export function trimMemoriesIfNeeded(
  memories: Memory[],
  basePrompt: string,
  maxTokens: number,
): Memory[] {
  const sorted = [...memories].sort((a, b) => b.importance - a.importance)
  let result = sorted
  while (result.length > 0 && estimateTokens(basePrompt) + estimateTokens(memBlock(result)) > maxTokens) {
    result = result.slice(0, result.length - 1)
  }
  return result
}

function memBlock(memories: Memory[]): string {
  return memories.map(m => `- [${m.type}] ${m.content}`).join('\n')
}

/**
 * Build final system prompt.
 * Qwen/API: markdown, up to 2000 tokens.
 * Gemma3/phi: numbered plain text, under 1500 tokens.
 * Tool instructions always last.
 */
export function buildSystemPrompt(
  persona: PersonaConfig,
  profile: ProfileConfig,
  memories: Memory[],
  toolsSection: string,
  date: Date,
  forGemma3 = false,
): string {
  const maxTokens = forGemma3 ? 1500 : 2000
  const dateStr   = date.toISOString().split('T')[0]!

  if (forGemma3) {
    return buildGemma3Prompt(persona, profile, memories, toolsSection, dateStr, maxTokens)
  }
  return buildMarkdownPrompt(persona, profile, memories, toolsSection, dateStr, maxTokens)
}

function buildMarkdownPrompt(
  persona: PersonaConfig,
  profile: ProfileConfig,
  memories: Memory[],
  toolsSection: string,
  dateStr: string,
  maxTokens: number,
): string {
  const userName = persona.user_name ? ` The user's name is ${persona.user_name}.` : ''
  const tone     = persona.tone ? ` Tone: ${persona.tone}.` : ''

  const sections: string[] = [
    `# ${persona.name}`,
    `You are ${persona.name}, a personal AI assistant.${userName}${tone}`,
    `Today: ${dateStr}. Always respond in the same language the user writes in. If the user writes in English, respond in English only.`,
  ]

  if (persona.expertise.length > 0) {
    sections.push(`\n## Expertise\n${persona.expertise.map(e => `- ${e}`).join('\n')}`)
  }

  if (persona.avoid.length > 0) {
    sections.push(`\n## Avoid\n${persona.avoid.map(a => `- "${a}"`).join('\n')}`)
  }

  if (persona.custom_instructions) {
    sections.push(`\n## Instructions\n${persona.custom_instructions.trim()}`)
  }

  if (profile.system_addon) {
    sections.push(`\n## Mode: ${profile.name}\n${profile.system_addon.trim()}`)
  }

  const basePrompt = sections.join('\n')
  const trimmed    = trimMemoriesIfNeeded(memories, basePrompt + toolsSection, maxTokens)

  if (trimmed.length > 0) {
    sections.push(`\n## Relevant Memory\n${memBlock(trimmed)}`)
  }

  if (toolsSection) sections.push(`\n${toolsSection}`)

  return sections.join('\n')
}

function buildGemma3Prompt(
  persona: PersonaConfig,
  profile: ProfileConfig,
  memories: Memory[],
  toolsSection: string,
  dateStr: string,
  maxTokens: number,
): string {
  let n = 1
  const lines: string[] = [
    `You are ${persona.name}, a personal AI assistant. Today: ${dateStr}. Always respond in the same language the user writes in.`,
  ]

  if (persona.user_name) lines.push(`${n++}. User name: ${persona.user_name}.`)
  if (persona.tone)      lines.push(`${n++}. Tone: ${persona.tone}.`)

  if (persona.expertise.length > 0) {
    lines.push(`${n++}. Expertise: ${persona.expertise.join(', ')}.`)
  }

  if (persona.avoid.length > 0) {
    lines.push(`${n++}. Never say: ${persona.avoid.join(', ')}.`)
  }

  if (persona.custom_instructions) {
    for (const line of persona.custom_instructions.trim().split('\n').filter(Boolean)) {
      lines.push(`${n++}. ${line.trim()}`)
    }
  }

  if (profile.system_addon) {
    for (const line of profile.system_addon.trim().split('\n').filter(Boolean)) {
      lines.push(`${n++}. ${line.trim()}`)
    }
  }

  const basePrompt = lines.join('\n')
  const trimmed    = trimMemoriesIfNeeded(memories, basePrompt + toolsSection, maxTokens)

  if (trimmed.length > 0) {
    lines.push(`${n++}. Context: ${trimmed.map(m => m.content).join(' | ')}`)
  }

  if (toolsSection) lines.push(`\n${toolsSection}`)

  return lines.join('\n')
}
