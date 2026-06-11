// MIT License — personal-ai
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { WebSocket } from 'ws'
import type http from 'node:http'
import { createWebServer } from '../../src/ui/web/server.js'
import { ProfileManager } from '../../src/persona/profiles.js'
import type { LLMProvider, ChatChunk, ChatRequest } from '../../src/providers/interface.js'

const fakeProvider: LLMProvider = {
  name: 'fake',
  model: 'fake-model',
  supportsToolUse: false,
  supportsStreaming: true,
   
  async *chat(_req: ChatRequest): AsyncGenerator<ChatChunk> {
    yield { type: 'text', delta: 'ok' }
    yield { type: 'done' }
  },
}

const profileManager = new ProfileManager({
  active: 'assistant',
  profiles: {
    assistant: { name: 'Assistant', description: '', system_addon: '', preferred_model: '', tools_priority: [], temperature: 0.7 },
  },
})

let server: http.Server
let port: number
let token: string
let personaPath: string

beforeAll(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pai-web-'))
  personaPath = path.join(tmp, 'persona.yaml')
  fs.writeFileSync(personaPath, 'name: "Test"\nuser_name: "T"\ntone: ""\nexpertise: []\navoid: []\ncustom_instructions: ""\n')
  const result = await createWebServer({ provider: fakeProvider, profileManager, personaPath, port: 4710 })
  server = result.server
  port   = result.port
  token  = result.token
})

afterAll(() => new Promise<void>(resolve => server.close(() => resolve())))

describe('web server auth', () => {
  it('rejects /api requests without token', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/provider`)
    expect(res.status).toBe(401)
  })

  it('rejects /api requests with a wrong token', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/provider`, {
      headers: { Authorization: 'Bearer wrong-token-000000000000000000' },
    })
    expect(res.status).toBe(401)
  })

  it('accepts /api requests with bearer token', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/provider`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const data = await res.json() as { name: string }
    expect(data.name).toBe('fake')
  })

  it('accepts token via query parameter', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/provider?token=${token}`)
    expect(res.status).toBe(200)
  })

  it('serves /api/plugins (empty array when no manager wired)', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/plugins?token=${token}`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('serves /api/mcp (empty array when no manager wired)', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/mcp?token=${token}`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('serves static client without token', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/`)
    expect(res.status).toBe(200)
  })

  it('rejects requests with a non-localhost Host header (DNS rebinding)', async () => {
    // fetch/undici silently drops Host overrides — use a raw socket request
    const { request } = await import('node:http')
    const status = await new Promise<number>((resolve, reject) => {
      const req = request(
        { host: '127.0.0.1', port, path: `/api/provider?token=${token}`, headers: { Host: 'evil.example.com' } },
        res => resolve(res.statusCode ?? 0),
      )
      req.on('error', reject)
      req.end()
    })
    expect(status).toBe(403)
  })
})

describe('websocket security', () => {
  function wsResult(url: string, origin?: string): Promise<'open' | 'closed'> {
    return new Promise(resolve => {
      const ws = new WebSocket(url, origin ? { headers: { Origin: origin } } : {})
      ws.on('open', () => {
        // Server may close immediately after open — wait briefly
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) { resolve('open'); ws.close() }
        }, 150)
      })
      ws.on('close', () => resolve('closed'))
      ws.on('error', () => resolve('closed'))
    })
  }

  it('rejects WS without token', async () => {
    expect(await wsResult(`ws://127.0.0.1:${port}/api/chat`)).toBe('closed')
  })

  it('rejects WS from a foreign origin even with token', async () => {
    expect(await wsResult(`ws://127.0.0.1:${port}/api/chat?token=${token}`, 'https://evil.example.com')).toBe('closed')
  })

  it('accepts WS with token from localhost origin', async () => {
    expect(await wsResult(`ws://127.0.0.1:${port}/api/chat?token=${token}`, `http://localhost:${port}`)).toBe('open')
  })
})
