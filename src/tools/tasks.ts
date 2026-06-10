// MIT License — personal-ai

import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import type { RegisteredTool, ToolResult } from './types.js'

const DB_DIR  = path.join(os.homedir(), '.personal-ai')
const DB_PATH = path.join(DB_DIR, 'tasks.db')

type TaskStatus = 'pending' | 'in_progress' | 'done'
type TaskPriority = 'low' | 'medium' | 'high'

interface TaskRow {
  id: string
  title: string
  description: string
  status: string
  priority: string
  due_date: string | null
  created_at: string
  updated_at: string
}

interface Task {
  id: string
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  due_date: string | null
  created_at: string
  updated_at: string
}

function rowToTask(row: TaskRow): Task {
  return {
    id:          row.id,
    title:       row.title,
    description: row.description,
    status:      row.status as TaskStatus,
    priority:    row.priority as TaskPriority,
    due_date:    row.due_date,
    created_at:  row.created_at,
    updated_at:  row.updated_at,
  }
}

function getDb(): Database.Database {
  fs.mkdirSync(DB_DIR, { recursive: true })
  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      priority TEXT NOT NULL DEFAULT 'medium',
      due_date TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
  `)
  return db
}

export const tasksTool: RegisteredTool = {
  definition: {
    name: 'tasks',
    description: 'Manage tasks: create, update, list.',
    parameters: {
      type: 'object',
      properties: {
        action:      { type: 'string', description: 'create | update | list | get | delete', enum: ['create', 'update', 'list', 'get', 'delete'] },
        id:          { type: 'string', description: 'Task ID (for update/get/delete)' },
        title:       { type: 'string', description: 'Task title' },
        description: { type: 'string', description: 'Task description' },
        status:      { type: 'string', description: 'pending | in_progress | done', enum: ['pending', 'in_progress', 'done'] },
        priority:    { type: 'string', description: 'low | medium | high', enum: ['low', 'medium', 'high'] },
        due_date:    { type: 'string', description: 'Due date ISO string' },
        filter:      { type: 'string', description: 'Filter: pending|in_progress|done|all' },
      },
      required: ['action'],
    },
  },
  async execute(args: unknown): Promise<ToolResult> {
    const a = args as Record<string, unknown>
    const action = String(a['action'] ?? '').trim()
    const db = getDb()
    const now = new Date().toISOString()

    switch (action) {
      case 'create': {
        const title = String(a['title'] ?? '').trim()
        if (!title) return { success: false, data: null, error: 'title required' }
        const task: Task = {
          id:          uuidv4(),
          title,
          description: String(a['description'] ?? ''),
          status:      'pending',
          priority:    (a['priority'] as TaskPriority) ?? 'medium',
          due_date:    a['due_date'] ? String(a['due_date']) : null,
          created_at:  now,
          updated_at:  now,
        }
        db.prepare('INSERT INTO tasks (id,title,description,status,priority,due_date,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
          .run(task.id, task.title, task.description, task.status, task.priority, task.due_date, task.created_at, task.updated_at)
        return { success: true, data: task }
      }
      case 'update': {
        const id = String(a['id'] ?? '').trim()
        if (!id) return { success: false, data: null, error: 'id required for update' }
        const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined
        if (!existing) return { success: false, data: null, error: `Task ${id} not found` }
        const updates: Partial<TaskRow> = { updated_at: now }
        if (a['title'])       updates.title       = String(a['title'])
        if (a['description']) updates.description = String(a['description'])
        if (a['status'])      updates.status      = String(a['status'])
        if (a['priority'])    updates.priority    = String(a['priority'])
        if (a['due_date'])    updates.due_date    = String(a['due_date'])
        const merged = { ...existing, ...updates }
        db.prepare('UPDATE tasks SET title=?,description=?,status=?,priority=?,due_date=?,updated_at=? WHERE id=?')
          .run(merged.title, merged.description, merged.status, merged.priority, merged.due_date, merged.updated_at, id)
        return { success: true, data: rowToTask(merged as TaskRow) }
      }
      case 'list': {
        const filter = String(a['filter'] ?? 'all')
        const rows = filter === 'all'
          ? db.prepare('SELECT * FROM tasks ORDER BY priority DESC, created_at DESC').all() as TaskRow[]
          : db.prepare('SELECT * FROM tasks WHERE status = ? ORDER BY created_at DESC').all(filter) as TaskRow[]
        return { success: true, data: rows.map(rowToTask) }
      }
      case 'get': {
        const id = String(a['id'] ?? '').trim()
        if (!id) return { success: false, data: null, error: 'id required' }
        const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined
        if (!row) return { success: false, data: null, error: `Task ${id} not found` }
        return { success: true, data: rowToTask(row) }
      }
      case 'delete': {
        const id = String(a['id'] ?? '').trim()
        if (!id) return { success: false, data: null, error: 'id required' }
        const result = db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
        return { success: true, data: { deleted: result.changes > 0, id } }
      }
      default:
        return { success: false, data: null, error: `Unknown action: ${action}` }
    }
  },
}
