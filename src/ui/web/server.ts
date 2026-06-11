// MIT License — personal-ai
import http from 'node:http'
import net from 'node:net'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import { WebSocketServer, WebSocket } from 'ws'
import type { LLMProvider } from '../../providers/interface.js'
import type { LongTermMemory } from '../../memory/long-term.js'
import type { ProfileManager } from '../../persona/profiles.js'
import type { ToolRegistry } from '../../tools/registry.js'
import type { ModelManager } from '../../core/model-manager.js'
import type { Memory, NewMemory } from '../../memory/types.js'
import { AssistantEngine } from '../../core/assistant.js'
import { ConversationContext } from '../../core/context.js'
import { buildSystemPrompt, isGemma3Model } from '../../persona/system-prompt.js'
import { loadPersona } from '../../persona/loader.js'
import { logger } from '../../core/logger.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLIENT_DIR = path.join(__dirname, 'client')

export interface WebServerOptions {
  provider:       LLMProvider
  memory?:        LongTermMemory
  profileManager: ProfileManager
  registry?:      ToolRegistry
  modelManager?:  ModelManager
  plugins?:       import('../../plugins/manager.js').PluginManager
  mcp?:           import('../../mcp/loader.js').McpManager
  personaPath:    string
  port?:          number
}

function findFreePort(start: number): Promise<number> {
  return new Promise(resolve => {
    const srv = net.createServer()
    srv.unref()
    srv.on('error', () => resolve(findFreePort(start + 1)))
    srv.listen(start, () => { srv.close(() => resolve(start)) })
  })
}

