// MIT License — personal-ai

import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import type { RegisteredTool, ToolResult } from './types.js'

const DB_DIR  = path.join(os.homedir(), '.personal-ai')
const DB_PATH = path.join(DB_DIR, 'notes.db')

interface NoteRow {
  id: string
  title: string
  content: string
  tags: string
  created_at: string
  updated_at: string
}

interface Note {
  id: string
  title: string
  content: string
  tags: string[]
  created_at: string
  updated_at: string
}

function rowToNote(row: NoteRow): Note {
  return {
    id:         row.id,
    title:      row.title,
    content:    row.content,
    tags:       JSON.parse(row.tags) as string[],
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function getDb(): Database.Database {
  fs.mkdirSync(DB_DIR, { recursive: true })
  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notes_title ON notes(title);
  `)
  return db
}

function saveNote(title: string, content: string, tags: string[]): Note {
  const db = getDb()
  const now = new Date().toISOString()
  const existing = db.prepare('SELECT * FROM notes WHERE title = ?').get(title) as NoteRow | undefined
  if (existing) {
    db.prepare('UPDATE notes SET content = ?, tags = ?, updated_at = ? WHERE id = ?')
      .run(content, JSON.stringify(tags), now, existing.id)
    return rowToNote({ ...existing, content, tags: JSON.stringify(tags), updated_at: now })
  }
  const id = uuidv4()
  db.prepare('INSERT INTO notes (id,title,content,tags,created_at,updated_at) VALUES (?,?,?,?,?,?)')
    .run(id, title, content, JSON.stringify(tags), now, now)
  return { id, title, content, tags, created_at: now, updated_at: now }
}

function getNote(title: string): Note | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM notes WHERE title = ?').get(title) as NoteRow | undefined
  return row ? rowToNote(row) : null
}

function listNotes(tag?: string): Note[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM notes ORDER BY updated_at DESC LIMIT 50').all() as NoteRow[]
  const notes = rows.map(rowToNote)
  if (tag) return notes.filter(n => n.tags.includes(tag))
  return notes
}

function deleteNote(title: string): boolean {
  const db = getDb()
  const result = db.prepare('DELETE FROM notes WHERE title = ?').run(title)
  return result.changes > 0
}

export const notesTool: RegisteredTool = {
  definition: {
    name: 'notes',
    description: 'Save, retrieve, list, or delete personal notes.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'save | get | list | delete', enum: ['save', 'get', 'list', 'delete'] },
        title:   { type: 'string', description: 'Note title' },
        content: { type: 'string', description: 'Content (for save)' },
        tags:    { type: 'string', description: 'Tags, comma-separated' },
      },
      required: ['action'],
    },
  },
  async execute(args: unknown): Promise<ToolResult> {
    const a = args as Record<string, unknown>
    const action = String(a['action'] ?? '').trim()

    switch (action) {
      case 'save': {
        const title   = String(a['title'] ?? '').trim()
        const content = String(a['content'] ?? '').trim()
        if (!title) return { success: false, data: null, error: 'title required for save' }
        const tags = a['tags'] ? String(a['tags']).split(',').map(t => t.trim()).filter(Boolean) : []
        const note = saveNote(title, content, tags)
        return { success: true, data: note }
      }
      case 'get': {
        const title = String(a['title'] ?? '').trim()
        if (!title) return { success: false, data: null, error: 'title required for get' }
        const note = getNote(title)
        if (!note) return { success: false, data: null, error: `Note "${title}" not found` }
        return { success: true, data: note }
      }
      case 'list': {
        const tag = a['tags'] ? String(a['tags']).trim() : undefined
        const notes = listNotes(tag)
        return { success: true, data: notes }
      }
      case 'delete': {
        const title = String(a['title'] ?? '').trim()
        if (!title) return { success: false, data: null, error: 'title required for delete' }
        const deleted = deleteNote(title)
        return { success: true, data: { deleted, title } }
      }
      default:
        return { success: false, data: null, error: `Unknown action: ${action}` }
    }
  },
}
