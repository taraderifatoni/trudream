import { createClient, SupabaseClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

// Server-side Supabase Storage helper. Uploads generated files (slide PNGs,
// processed videos) to a public bucket and returns their public URL — required
// so Instagram's Graph API can fetch them and so the app works on serverless
// (Vercel) where the local filesystem is ephemeral.
//
// Falls back to serving from local /tmp via /api/files when Supabase is not
// configured (e.g. local dev without keys).

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const BUCKET = process.env.SUPABASE_BUCKET || 'media'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

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

export function storageEnabled(): boolean {
  return !!client()
}

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.zip': 'application/zip',
}

function contentTypeFor(name: string): string {
  return CONTENT_TYPES[path.extname(name).toLowerCase()] || 'application/octet-stream'
}

function localUrl(name: string): string {
  return `${APP_URL}/api/files/${name}`
}

/**
 * Upload a local file to Supabase Storage and return its public URL.
 * When Supabase isn't configured, returns the local /api/files URL instead.
 */
export async function publishFile(localPath: string): Promise<string> {
  const name = path.basename(localPath)
  const c = client()
  if (!c) return localUrl(name)

  const data = fs.readFileSync(localPath)
  const { error } = await c.storage
    .from(BUCKET)
    .upload(name, data, { contentType: contentTypeFor(name), upsert: true })
  if (error) throw new Error(`Supabase upload failed (${name}): ${error.message}`)

  const { data: pub } = c.storage.from(BUCKET).getPublicUrl(name)
  return pub.publicUrl
}

/**
 * Upload a raw buffer under the given filename to Supabase Storage.
 * Returns the public URL, or null when Supabase isn't configured.
 */
export async function publishBuffer(buffer: Buffer, name: string): Promise<string | null> {
  const c = client()
  if (!c) return null
  const { error } = await c.storage
    .from(BUCKET)
    .upload(name, buffer, { contentType: contentTypeFor(name), upsert: true })
  if (error) throw new Error(`Supabase upload failed (${name}): ${error.message}`)
  const { data: pub } = c.storage.from(BUCKET).getPublicUrl(name)
  return pub.publicUrl
}
