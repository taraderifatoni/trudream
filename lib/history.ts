import fs from 'fs'
import path from 'path'
import { v4 as uuid } from 'uuid'

// Persisted to a mounted volume so it survives redeploys. Falls back to TMP.
const DATA_DIR = process.env.DATA_DIR || path.join(process.env.TMP_DIR || '/tmp', 'data')
const FILE = path.join(DATA_DIR, 'history.json')

export interface PlatformResult {
  ok: boolean
  id?: string
  permalink?: string
  error?: string
}

export interface HistoryEntry {
  id: string
  createdAt: string // ISO
  kind: 'carousel' | 'reel'
  caption: string
  slideCount: number
  hasVideo: boolean
  thumbUrl?: string
  instagram?: PlatformResult
  facebook?: PlatformResult
  logs: string[]
}

function ensureDir() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  } catch {
    /* ignore */
  }
}

export function readHistory(): HistoryEntry[] {
  ensureDir()
  try {
    const raw = fs.readFileSync(FILE, 'utf8')
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

export function addHistory(entry: Omit<HistoryEntry, 'id' | 'createdAt'>): HistoryEntry {
  ensureDir()
  const full: HistoryEntry = { id: uuid(), createdAt: new Date().toISOString(), ...entry }
  const all = readHistory()
  all.unshift(full)
  try {
    fs.writeFileSync(FILE, JSON.stringify(all.slice(0, 100), null, 2))
  } catch {
    /* ignore */
  }
  return full
}
