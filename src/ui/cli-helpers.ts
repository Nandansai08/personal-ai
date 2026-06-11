// MIT License — personal-ai
// Pure helpers for the CLI — no readline, no provider, no engine dependencies.
import fs from 'node:fs'
import chalk from 'chalk'

// Tool names whose XML blocks should be stripped from display if output as raw text
const TOOL_XML_NAMES = ['memory', 'web_search', 'notes', 'tasks', 'calculator', 'file_reader', 'tool']
const TOOL_OPEN_RE   = new RegExp(`<(${TOOL_XML_NAMES.join('|')})>`, 'i')

/** Streaming filter: buffers and strips XML tool-call blocks from displayed text. */
export function makeToolXmlStripper(): { feed(text: string): string; flush(): string } {
  let inTag: string | null = null
  let buf = ''

  function feed(text: string): string {
    buf += text
    let out = ''
    while (true) {
      if (!inTag) {
        const match = TOOL_OPEN_RE.exec(buf)
        if (!match) {
          // Guard last 20 chars against partial opening tag
          const safe = buf.length > 20 ? buf.length - 20 : 0
          out += buf.slice(0, safe)
          buf  = buf.slice(safe)
          break
        }
        out  += buf.slice(0, match.index)
        inTag = (match[1] ?? '').toLowerCase()
        buf   = buf.slice(match.index + match[0].length)
      } else {
        const closeOwn  = `</${inTag}>`
        const closeArgs = '</args>'
        const iOwn  = buf.indexOf(closeOwn)
        const iArgs = buf.indexOf(closeArgs)
        // Pick whichever closing tag comes first
        let end = -1; let len = 0
        if (iOwn !== -1 && (iArgs === -1 || iOwn <= iArgs))  { end = iOwn;  len = closeOwn.length  }
        else if (iArgs !== -1)                                 { end = iArgs; len = closeArgs.length }
        if (end === -1) break  // still accumulating
        buf   = buf.slice(end + len)
        inTag = null
      }
    }
    return out
  }

  function flush(): string {
    const result = inTag ? '' : buf
    buf = ''; inTag = null
    return result
  }

  return { feed, flush }
}

/**
 * Stream renderer with line-state tracking.
 *
 * Invariants:
 * - Text chunks render continuously — nothing is ever inserted mid-word.
 * - The XML stripper's held-back tail is flushed BEFORE any status output
 *   (tool pills, model switches, token usage). Printing status before the
 *   flush was the bug that split words across the usage line.
 * - Status lines start on a fresh line, never gluing onto streamed text.
 */
export function createStreamRenderer(write: (s: string) => void): {
  text(delta: string): void
  toolCall(name: string): void
  toolResult(): void
  modelSwitch(from: string, to: string): void
  error(msg: string): void
  usage(input: number, output: number): void
  finish(): void
} {
  const filter = makeToolXmlStripper()
  let midLine = false

  const emit = (s: string): void => {
    if (!s) return
    write(s)
    midLine = !s.endsWith('\n')
  }
  const flushFilter = (): void => { emit(filter.flush()) }
  const freshLine = (): void => {
    flushFilter()
    if (midLine) { write('\n'); midLine = false }
  }

  return {
    text(delta: string): void { emit(filter.feed(delta)) },
    toolCall(name: string): void {
      freshLine()
      write(chalk.cyan(`  ⟳ ${name}…`))
      midLine = true
    },
    toolResult(): void {
      write(chalk.green(' ✓\n'))
      midLine = false
    },
    modelSwitch(from: string, to: string): void {
      freshLine()
      write(chalk.dim(`  ⟳ switching model: ${from} → ${to}\n`))
      midLine = false
    },
    error(msg: string): void {
      freshLine()
      write(chalk.red(`Error: ${msg}\n`))
      midLine = false
    },
    usage(input: number, output: number): void {
      freshLine()
      write(chalk.dim(`  [${input}in / ${output}out tokens]\n`))
      midLine = false
    },
    finish(): void { flushFilter() },
  }
}

/** Update or append KEY=value lines in a .env file. */
export function patchEnvFile(envPath: string, changes: Record<string, string>): void {
  let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : ''
  for (const [key, val] of Object.entries(changes)) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`^${escaped}=.*$`, 'm')
    if (re.test(content)) {
      // Function replacer — a literal `$` in val must not trigger
      // replacement-pattern expansion ($&, $', …) and corrupt the .env
      content = content.replace(re, () => `${key}=${val}`)
    } else {
      content += `\n${key}=${val}`
    }
  }
  fs.writeFileSync(envPath, content)
}

/** Maps raw provider error messages to actionable user-facing strings. */
export function friendlyError(msg: string, providerName?: string): string {
  if (/401|unauthorized|invalid.*key|api.?key/i.test(msg)) {
    const key = providerName ? `${providerName.toUpperCase()}_API_KEY` : 'PROVIDER_API_KEY'
    return `Invalid API key. Check ${key} in .env`
  }
  if (/ECONNREFUSED|ENOTFOUND|connect.*ollama/i.test(msg))
    return 'Ollama not running. Run: ollama serve'
  if (/model.*not.?found|pull.*model|does not exist|is not found/i.test(msg)) {
    const isOllama = providerName === 'ollama' || /\bollama\b/i.test(msg)
    const m = msg.match(/["']([^"']+)["']/) ?? msg.match(/model[s]?[\s/]+(\S+:\S+)/i)
    const name = m?.[1]
    if (isOllama)
      return `Model ${name ?? 'unknown'} not installed. Run: ollama pull ${name ?? '<model>'}`
    return `Model not available on ${providerName ?? 'this provider'}. To use local models run: /switch ollama`
  }
  if (/429|rate.?limit|too many requests/i.test(msg))
    return 'Rate limit hit. Wait 60s or run /switch for provider-switch instructions'
  return msg
}
