import fs from 'fs'
import path from 'path'
import { v4 as uuid } from 'uuid'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

// History of publish attempts. Stored in a Supabase table when configured
// (persistent across serverless invocations / redeploys); otherwise falls back
// to a local JSON file.

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const TABLE = process.env.SUPABASE_HISTORY_TABLE || 'history'

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

let _client: SupabaseClient | null = null
function client(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null
  if (!_client) {
    _client = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return _client
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToEntry(r: any): HistoryEntry {
  return {
    id: r.id,
    createdAt: r.created_at,
    kind: r.kind,
    caption: r.caption ?? '',
    slideCount: r.slide_count ?? 0,
    hasVideo: !!r.has_video,
    thumbUrl: r.thumb_url ?? undefined,
    instagram: r.instagram ?? undefined,
    facebook: r.facebook ?? undefined,
    logs: Array.isArray(r.logs) ? r.logs : [],
  }
}

function entryToRow(e: HistoryEntry): Record<string, any> {
  return {
    id: e.id,
    created_at: e.createdAt,
    kind: e.kind,
    caption: e.caption,
    slide_count: e.slideCount,
    has_video: e.hasVideo,
    thumb_url: e.thumbUrl ?? null,
    instagram: e.instagram ?? null,
    facebook: e.facebook ?? null,
    logs: e.logs ?? [],
  }
}

/* ---- local file fallback ---- */

function ensureDir() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  } catch {
    /* ignore */
  }
}

function readFile(): HistoryEntry[] {
  ensureDir()
  try {
    const arr = JSON.parse(fs.readFileSync(FILE, 'utf8'))
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function writeFile(all: HistoryEntry[]) {
  ensureDir()
  try {
    fs.writeFileSync(FILE, JSON.stringify(all.slice(0, 100), null, 2))
  } catch {
    /* ignore */
  }
}

/* ---- public API (async) ---- */

export async function readHistory(): Promise<HistoryEntry[]> {
  const c = client()
  if (!c) return readFile()
  const { data, error } = await c
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error || !data) return []
  return data.map(rowToEntry)
}

export async function addHistory(
  entry: Omit<HistoryEntry, 'id' | 'createdAt'>,
): Promise<HistoryEntry> {
  const full: HistoryEntry = { id: uuid(), createdAt: new Date().toISOString(), ...entry }
  const c = client()
  if (!c) {
    const all = readFile()
    all.unshift(full)
    writeFile(all)
    return full
  }
  const { error } = await c.from(TABLE).insert(entryToRow(full))
  if (error) console.error('History insert failed:', error.message)
  return full
}
