// MIT License — personal-ai
import readline from 'node:readline'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import chalk from 'chalk'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..', '..')

import { PROVIDER_META, type ProviderMeta } from '../providers/metadata.js'

type ProviderOpt = ProviderMeta

const PROVIDERS: ProviderOpt[] = Object.values(PROVIDER_META)

function ask(rl: readline.Interface, q: string): Promise<string> {
  return new Promise(resolve => rl.question(q, resolve))
}

/**
 * Ask for a secret without echoing it — each typed character renders as `*`.
 * Works by muting readline's output while the question is pending.
 */
function askHidden(rl: readline.Interface, q: string): Promise<string> {
  // readline.Interface exposes _writeToOutput internally; mask while pending
  const iface = rl as readline.Interface & { _writeToOutput?: (s: string) => void; output?: NodeJS.WritableStream }
  const original = iface._writeToOutput
  process.stdout.write(q)
  let muted = true
  iface._writeToOutput = (s: string) => {
    if (!muted) { original?.call(iface, s); return }
    // Echo newlines normally, mask everything else
    if (s.includes('\n') || s.includes('\r')) { process.stdout.write('\n'); return }
    process.stdout.write('*')
  }
  return new Promise(resolve => {
    rl.question('', answer => {
      muted = false
      if (original) iface._writeToOutput = original
      resolve(answer)
    })
  })
}

async function checkOllama(baseUrl: string): Promise<string[]> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) })
    if (!res.ok) return []
    const data = await res.json() as { models?: Array<{ name: string }> }
    return (data.models ?? []).map(m => m.name)
  } catch { return [] }
}

// fallow-ignore-next-line complexity
async function testKey(p: ProviderOpt, key: string): Promise<boolean> {
  if (!p.testUrl) return true
  try {
    const headers: Record<string, string> = p.testAuthHeader ? p.testAuthHeader(key) : {}
    const res = await fetch(p.testUrl, { headers, signal: AbortSignal.timeout(5000) })
    return res.ok
  } catch { return false }
}

/** Returns true if setup wizard should run (no .env or PROVIDER unset). */
export function needsSetup(envPath: string): boolean {
  if (!fs.existsSync(envPath)) return true
  const content = fs.readFileSync(envPath, 'utf8')
  return !content.match(/^\s*PROVIDER\s*=/m)
}

