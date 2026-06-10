// MIT License — personal-ai
import readline from 'node:readline'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import chalk from 'chalk'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..', '..')

interface ProviderOpt {
  key:          string
  label:        string
  free:         boolean
  local:        boolean
  envKey?:      string
  modelEnvKey:  string
  defaultModel: string
  hint:         string
  signup?:      string
  testUrl?:     string
  testAuthHeader?: (key: string) => Record<string, string>
}

const PROVIDERS: ProviderOpt[] = [
  {
    key: 'ollama', label: 'Ollama', free: true, local: true,
    modelEnvKey: 'OLLAMA_MODEL', defaultModel: 'qwen2.5:14b',
    hint: 'Runs models locally — no API key needed',
  },
  {
    key: 'anthropic', label: 'Anthropic (Claude)', free: false, local: false,
    envKey: 'ANTHROPIC_API_KEY', modelEnvKey: 'ANTHROPIC_MODEL', defaultModel: 'claude-sonnet-4-6',
    hint: 'Paid — claude-sonnet-4-6, claude-haiku-4-5',
    signup: 'https://console.anthropic.com',
    testUrl: 'https://api.anthropic.com/v1/models',
    testAuthHeader: k => ({ 'x-api-key': k, 'anthropic-version': '2023-06-01' }),
  },
  {
    key: 'openai', label: 'OpenAI (GPT)', free: false, local: false,
    envKey: 'OPENAI_API_KEY', modelEnvKey: 'OPENAI_MODEL', defaultModel: 'gpt-4o-mini',
    hint: 'Paid — gpt-4o-mini, gpt-4o',
    signup: 'https://platform.openai.com/api-keys',
    testUrl: 'https://api.openai.com/v1/models',
    testAuthHeader: k => ({ 'Authorization': `Bearer ${k}` }),
  },
  {
    key: 'groq', label: 'Groq', free: true, local: false,
    envKey: 'GROQ_API_KEY', modelEnvKey: 'GROQ_MODEL', defaultModel: 'llama-3.3-70b-versatile',
    hint: 'Free 14k req/day — very fast inference',
    signup: 'https://console.groq.com/keys',
    testUrl: 'https://api.groq.com/openai/v1/models',
    testAuthHeader: k => ({ 'Authorization': `Bearer ${k}` }),
  },
  {
    key: 'gemini', label: 'Google Gemini', free: true, local: false,
    envKey: 'GEMINI_API_KEY', modelEnvKey: 'GEMINI_MODEL', defaultModel: 'gemini-2.0-flash',
    hint: 'Free 1500 req/day',
    signup: 'https://aistudio.google.com/app/apikey',
  },
  {
    key: 'mistral', label: 'Mistral', free: false, local: false,
    envKey: 'MISTRAL_API_KEY', modelEnvKey: 'MISTRAL_MODEL', defaultModel: 'mistral-large-latest',
    hint: 'Paid API',
    signup: 'https://console.mistral.ai/api-keys/',
    testUrl: 'https://api.mistral.ai/v1/models',
    testAuthHeader: k => ({ 'Authorization': `Bearer ${k}` }),
  },
  {
    key: 'lmstudio', label: 'LM Studio', free: true, local: true,
    modelEnvKey: 'LMSTUDIO_MODEL', defaultModel: 'local-model',
    hint: 'Local server at http://localhost:1234 — no key needed',
  },
  {
    key: 'together', label: 'Together.ai', free: false, local: false,
    envKey: 'TOGETHER_API_KEY', modelEnvKey: 'TOGETHER_MODEL',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    hint: '$1 free credit',
    signup: 'https://api.together.xyz/settings/api-keys',
    testUrl: 'https://api.together.xyz/v1/models',
    testAuthHeader: k => ({ 'Authorization': `Bearer ${k}` }),
  },
]

function ask(rl: readline.Interface, q: string): Promise<string> {
  return new Promise(resolve => rl.question(q, resolve))
}

