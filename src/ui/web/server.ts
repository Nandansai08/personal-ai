// MIT License — personal-ai
import http from 'node:http'
import net from 'node:net'
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

export async function createWebServer(opts: WebServerOptions): Promise<{ server: http.Server; port: number }> {
  const { provider, memory, profileManager, registry, modelManager, personaPath } = opts
  const preferred = opts.port ?? parseInt(process.env['PORT'] ?? '3000', 10)
  const PORT = await findFreePort(preferred)

  const app = express()
  app.use(cors({ origin: [`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`] }))
  app.use(express.json())
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
    if (!memory) { res.json([]); return }
    const q = req.query['q'] as string | undefined
    const results = q ? memory.search(q, 20) : memory.getRecent(20)
    res.json(results)
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
      model:    modelManager
        ? modelManager.getStats()
        : { current: provider.model, mode: 'manual', config: {} },
      tools: registry
        ? registry.getAll().map(t => ({ name: t.definition.name, description: t.definition.description }))
        : [],
    })
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

  wss.on('connection', (ws: WebSocket) => {
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

    const engine = new AssistantEngine(
      provider,
      makeSystemPrompt,
      memory,
      registry,
      profileManager,
      context,
      modelManager,
    )

    const send = (data: unknown): void => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data))
    }

    ws.on('message', (raw) => {
      void (async () => {
        let msg: { type: string; content?: string; name?: string }
        try {
          msg = JSON.parse(raw.toString()) as typeof msg
        } catch {
          send({ type: 'error', message: 'invalid JSON' })
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

  await new Promise<void>(resolve => server.listen(PORT, resolve))
  logger.debug('web', `listening on :${PORT}`)

  return { server, port: PORT }
}

export function getServerUrl(port = 3000): string {
  return `http://localhost:${port}`
}