async function step1PickProvider(rl: readline.Interface): Promise<ProviderOpt> {
  console.log(chalk.bold('  Step 1 of 3 — Choose a provider\n'))
  // fallow-ignore-next-line complexity
  PROVIDERS.forEach((p, i) => {
    const tags: string[] = []
    if (p.free)  tags.push(chalk.green('FREE'))
    if (p.local) tags.push(chalk.cyan('LOCAL'))
    const tagStr = tags.length ? '  ' + tags.join(' ') : ''
    console.log(`  ${chalk.bold(`${i + 1}.`)} ${p.label}${tagStr}`)
    console.log(`     ${chalk.dim(p.hint)}`)
    if (p.signupUrl) console.log(`     ${chalk.dim(p.signupUrl)}`)
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
  return prov
}

// fallow-ignore-next-line complexity
async function configOllama(rl: readline.Interface): Promise<string[]> {
  console.log(chalk.bold('  Step 2 of 3 — Ollama config\n'))
  const baseUrl = (await ask(rl, chalk.cyan('  Ollama URL [http://localhost:11434]: '))).trim() || 'http://localhost:11434'
  const lines = [`OLLAMA_BASE_URL=${baseUrl}`]
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
  const defMain   = models.find(m => m.startsWith('qwen2.5')) || models[0] || 'qwen2.5:14b'
  const defChat   = models.find(m => m.startsWith('gemma3'))  || models[1] || 'gemma3:12b'
  const mainModel = (await ask(rl, chalk.cyan(`  Primary model [${defMain}]: `))).trim() || defMain
  const chatModel = (await ask(rl, chalk.cyan(`  Chat model   [${defChat}]: `))).trim() || defChat
  lines.push(`OLLAMA_MODEL=${mainModel}`, `OLLAMA_CHAT_MODEL=${chatModel}`,
    'OLLAMA_NUM_CTX=8192', 'OLLAMA_NUM_PREDICT=512', 'OLLAMA_TEMPERATURE=0.7')
  return lines
}

async function configLMStudio(rl: readline.Interface): Promise<string[]> {
  console.log(chalk.bold('  Step 2 of 3 — LM Studio config\n'))
  const baseUrl = (await ask(rl, chalk.cyan('  LM Studio URL [http://localhost:1234/v1]: '))).trim() || 'http://localhost:1234/v1'
  const model   = (await ask(rl, chalk.cyan('  Model name [local-model]: '))).trim() || 'local-model'
  return [`LMSTUDIO_BASE_URL=${baseUrl}`, `LMSTUDIO_MODEL=${model}`]
}

// fallow-ignore-next-line complexity
async function configApiKey(rl: readline.Interface, prov: ProviderOpt): Promise<string[]> {
  console.log(chalk.bold(`  Step 2 of 3 — ${prov.label} config\n`))
  let apiKey = ''
  while (!apiKey) {
    apiKey = (await askHidden(rl, chalk.cyan(`  ${prov.envKey} (input hidden): `))).trim()
    if (!apiKey) console.log(chalk.yellow('  Key required\n'))
  }
  process.stdout.write(chalk.dim('  Testing key... '))
  const ok = await testKey(prov, apiKey)
  console.log(ok ? chalk.green('valid ✓') : chalk.yellow('could not verify (may still work)'))
  console.log()
  const model = (await ask(rl, chalk.cyan(`  Model [${prov.defaultModel}]: `))).trim() || prov.defaultModel
  return [`${prov.envKey}=${apiKey}`, `${prov.modelEnvKey}=${model}`]
}

async function step2ProviderConfig(rl: readline.Interface, prov: ProviderOpt): Promise<string[]> {
  const base = [`PROVIDER=${prov.key}`]
  if (prov.key === 'ollama')    return [...base, ...await configOllama(rl)]
  if (prov.key === 'lmstudio')  return [...base, ...await configLMStudio(rl)]
  if (prov.envKey)              return [...base, ...await configApiKey(rl, prov)]
  return base
}

async function step3Persona(rl: readline.Interface): Promise<void> {
  console.log(chalk.bold('\n  Step 3 of 3 — Persona\n'))
  const userName = (await ask(rl, chalk.cyan('  Your name [User]: '))).trim() || 'User'
  const aiName   = (await ask(rl, chalk.cyan('  Assistant name [Aria]: '))).trim() || 'Aria'
  const personaPath = path.join(ROOT, 'config', 'persona.yaml')
  if (fs.existsSync(personaPath)) {
    let yaml = fs.readFileSync(personaPath, 'utf8')
    yaml = yaml.replace(/^name:\s*.*$/m,      `name: "${aiName}"`)
    yaml = yaml.replace(/^user_name:\s*.*$/m, `user_name: "${userName}"`)
    fs.writeFileSync(personaPath, yaml)
    console.log(chalk.dim('  Updated config/persona.yaml'))
  }
}

export async function runSetupWizard(envPath: string): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })

  console.clear()
  console.log(chalk.cyan([
    '', '  ╔══════════════════════════════════════════╗',
    `  ║  ${chalk.bold('PersonalAI')} — First-Run Setup             ║`,
    `  ║  ${chalk.dim('Local-first. Any model. Any provider.')}   ║`,
    '  ╚══════════════════════════════════════════╝', '',
  ].join('\n')))

  const prov     = await step1PickProvider(rl)
  const envLines = await step2ProviderConfig(rl, prov)
  await step3Persona(rl)

  fs.writeFileSync(envPath, ['# PersonalAI — generated by setup wizard', ...envLines, '', '# LOG_LEVEL=info'].join('\n') + '\n')

  console.log(chalk.green(`\n  ✓ Wrote .env`))
  console.log(chalk.cyan([
    '', '  ╔══════════════════════════════════════════╗',
    `  ║  ${chalk.bold.green('Setup complete!')}                           ║`,
    '  ║                                          ║',
    `  ║  CLI:  ${chalk.bold('npm start')}                         ║`,
    `  ║  Web:  ${chalk.bold('npm run web')}                       ║`,
    '  ╚══════════════════════════════════════════╝', '',
  ].join('\n')))

  rl.close()
}
