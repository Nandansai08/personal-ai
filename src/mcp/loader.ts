// MIT License — personal-ai
// MCP loader: reads the server config, connects each server, and registers
// its tools into the shared ToolRegistry as namespaced RegisteredTools
// (mcp_<server>_<tool>) — inheriting the confirmation gate, since MCP tools
// are external by definition.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { logger } from '../core/logger.js'
import { McpClient, type McpServerConfig, type McpToolInfo } from './client.js'
import type { ToolRegistry } from '../tools/registry.js'
import type { RegisteredTool, ToolDefinition } from '../tools/types.js'

export interface McpConfig {
  servers: Record<string, McpServerConfig>
}

export interface McpServerStatus {
  name: string
  status: 'connected' | 'failed'
  tools: number
  error?: string
}

/** Config locations, first match wins: config/mcp.json, then ~/.personal-ai/mcp.json. */
export function mcpConfigPath(configDir: string): string | undefined {
  const candidates = [
    path.join(configDir, 'mcp.json'),
    path.join(os.homedir(), '.personal-ai', 'mcp.json'),
  ]
  return candidates.find(p => fs.existsSync(p))
}

export function readMcpConfig(file: string): McpConfig | undefined {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as McpConfig
    if (typeof raw !== 'object' || raw === null || typeof raw.servers !== 'object') return undefined
    return raw
  } catch (err) {
    logger.warn('mcp', `invalid mcp.json: ${err instanceof Error ? err.message : String(err)}`)
    return undefined
  }
}

/** MCP inputSchema → our ToolDefinition parameters (best-effort, shape-compatible). */
function toParameters(schema: Record<string, unknown> | undefined): ToolDefinition['parameters'] {
  const props = (schema?.['properties'] ?? {}) as ToolDefinition['parameters']['properties']
  const required = Array.isArray(schema?.['required']) ? schema['required'] as string[] : undefined
  return { type: 'object', properties: props, ...(required ? { required } : {}) }
}

function wrapTool(client: McpClient, serverName: string, info: McpToolInfo): RegisteredTool {
  return {
    // External tools always require user confirmation
    requiresConfirmation: true,
    definition: {
      name: `mcp_${serverName}_${info.name}`,
      description: `[MCP:${serverName}] ${info.description ?? info.name}`,
      parameters: toParameters(info.inputSchema),
    },
    async execute(args: unknown) {
      const r = await client.callTool(info.name, args)
      return r.ok
        ? { success: true, data: r.value }
        : { success: false, data: null, error: r.error }
    },
  }
}

export class McpManager {
  private clients = new Map<string, McpClient>()
  private statuses: McpServerStatus[] = []

  /** Connect all configured servers and register their tools. Failures are reported, never thrown. */
  async loadAll(config: McpConfig, registry: ToolRegistry): Promise<McpServerStatus[]> {
    this.statuses = []
    for (const [name, serverConfig] of Object.entries(config.servers)) {
      const client = new McpClient(name, serverConfig)
      const connected = await client.connect()
      if (!connected.ok) {
        client.close()
        this.statuses.push({ name, status: 'failed', tools: 0, error: connected.error })
        logger.warn('mcp', `⚠ MCP server ${name} failed: ${connected.error}`)
        continue
      }
      const tools = await client.listTools()
      if (!tools.ok) {
        client.close()
        this.statuses.push({ name, status: 'failed', tools: 0, error: tools.error })
        logger.warn('mcp', `⚠ MCP server ${name} failed: ${tools.error}`)
        continue
      }
      for (const info of tools.value) {
        registry.register(wrapTool(client, name, info))
      }
      this.clients.set(name, client)
      this.statuses.push({ name, status: 'connected', tools: tools.value.length })
      logger.debug('mcp', `connected ${name} (${tools.value.length} tools)`)
    }
    return this.statuses
  }

  list(): McpServerStatus[] {
    return this.statuses.map(s => ({
      ...s,
      status: this.clients.get(s.name)?.alive ? 'connected' as const : (s.status === 'connected' ? 'failed' as const : s.status),
    }))
  }

  closeAll(): void {
    for (const client of this.clients.values()) client.close()
    this.clients.clear()
  }
}
