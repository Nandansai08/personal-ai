// MIT License — personal-ai

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { RegisteredTool, ToolResult } from './types.js'

const MAX_BYTES = 100_000 // 100 KB read limit

// Security: filenames that must never be readable by the model, regardless of
// location — credentials, keys, and shell history are prime prompt-injection
// exfiltration targets.
const DENIED_NAMES = /^(\.env(\..*)?|id_rsa.*|id_ed25519.*|id_ecdsa.*|.*\.pem|.*\.key|credentials(\..*)?|\.netrc|\.npmrc|\.bash_history|\.zsh_history)$/i
const DENIED_DIRS  = ['.ssh', '.gnupg', '.aws', '.azure', '.kube', '.docker']

/** Resolve path, expanding ~. */
function resolveSafe(filePath: string): string {
  return path.resolve(filePath.startsWith('~')
    ? filePath.replace('~', os.homedir())
    : filePath)
}

/**
 * Security gate: deny sensitive files and directories. Allow-list roots are
 * configurable via FILE_READER_ROOTS (comma-separated); defaults to home dir
 * and current working directory.
 */
function checkAccess(resolved: string): string | null {
  const base = path.basename(resolved)
  if (DENIED_NAMES.test(base)) {
    return `Access denied: ${base} may contain credentials`
  }
  const segments = resolved.split(/[\\/]/)
  for (const dir of DENIED_DIRS) {
    if (segments.includes(dir)) return `Access denied: ${dir} directory is protected`
  }
  const rootsEnv = process.env['FILE_READER_ROOTS']
  const roots = rootsEnv
    ? rootsEnv.split(',').map(r => path.resolve(r.trim()))
    : [os.homedir(), process.cwd()]
  const inRoot = roots.some(root => {
    const rel = path.relative(root, resolved)
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
  })
  if (!inRoot) {
    return `Access denied: path outside allowed roots (${roots.join(', ')}). Set FILE_READER_ROOTS in .env to extend.`
  }
  return null
}

export const fileReaderTool: RegisteredTool = {
  requiresConfirmation: true,
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

    const denied = checkAccess(resolved)
    if (denied) return { success: false, data: null, error: denied }

    if (!fs.existsSync(resolved)) {
      return { success: false, data: null, error: `File not found: ${resolved}` }
    }

    // Re-check the real path — a symlink inside an allowed root must not
    // escape to a denied location.
    const real = fs.realpathSync(resolved)
    if (real !== resolved) {
      const deniedReal = checkAccess(real)
      if (deniedReal) return { success: false, data: null, error: deniedReal }
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
