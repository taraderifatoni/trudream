import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SB = process.env.SUPABASE_URL
const SK = process.env.SUPABASE_SERVICE_KEY

function supabase() {
  return createClient(SB!, SK!, { auth: { persistSession: false, autoRefreshToken: false } })
}

// Decode Supabase JWT locally — no network call, never fails due to timeout.
function getUserId(req: NextRequest): string | null {
  const token = req.cookies.get('sb-access-token')?.value
  if (!token) { console.log('[settings] no cookie'); return null }
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
    console.log('[settings] user found:', payload.sub)
    return payload.sub ?? null
  } catch (e) { console.log('[settings] jwt decode err:', e); return null }
}

// GET — read user settings
export async function GET(req: NextRequest) {
  const uid = getUserId(req)
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await supabase().from('user_settings').select('*').eq('user_id', uid).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || { user_id: uid, meta_token: '', ig_account_id: '', fb_page_id: '' })
}

// POST — save user settings
export async function POST(req: NextRequest) {
  const uid = getUserId(req)
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { meta_token, ig_account_id, fb_page_id } = body
  const { error } = await supabase().from('user_settings').upsert({
    user_id: uid,
    meta_token: meta_token || '',
    ig_account_id: ig_account_id || '',
    fb_page_id: fb_page_id || '',
    updated_at: new Date().toISOString(),
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
