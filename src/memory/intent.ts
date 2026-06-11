// MIT License — personal-ai
// Explicit memory-intent detection and fact normalization.
// "remember i am studying CSE at IIT Dhanbad" → structured, normalized memory.

import type { MemoryType } from './types.js'

export interface MemoryIntent {
  /** Normalized fact, e.g. "User is a 2nd-year CSE student at IIT Dhanbad" */
  fact: string
  type: MemoryType
  importance: number
  tags: string[]
  /** Confirmation sentence shown instead of a normal chat reply. */
  confirmation: string
}

// Trigger phrases — anchored to the start of the message (after pleasantries)
const TRIGGER_RE = /^(?:hey|hi|ok|okay|please|also|and)?[,!\s]*(remember(?:\s+(?:that|this))?|don'?t\s+forget(?:\s+that)?|save\s+this|keep\s+in\s+mind(?:\s+that)?|you\s+should\s+know(?:\s+that)?|note\s+that)\b[:,\s]*/i

/**
 * Detect explicit memory intent. Returns null for normal chat messages.
 */
export function detectMemoryIntent(message: string): MemoryIntent | null {
  const match = TRIGGER_RE.exec(message.trim())
  if (!match) return null
  const raw = message.trim().slice(match[0].length).trim()
  if (raw.length < 3) return null

  const fact = normalizeFact(raw)
  const type = categorizeFact(fact)
  const tags = extractTags(fact, type)
  const importance = type === 'personal' || /name is/i.test(fact) ? 9 : 8

  return {
    fact, type, tags, importance,
    confirmation: `✓ I've remembered that ${toConfirmation(fact)}.`,
  }
}

/**
 * Rewrite first-person statements into third-person facts.
 *   "my name is Nandan"            → "User's name is Nandan"
 *   "i am studying CSE at IIT"     → "User studies CSE at IIT"
 *   "my favorite language is TS"   → "User's favorite language is TS"
 */
export function normalizeFact(raw: string): string {
  let s = raw.trim().replace(/\s+/g, ' ').replace(/[.!?]+$/, '')

  const rules: Array<[RegExp, string]> = [
    [/^my name is\s+/i,                'User\'s name is '],
    [/^my favorite\s+/i,               'User\'s favorite '],
    [/^my\s+/i,                        'User\'s '],
    [/^i am studying\s+|^i'?m studying\s+|^i study\s+/i, 'User studies '],
    [/^i am working (?:at|on)\s+/i,    'User works at '],
    [/^i work (?:at|for)\s+/i,         'User works at '],
    [/^i am a\s+|^i'?m a\s+/i,         'User is a '],
    [/^i am an\s+|^i'?m an\s+/i,       'User is an '],
    [/^i am\s+|^i'?m\s+/i,             'User is '],
    [/^i prefer\s+/i,                  'User prefers '],
    [/^i like\s+/i,                    'User likes '],
    [/^i hate\s+|^i dislike\s+/i,      'User dislikes '],
    [/^i live in\s+/i,                 'User lives in '],
    [/^i have\s+|^i'?ve got\s+/i,      'User has '],
    [/^i use\s+/i,                     'User uses '],
    [/^i want\s+/i,                    'User wants '],
  ]
  for (const [re, replacement] of rules) {
    if (re.test(s)) { s = s.replace(re, replacement); break }
  }

  // Mid-sentence first-person cleanup: "…and i am…" → "…and is…"
  s = s
    .replace(/\bmy\b/gi, 'their')
    .replace(/\bi am\b|\bi'?m\b/gi, 'is')
    .replace(/(?<!User's name )\bis Nandan\b/g, 'is Nandan') // keep names intact
    .replace(/\bi\b/g, 'they')

  if (!/^User/.test(s)) s = `User: ${s}`
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const EDUCATION_RE = /\b(stud(?:y|ies|ying)|college|university|iit|nit|b\.?tech|m\.?tech|degree|semester|year student|2nd year|3rd year|school|cse|ece|engineering)\b/i
const CAREER_RE    = /\b(works? at|job|career|intern(?:ship)?|company|salary|hired|employer)\b/i
const PROJECT_RE   = /\b(project|building|repo|app i|side.?project|startup)\b/i
const PREF_RE      = /\b(favorite|prefers?|likes?|dislikes?|hates?|loves?)\b/i
const PERSONAL_RE  = /\b(name is|birthday|lives? in|age|family|brother|sister|married)\b/i

export function categorizeFact(fact: string): MemoryType {
  if (PERSONAL_RE.test(fact))  return 'personal'
  if (EDUCATION_RE.test(fact)) return 'education'
  if (CAREER_RE.test(fact))    return 'career'
  if (PROJECT_RE.test(fact))   return 'project'
  if (PREF_RE.test(fact))      return 'preference'
  return 'fact'
}

const TAG_PATTERNS: Array<[RegExp, string]> = [
  [/\biit\s+(\w+)/i,        'iit-$1'],
  [/\bcse\b/i,              'cse'],
  [/\bece\b/i,              'ece'],
  [/\bcollege|university\b/i, 'college'],
  [/\btypescript\b/i,       'typescript'],
  [/\bjavascript\b/i,       'javascript'],
  [/\bpython\b/i,           'python'],
  [/\bcricket\b/i,          'cricket'],
]

export function extractTags(fact: string, type: MemoryType): string[] {
  const tags = new Set<string>([type])
  for (const [re, tag] of TAG_PATTERNS) {
    const m = re.exec(fact)
    if (m) tags.add(tag.replace('$1', (m[1] ?? '').toLowerCase()))
  }
  return [...tags]
}

/** "User's name is Nandan" → "your name is Nandan" for the confirmation line. */
function toConfirmation(fact: string): string {
  return fact
    .replace(/^User's\s+/i, 'your ')
    .replace(/^User is\s+/i, "you're ")
    .replace(/^User (\w+s)\s+/i, (_m, verb: string) => `you ${verb.replace(/s$/, '')} `)
    .replace(/^User:\s*/i, '')
    .replace(/\btheir\b/g, 'your')
    .replace(/\bthey\b/g, 'you')
}
