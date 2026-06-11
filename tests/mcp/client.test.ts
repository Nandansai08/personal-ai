// MIT License — personal-ai
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { McpClient } from '../../src/mcp/client.js'
import { McpManager, readMcpConfig, mcpConfigPath } from '../../src/mcp/loader.js'
import { ToolRegistry } from '../../src/tools/registry.js'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pai-mcp-'))
const serverScript = path.join(tmpDir, 'fake-server.js')

beforeAll(() => {
  // Minimal MCP server: newline-delimited JSON-RPC over stdio.
  fs.writeFileSync(serverScript, `
    const readline = require('node:readline')
    const rl = readline.createInterface({ input: process.stdin })
    const reply = obj => process.stdout.write(JSON.stringify(obj) + '\\n')
    rl.on('line', line => {
      let msg; try { msg = JSON.parse(line) } catch { return }
      if (msg.method === 'initialize') {
        reply({ jsonrpc: '2.0', id: msg.id, result: {
          protocolVersion: '2024-11-05', capabilities: { tools: {} },
          serverInfo: { name: 'fake', version: '1.0.0' },
        }})
      } else if (msg.method === 'tools/list') {
        reply({ jsonrpc: '2.0', id: msg.id, result: { tools: [
          { name: 'echo', description: 'Echoes input', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
        ]}})
      } else if (msg.method === 'tools/call') {
        if (msg.params.name === 'echo') {
          reply({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: 'echo: ' + (msg.params.arguments?.text ?? '') }] } })
        } else {
          reply({ jsonrpc: '2.0', id: msg.id, result: { isError: true, content: [{ type: 'text', text: 'unknown tool' }] } })
        }
      }
    })
  `)
})

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }))

function fakeServerConfig() {
  return { command: process.execPath, args: [serverScript] }
}

describe('McpClient', () => {
  it('connects, lists tools, calls a tool', async () => {
    const client = new McpClient('fake', fakeServerConfig())
    try {
      const connected = await client.connect()
      expect(connected.ok).toBe(true)

      const tools = await client.listTools()
      expect(tools.ok).toBe(true)
      if (tools.ok) {
        expect(tools.value).toHaveLength(1)
        expect(tools.value[0]!.name).toBe('echo')
      }

      const result = await client.callTool('echo', { text: 'hello' })
      expect(result).toEqual({ ok: true, value: 'echo: hello' })
    } finally {
      client.close()
    }
  })

  it('returns error result for a failing tool call', async () => {
    const client = new McpClient('fake', fakeServerConfig())
    try {
      await client.connect()
      const result = await client.callTool('nope', {})
      expect(result.ok).toBe(false)
    } finally {
      client.close()
    }
  })

  it('fails gracefully when the command does not exist', async () => {
    const client = new McpClient('ghost', { command: process.execPath, args: ['/definitely/not/a/file.js'] })
    try {
      const connected = await client.connect()
      expect(connected.ok).toBe(false)
    } finally {
      client.close()
    }
  }, 15_000)
})

describe('McpManager', () => {
  it('registers server tools as confirmed, namespaced RegisteredTools', async () => {
    const registry = new ToolRegistry()
    const mgr = new McpManager()
    try {
      const statuses = await mgr.loadAll({ servers: { fake: fakeServerConfig() } }, registry)
      expect(statuses).toHaveLength(1)
      expect(statuses[0]!.status).toBe('connected')
      expect(statuses[0]!.tools).toBe(1)

      expect(registry.has('mcp_fake_echo')).toBe(true)
      const tool = registry.getAll().find(t => t.definition.name === 'mcp_fake_echo')!
      expect(tool.requiresConfirmation).toBe(true)

      const result = await registry.dispatch('mcp_fake_echo', { text: 'hi' })
      expect(result.success).toBe(true)
      expect(result.data).toBe('echo: hi')
    } finally {
      mgr.closeAll()
    }
  })

  it('reports failed servers without throwing', async () => {
    const registry = new ToolRegistry()
    const mgr = new McpManager()
    try {
      const statuses = await mgr.loadAll(
        { servers: { ghost: { command: process.execPath, args: ['/nope.js'] } } },
        registry,
      )
      expect(statuses[0]!.status).toBe('failed')
    } finally {
      mgr.closeAll()
    }
  }, 15_000)
})

describe('mcp config', () => {
  it('reads a valid config and rejects garbage', () => {
    const file = path.join(tmpDir, 'mcp.json')
    fs.writeFileSync(file, JSON.stringify({ servers: { a: { command: 'x' } } }))
    expect(readMcpConfig(file)?.servers['a']?.command).toBe('x')

    fs.writeFileSync(file, 'not json')
    expect(readMcpConfig(file)).toBeUndefined()
  })

  it('mcpConfigPath returns undefined when no config exists', () => {
    expect(mcpConfigPath(path.join(tmpDir, 'no-such-dir'))).toBeUndefined()
  })
})
