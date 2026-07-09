import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SB = process.env.SUPABASE_URL
const SK = process.env.SUPABASE_SERVICE_KEY

function sb() { return createClient(SB!, SK!, { auth: { persistSession: false } }) }

function getUserEmail(req: NextRequest): string | null {
  const token = req.cookies.get('sb-access-token')?.value
  if (!token) return null
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
    return payload.email ?? null
  } catch { return null }
}

async function isAdmin(req: NextRequest): Promise<boolean> {
  const email = getUserEmail(req)
  if (!email) return false
  const { data } = await sb().from('platform_settings').select('admin_emails').eq('id', 1).maybeSingle()
  const admins = (data?.admin_emails || process.env.ADMIN_EMAILS || '').split(',').map((s: string) => s.trim().toLowerCase())
  return admins.includes(email.toLowerCase())
}

export async function GET(req: NextRequest) {
  if (!(await isAdmin(req))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { data } = await sb().from('platform_settings').select('*').eq('id', 1).maybeSingle()
  return NextResponse.json(data || {})
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin(req))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json()
  const allowed = [
    'gemini_key', 'openai_key', 'admin_emails',
    'content_prompt', 'image_style', 'image_style_vivid',
    'slide_cover_prompt', 'slide_bullets_prompt', 'slide_stat_prompt',
    'slide_grid4_prompt', 'slide_quote_prompt', 'slide_cta_prompt',
    'instagram_handle',
  ]
  const update: Record<string, any> = { id: 1, updated_at: new Date().toISOString() }
  for (const k of allowed) { if (body[k] !== undefined) update[k] = body[k] }
  const { error } = await sb().from('platform_settings').upsert(update)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