export async function createWebServer(opts: WebServerOptions): Promise<{ server: http.Server; port: number; token: string }> {
  const { provider, memory, profileManager, registry, modelManager, plugins, mcp, personaPath } = opts
  const preferred = opts.port ?? parseInt(process.env['PORT'] ?? '3000', 10)
  const PORT = await findFreePort(preferred)

  // Security: per-session bearer token. Required on every /api request and WS
  // upgrade. The launch URL carries it once (?token=…); the client stores it.
  // Override with WEB_AUTH_TOKEN for a stable token across restarts.
  const TOKEN = process.env['WEB_AUTH_TOKEN'] ?? randomBytes(16).toString('hex')

  const app = express()

  // Security: validate Host header to block DNS-rebinding attacks.
  // The server binds to 127.0.0.1 only; this guards against a malicious domain
  // resolving to 127.0.0.1 and bypassing the same-origin policy.
  const isLocalHost = (host: string | undefined): boolean => {
    if (!host) return false
    const name = host.split(':')[0] ?? ''
    return name === 'localhost' || name === '127.0.0.1' || name === '[::1]'
  }
  app.use((req, res, next) => {
    if (!isLocalHost(req.headers.host)) {
      res.status(403).json({ error: 'forbidden: invalid host' })
      return
    }
    next()
  })

  const tokenOk = (candidate: string | undefined): boolean => {
    if (!candidate) return false
    const a = Buffer.from(candidate)
    const b = Buffer.from(TOKEN)
    return a.length === b.length && timingSafeEqual(a, b)
  }

  // Security: every /api request must carry the session token
  // (Authorization: Bearer <token> or ?token=<token>). Static files are
  // exempt — the client page itself reads the token from the launch URL.
  app.use('/api', (req, res, next) => {
    const header = req.headers.authorization
    const bearer = header?.startsWith('Bearer ') ? header.slice(7) : undefined
    const query  = typeof req.query['token'] === 'string' ? req.query['token'] : undefined
    if (!tokenOk(bearer ?? query)) {
      res.status(401).json({ error: 'unauthorized: missing or invalid token' })
      return
    }
    next()
  })

  app.use(cors({ origin: [`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`] }))
  app.use(express.json({ limit: '256kb' }))
  app.use(express.static(CLIENT_DIR))

  // ── REST endpoints ──────────────────────────────────────────────────

  app.get('/api/health', (_req, res) => {
    void (async () => {
      if (provider.healthCheck) {
        const h = await provider.healthCheck()
        res.json(h)
      } else {
        res.json({ ok: true, latencyMs: 0, model: provider.model })
      }
    })()
  })

  app.get('/api/provider', (_req, res) => {
    res.json({
      name:            provider.name,
      model:           modelManager ? modelManager.getCurrentModel() : provider.model,
      supportsToolUse: provider.supportsToolUse,
    })
  })

  app.get('/api/memories', (req, res) => {
    void (async () => {
      if (!memory) { res.json([]); return }
      const q = req.query['q'] as string | undefined
      const semantic = req.query['mode'] === 'semantic'
      const results = q
        ? (semantic ? await memory.searchSemantic(q, 20) : memory.search(q, 20))
        : memory.getRecent(20)
      res.json(results)
    })()
  })

  app.post('/api/memories', (req, res) => {
    if (!memory) { res.status(503).json({ error: 'memory not enabled' }); return }
    const body = req.body as Partial<NewMemory>
    if (!body.content || !body.type) {
      res.status(400).json({ error: 'content and type required' }); return
    }
    const saved = memory.save(body as NewMemory)
    res.status(201).json(saved)
  })

  app.delete('/api/memories/:id', (req, res) => {
    if (!memory) { res.status(503).json({ error: 'memory not enabled' }); return }
    memory.archive(req.params['id']!)
    res.json({ archived: true })
  })

  app.get('/api/tasks', (_req, res) => {
    if (!registry) { res.json([]); return }
    const taskTool = registry.getAll().find(t => t.definition.name === 'tasks')
    if (!taskTool) { res.json([]); return }
    void taskTool.execute({ action: 'list', filter: 'all' })
      .then(r => res.json(r.data ?? []))
      .catch(() => res.json([]))
  })

  app.post('/api/tasks', (req, res) => {
    if (!registry) { res.status(503).json({ error: 'registry not available' }); return }
    const taskTool = registry.getAll().find(t => t.definition.name === 'tasks')
    if (!taskTool) { res.status(503).json({ error: 'tasks tool not registered' }); return }
    void taskTool.execute({ action: 'create', ...req.body as Record<string, unknown> })
      .then(r => r.success ? res.status(201).json(r.data) : res.status(400).json({ error: r.error }))
      .catch(e => res.status(500).json({ error: String(e) }))
  })

  app.patch('/api/tasks/:id', (req, res) => {
    if (!registry) { res.status(503).json({ error: 'registry not available' }); return }
    const taskTool = registry.getAll().find(t => t.definition.name === 'tasks')
    if (!taskTool) { res.status(503).json({ error: 'tasks tool not registered' }); return }
    void taskTool.execute({ action: 'update', id: req.params['id'], ...req.body as Record<string, unknown> })
      .then(r => r.success ? res.json(r.data) : res.status(400).json({ error: r.error }))
      .catch(e => res.status(500).json({ error: String(e) }))
  })

  app.get('/api/profile', (_req, res) => {
    res.json({
      name:   profileManager.getActiveName(),
      config: profileManager.getActive(),
      all:    profileManager.getAll(),
    })
  })

  app.put('/api/profile', (req, res) => {
    const { name } = req.body as { name?: string }
    if (!name) { res.status(400).json({ error: 'name required' }); return }
    try {
      profileManager.setActive(name)
      res.json({ name, config: profileManager.getActive() })
    } catch (e) {
      res.status(400).json({ error: String(e) })
    }
  })

  app.get('/api/stats', (_req, res) => {
    res.json({
      memories: memory ? memory.getStats() : null,
      memoryIndex: memory ? memory.getIndexStats() : null,
      model:    modelManager
        ? modelManager.getStats()
        : { current: provider.model, mode: 'manual', config: {} },
      tools: registry
        ? registry.getAll().map(t => ({
            name: t.definition.name,
            description: t.definition.description,
            requiresConfirmation: t.requiresConfirmation === true,
            source: t.definition.name.startsWith('mcp_') ? 'mcp' : 'builtin',
          }))
        : [],
    })
  })

  // Read-only plugin visibility (Settings → Plugins)
  app.get('/api/plugins', (_req, res) => {
    res.json(plugins ? plugins.health() : [])
  })

  // Read-only MCP server visibility (Settings → MCP)
  app.get('/api/mcp', (_req, res) => {
    res.json(mcp ? mcp.list() : [])
  })

  app.get('/api/system', (_req, res) => {
    const totalMem  = os.totalmem()
    const freeMem   = os.freemem()
    const usedMem   = totalMem - freeMem
    const cpus      = os.cpus()
    const loadAvg1m = os.loadavg()[0] ?? 0
    res.json({
      totalMemMb:  Math.round(totalMem / 1024 / 1024),
      freeMemMb:   Math.round(freeMem  / 1024 / 1024),
      usedMemMb:   Math.round(usedMem  / 1024 / 1024),
      usedMemPct:  Math.round((usedMem / totalMem) * 100),
      cpuModel:    cpus[0]?.model ?? 'Unknown',
      cpuCount:    cpus.length,
      loadAvg1m:   Math.round(loadAvg1m * 100) / 100,
      platform:    os.platform(),
      arch:        os.arch(),
    })
  })

  app.get('/api/ollama/ps', (_req, res) => {
    const ollamaUrl = process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434'
    void fetch(`${ollamaUrl}/api/ps`)
      .then(r => r.json())
      .then(data => res.json(data))
      .catch(() => res.json({ models: [] }))
  })

  // ── WebSocket chat ──────────────────────────────────────────────────
  const server = http.createServer(app)
  const wss = new WebSocketServer({ server, path: '/api/chat' })

  wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
    // Security: reject cross-site WebSocket connections. Browsers send the
    // page's Origin on WS upgrade — any non-localhost origin means a foreign
    // website is trying to hijack the local assistant (and its tools).
    const origin = req.headers.origin
    const host   = req.headers.host
    const originOk = !origin || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin)
    const wsToken  = new URL(req.url ?? '', `http://${host ?? 'localhost'}`).searchParams.get('token') ?? undefined
    if (!originOk || !isLocalHost(host) || !tokenOk(wsToken)) {
      logger.warn('web', `rejected WS connection (origin=${origin ?? 'none'}, host=${host ?? 'none'}, token=${wsToken ? 'bad' : 'missing'})`)
      ws.close(1008, 'forbidden')
      return
    }
    logger.debug('web', 'WS client connected')
    const context = new ConversationContext()

    let currentPersona = loadPersona(personaPath)

    const makeSystemPrompt = (memories: Memory[], toolsSection: string) => buildSystemPrompt(
      currentPersona,
      profileManager.getActive(),
      memories,
      toolsSection,
      new Date(),
      isGemma3Model(modelManager ? modelManager.getCurrentModel() : provider.model),
    )

    const send = (data: unknown): void => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data))
    }

    // Tool confirmation over the socket: send confirm_request, wait for the
    // client's confirm_response. No answer within 60 s = denied.
    let confirmSeq = 0
    const pendingConfirms = new Map<number, (approved: boolean) => void>()
    const confirmToolCall = (name: string, args: unknown): Promise<boolean> =>
      new Promise<boolean>(resolve => {
        const id = ++confirmSeq
        const timer = setTimeout(() => {
          pendingConfirms.delete(id)
          resolve(false)
        }, 60_000)
        timer.unref?.()
        pendingConfirms.set(id, approved => { clearTimeout(timer); resolve(approved) })
        send({ type: 'confirm_request', id, name, args })
      })

    const engine = new AssistantEngine({
      provider,
      getSystemPrompt: makeSystemPrompt,
      memory,
      registry,
      profileManager,
      context,
      modelManager,
      confirmToolCall,
    })

    ws.on('message', (raw) => {
      void (async () => {
        let msg: { type: string; content?: string; name?: string; id?: number; approved?: boolean }
        try {
          msg = JSON.parse(raw.toString()) as typeof msg
        } catch {
          send({ type: 'error', message: 'invalid JSON' })
          return
        }

        if (msg.type === 'confirm_response' && typeof msg.id === 'number') {
          const resolver = pendingConfirms.get(msg.id)
          if (resolver) {
            pendingConfirms.delete(msg.id)
            resolver(msg.approved === true)
          }
          return
        }

        if (msg.type === 'profile' && msg.name) {
          try {
            profileManager.setActive(msg.name)
            currentPersona = loadPersona(personaPath)
            send({ type: 'profile_changed', name: msg.name })
          } catch (e) {
            send({ type: 'error', message: String(e) })
          }
          return
        }

        if (msg.type === 'chat' && msg.content) {
          for await (const chunk of engine.chat(msg.content)) {
            send(chunk)
          }
          return
        }

        send({ type: 'error', message: `unknown message type: ${msg.type}` })
      })()
    })

    ws.on('close', () => {
      for (const resolve of pendingConfirms.values()) resolve(false)
      pendingConfirms.clear()
      logger.debug('web', `WS disconnected (${context.messageCount} messages)`)
      const sessDir = path.join(
        process.env['HOME'] ?? process.env['USERPROFILE'] ?? '',
        '.personal-ai', 'sessions',
      )
      try {
        fs.mkdirSync(sessDir, { recursive: true })
        const file = path.join(sessDir, `session-${Date.now()}.json`)
        fs.writeFileSync(file, JSON.stringify({
          messages: context.getMessages(),
          savedAt:  new Date().toISOString(),
        }, null, 2))
      } catch { /* non-critical */ }
    })

    ws.on('error', (err) => { logger.error('web', 'WS error', err) })
  })

  // Security: bind to loopback only — never expose the assistant (and its
  // file/memory tools) to the LAN. Remote access requires explicit opt-in
  // via a reverse proxy with authentication.
  await new Promise<void>(resolve => server.listen(PORT, '127.0.0.1', resolve))
  logger.debug('web', `listening on :${PORT}`)

  return { server, port: PORT, token: TOKEN }
}

export function getServerUrl(port = 3000, token?: string): string {
  return token ? `http://localhost:${port}/?token=${token}` : `http://localhost:${port}`
}
