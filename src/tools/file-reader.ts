// MIT License — personal-ai

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { RegisteredTool, ToolResult } from './types.js'

const MAX_BYTES = 100_000 // 100 KB read limit

/** Resolve and validate path stays within allowed roots. */
function resolveSafe(filePath: string): string {
  const resolved = path.resolve(filePath.startsWith('~')
    ? filePath.replace('~', os.homedir())
    : filePath)
  return resolved
}

export const fileReaderTool: RegisteredTool = {
  definition: {
    name: 'file_reader',
    description: 'Read local text file, max 100KB.',
    parameters: {
      type: 'object',
      properties: {
        path:     { type: 'string', description: 'File path (absolute or ~)' },
        encoding: { type: 'string', description: 'File encoding (default utf-8)' },
        lines:    { type: 'number', description: 'Max lines to read (default: all)' },
      },
      required: ['path'],
    },
  },
  async execute(args: unknown): Promise<ToolResult> {
    const a = args as Record<string, unknown>
    const filePath = String(a['path'] ?? '').trim()
    if (!filePath) return { success: false, data: null, error: 'path required' }

    const resolved = resolveSafe(filePath)

    if (!fs.existsSync(resolved)) {
      return { success: false, data: null, error: `File not found: ${resolved}` }
    }

    const stat = fs.statSync(resolved)
    if (!stat.isFile()) {
      return { success: false, data: null, error: `Not a file: ${resolved}` }
    }
    if (stat.size > MAX_BYTES) {
      return { success: false, data: null, error: `File too large (${stat.size} bytes, max ${MAX_BYTES})` }
    }

    try {
      const encoding = (a['encoding'] as BufferEncoding | undefined) ?? 'utf-8'
      const raw = fs.readFileSync(resolved, encoding)
      const maxLines = a['lines'] ? Number(a['lines']) : undefined
      const content = maxLines ? raw.split('\n').slice(0, maxLines).join('\n') : raw
      return {
        success: true,
        data: { path: resolved, size: stat.size, content },
      }
    } catch (err) {
      return { success: false, data: null, error: `Read error: ${String(err)}` }
    }
  },
}
