// MIT License — personal-ai
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileReaderTool } from '../../src/tools/file-reader.js'

const tmpDir  = fs.mkdtempSync(path.join(os.tmpdir(), 'pai-fr-'))
const okFile  = path.join(tmpDir, 'readme.txt')

beforeAll(() => {
  fs.writeFileSync(okFile, 'hello world')
  process.env['FILE_READER_ROOTS'] = tmpDir
})

afterAll(() => {
  delete process.env['FILE_READER_ROOTS']
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('file_reader security gate', () => {
  it('reads a normal file inside allowed roots', async () => {
    const r = await fileReaderTool.execute({ path: okFile })
    expect(r.success).toBe(true)
    expect((r.data as { content: string }).content).toBe('hello world')
  })

  it('denies .env files even inside allowed roots', async () => {
    const envFile = path.join(tmpDir, '.env')
    fs.writeFileSync(envFile, 'SECRET=x')
    const r = await fileReaderTool.execute({ path: envFile })
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/credentials/i)
  })

  it('denies .env.local variants', async () => {
    const r = await fileReaderTool.execute({ path: path.join(tmpDir, '.env.local') })
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/credentials/i)
  })

  it('denies SSH private keys by name', async () => {
    const r = await fileReaderTool.execute({ path: path.join(tmpDir, 'id_rsa') })
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/credentials/i)
  })

  it('denies paths containing protected directories', async () => {
    const r = await fileReaderTool.execute({ path: path.join(tmpDir, '.ssh', 'config') })
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/protected/i)
  })

  it('denies paths outside allowed roots', async () => {
    const outside = process.platform === 'win32' ? 'C:\\Windows\\win.ini' : '/etc/hosts'
    const r = await fileReaderTool.execute({ path: outside })
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/outside allowed roots/i)
  })

  it('denies .pem and .key files', async () => {
    for (const name of ['cert.pem', 'server.key']) {
      const r = await fileReaderTool.execute({ path: path.join(tmpDir, name) })
      expect(r.success).toBe(false)
    }
  })
})
