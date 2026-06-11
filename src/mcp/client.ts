// MIT License — personal-ai
// Minimal MCP (Model Context Protocol) client over stdio.
// Newline-delimited JSON-RPC 2.0 — no SDK dependency. Supports the tool
// surface: initialize handshake, tools/list, tools/call.

import { spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import { logger } from '../core/logger.js'

const PROTOCOL_VERSION = '2024-11-05'
const INIT_TIMEOUT_MS  = 10_000
const CALL_TIMEOUT_MS  = 30_000

export interface McpServerConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
}

export interface McpToolInfo {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id?: number
  result?: unknown
  error?: { code: number; message: string }
}

export type McpResult<T> = { ok: true; value: T } | { ok: false; error: string }

export class McpClient {
  private child: ChildProcess | undefined
  private nextId = 1
  private pending = new Map<number, { resolve: (r: JsonRpcResponse) => void; timer: NodeJS.Timeout }>()
  private buffer = ''
  private closed = false

  constructor(readonly serverName: string, private config: McpServerConfig) {}

  /** Spawn the server process and perform the initialize handshake. */
  async connect(): Promise<McpResult<void>> {
    try {
      // Windows: bare commands (npx, uvx) are .cmd shims needing a shell;
      // absolute paths must NOT go through cmd.exe (spaces break parsing).
      const useShell = process.platform === 'win32' && !path.isAbsolute(this.config.command)
      this.child = spawn(this.config.command, this.config.args ?? [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...this.config.env },
        shell: useShell,
      })
    } catch (err) {
      return { ok: false, error: `spawn failed: ${err instanceof Error ? err.message : String(err)}` }
    }

    this.child.on('exit', code => {
      if (!this.closed) logger.warn('mcp', `server ${this.serverName} exited (code ${code})`)
      this.failAllPending(`server ${this.serverName} exited`)
    })
    this.child.on('error', err => {
      this.failAllPending(`server ${this.serverName} error: ${err.message}`)
    })
    this.child.stderr?.on('data', (d: Buffer) => {
      logger.debug('mcp', `[${this.serverName}] ${d.toString().trim()}`)
    })
    this.child.stdout?.on('data', (d: Buffer) => this.onData(d))

    const init = await this.request('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'personal-ai', version: '1.0.0' },
    }, INIT_TIMEOUT_MS)
    if (!init.ok) return init

    this.notify('notifications/initialized', {})
    return { ok: true, value: undefined }
  }

  /** List the tools the server exposes. */
  async listTools(): Promise<McpResult<McpToolInfo[]>> {
    const r = await this.request('tools/list', {}, INIT_TIMEOUT_MS)
    if (!r.ok) return r
    const tools = (r.value as { tools?: McpToolInfo[] })?.tools
    if (!Array.isArray(tools)) return { ok: false, error: 'tools/list returned no tools array' }
    return { ok: true, value: tools }
  }

  /** Call a tool. Returns the text content (MCP content blocks flattened). */
  async callTool(name: string, args: unknown): Promise<McpResult<string>> {
    const r = await this.request('tools/call', { name, arguments: args ?? {} }, CALL_TIMEOUT_MS)
    if (!r.ok) return r
    const result = r.value as { content?: Array<{ type: string; text?: string }>; isError?: boolean }
    const text = (result.content ?? [])
      .filter(c => c.type === 'text' && typeof c.text === 'string')
      .map(c => c.text)
      .join('\n')
    if (result.isError) return { ok: false, error: text || 'tool reported an error' }
    return { ok: true, value: text }
  }

  close(): void {
    this.closed = true
    this.failAllPending('client closed')
    this.child?.kill()
    this.child = undefined
  }

  get alive(): boolean {
    return !!this.child && this.child.exitCode === null && !this.closed
  }

  // ── JSON-RPC plumbing ─────────────────────────────────────────────────

  private async request(method: string, params: unknown, timeoutMs: number): Promise<McpResult<unknown>> {
    if (!this.child?.stdin?.writable) return { ok: false, error: 'server not connected' }
    const id = this.nextId++

    const response = await new Promise<JsonRpcResponse | { timeout: true } | { failed: string }>(resolve => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        resolve({ timeout: true })
      }, timeoutMs)
      timer.unref?.()
      this.pending.set(id, { resolve: r => { clearTimeout(timer); resolve(r) }, timer })
      this.child!.stdin!.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n', err => {
        if (err) {
          clearTimeout(timer)
          this.pending.delete(id)
          resolve({ failed: err.message })
        }
      })
    })

    if ('timeout' in response) return { ok: false, error: `${method} timed out after ${timeoutMs}ms` }
    if ('failed' in response)  return { ok: false, error: `${method} write failed: ${response.failed}` }
    if (response.error)        return { ok: false, error: `${method}: ${response.error.message} (${response.error.code})` }
    return { ok: true, value: response.result }
  }

  private notify(method: string, params: unknown): void {
    if (!this.child?.stdin?.writable) return
    this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n')
  }

  private onData(chunk: Buffer): void {
    this.buffer += chunk.toString()
    let idx: number
    while ((idx = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, idx).trim()
      this.buffer = this.buffer.slice(idx + 1)
      if (!line) continue
      let msg: JsonRpcResponse
      try { msg = JSON.parse(line) as JsonRpcResponse } catch { continue }
      if (typeof msg.id === 'number') {
        const waiter = this.pending.get(msg.id)
        if (waiter) {
          this.pending.delete(msg.id)
          waiter.resolve(msg)
        }
      }
      // Server-initiated requests/notifications are ignored (tool surface only)
    }
  }

  private failAllPending(reason: string): void {
    for (const [id, waiter] of this.pending) {
      clearTimeout(waiter.timer)
      waiter.resolve({ jsonrpc: '2.0', id, error: { code: -1, message: reason } })
    }
    this.pending.clear()
  }
}