async function checkOllama(baseUrl: string): Promise<string[]> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) })
    if (!res.ok) return []
    const data = await res.json() as { models?: Array<{ name: string }> }
    return (data.models ?? []).map(m => m.name)
  } catch { return [] }
}

async function testKey(p: ProviderOpt, key: string): Promise<boolean> {
  if (!p.testUrl) return true
  try {
    const headers: Record<string, string> = p.testAuthHeader ? p.testAuthHeader(key) : {}
    const url = p.key === 'gemini' ? `${p.testUrl}?key=${key}` : p.testUrl
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) })
    return res.ok
  } catch { return false }
}

/** Returns true if setup wizard should run (no .env or PROVIDER unset). */
export function needsSetup(envPath: string): boolean {
  if (!fs.existsSync(envPath)) return true
  const content = fs.readFileSync(envPath, 'utf8')
  return !content.match(/^\s*PROVIDER\s*=/m)
}

export async function runSetupWizard(envPath: string): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })

  console.clear()
  console.log(chalk.cyan([
    '',
    '  ╔══════════════════════════════════════════╗',
    `  ║  ${chalk.bold('PersonalAI')} — First-Run Setup             ║`,
    `  ║  ${chalk.dim('Local-first. Any model. Any provider.')}   ║`,
    '  ╚══════════════════════════════════════════╝',
    '',
  ].join('\n')))

  // ── Step 1: pick provider ──────────────────────────────────────────
  console.log(chalk.bold('  Step 1 of 3 — Choose a provider\n'))
  PROVIDERS.forEach((p, i) => {
    const tags: string[] = []
    if (p.free)  tags.push(chalk.green('FREE'))
    if (p.local) tags.push(chalk.cyan('LOCAL'))
    const tagStr = tags.length ? '  ' + tags.join(' ') : ''
    console.log(`  ${chalk.bold(`${i + 1}.`)} ${p.label}${tagStr}`)
    console.log(`     ${chalk.dim(p.hint)}`)
    if (p.signup) console.log(`     ${chalk.dim(p.signup)}`)
    console.log()
  })

  let prov: ProviderOpt | undefined
  while (!prov) {
    const raw = (await ask(rl, chalk.cyan('  Enter number (1-8): '))).trim()
    const idx  = parseInt(raw, 10) - 1
    if (idx >= 0 && idx < PROVIDERS.length) prov = PROVIDERS[idx]
    else console.log(chalk.yellow('  Please enter 1-8\n'))
  }
  console.log(chalk.green(`\n  ✓ ${prov.label}\n`))

  // ── Step 2: provider config ────────────────────────────────────────
  const envLines: string[] = [`PROVIDER=${prov.key}`]

  if (prov.key === 'ollama') {
    console.log(chalk.bold('  Step 2 of 3 — Ollama config\n'))
    const baseUrl = (await ask(rl, chalk.cyan('  Ollama URL [http://localhost:11434]: '))).trim()
      || 'http://localhost:11434'
    envLines.push(`OLLAMA_BASE_URL=${baseUrl}`)

    process.stdout.write(chalk.dim('  Checking Ollama... '))
    const models = await checkOllama(baseUrl)
    if (!models.length) {
      console.log(chalk.yellow('not running or no models'))
      console.log(chalk.dim('  Start: ollama serve'))
      console.log(chalk.dim('  Pull:  ollama pull qwen2.5:14b && ollama pull gemma3:12b\n'))
    } else {
      console.log(chalk.green(`${models.length} model(s) found`))
      console.log(chalk.dim(`  ${models.slice(0, 6).join('  ')}${models.length > 6 ? ` …+${models.length - 6}` : ''}\n`))
    }

    const defMain = models.find(m => m.startsWith('qwen2.5')) || models[0] || 'qwen2.5:14b'
    const defChat = models.find(m => m.startsWith('gemma3'))  || models[1] || 'gemma3:12b'

    const mainModel = (await ask(rl, chalk.cyan(`  Primary model [${defMain}]: `))).trim() || defMain
    const chatModel = (await ask(rl, chalk.cyan(`  Chat model   [${defChat}]: `))).trim() || defChat

    envLines.push(`OLLAMA_MODEL=${mainModel}`)
    envLines.push(`OLLAMA_CHAT_MODEL=${chatModel}`)
    envLines.push('OLLAMA_NUM_CTX=2048')
    envLines.push('OLLAMA_NUM_PREDICT=512')
    envLines.push('OLLAMA_TEMPERATURE=0.7')

  } else if (prov.key === 'lmstudio') {
    console.log(chalk.bold('  Step 2 of 3 — LM Studio config\n'))
    const baseUrl = (await ask(rl, chalk.cyan('  LM Studio URL [http://localhost:1234/v1]: '))).trim()
      || 'http://localhost:1234/v1'
    const model   = (await ask(rl, chalk.cyan('  Model name [local-model]: '))).trim() || 'local-model'
    envLines.push(`LMSTUDIO_BASE_URL=${baseUrl}`)
    envLines.push(`LMSTUDIO_MODEL=${model}`)

  } else if (prov.envKey) {
    console.log(chalk.bold(`  Step 2 of 3 — ${prov.label} config\n`))
    let apiKey = ''
    while (!apiKey) {
      apiKey = (await ask(rl, chalk.cyan(`  ${prov.envKey}: `))).trim()
      if (!apiKey) console.log(chalk.yellow('  Key required\n'))
    }
    envLines.push(`${prov.envKey}=${apiKey}`)

    process.stdout.write(chalk.dim('  Testing key... '))
    const ok = await testKey(prov, apiKey)
    console.log(ok ? chalk.green('valid ✓') : chalk.yellow('could not verify (may still work)'))
    console.log()

    const model = (await ask(rl, chalk.cyan(`  Model [${prov.defaultModel}]: `))).trim() || prov.defaultModel
    envLines.push(`${prov.modelEnvKey}=${model}`)
  }

  // ── Step 3: persona ────────────────────────────────────────────────
  console.log(chalk.bold('\n  Step 3 of 3 — Persona\n'))
  const userName  = (await ask(rl, chalk.cyan('  Your name [User]: '))).trim() || 'User'
  const aiName    = (await ask(rl, chalk.cyan('  Assistant name [Aria]: '))).trim() || 'Aria'

  const personaPath = path.join(ROOT, 'config', 'persona.yaml')
  if (fs.existsSync(personaPath)) {
    let yaml = fs.readFileSync(personaPath, 'utf8')
    yaml = yaml.replace(/^name:\s*.*$/m,      `name: "${aiName}"`)
    yaml = yaml.replace(/^user_name:\s*.*$/m, `user_name: "${userName}"`)
    fs.writeFileSync(personaPath, yaml)
    console.log(chalk.dim('  Updated config/persona.yaml'))
  }

  // ── Write .env ─────────────────────────────────────────────────────
  const envContent = [
    '# PersonalAI — generated by setup wizard',
    ...envLines,
    '',
    '# LOG_LEVEL=info',
  ].join('\n') + '\n'

  fs.writeFileSync(envPath, envContent)

  // ── Done ───────────────────────────────────────────────────────────
  console.log(chalk.green(`\n  ✓ Wrote .env`))
  console.log(chalk.cyan([
    '',
    '  ╔══════════════════════════════════════════╗',
    `  ║  ${chalk.bold.green('Setup complete!')}                           ║`,
    '  ║                                          ║',
    `  ║  CLI:  ${chalk.bold('npm start')}                         ║`,
    `  ║  Web:  ${chalk.bold('npm run web')}                       ║`,
    '  ╚══════════════════════════════════════════╝',
    '',
  ].join('\n')))

  rl.close()
}
