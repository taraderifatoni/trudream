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
  return NextResponse.json(data || {
    user_id: uid,
    meta_token: '', ig_account_id: '', fb_page_id: '', openai_key: '',
    brand_voice: '',
    logo_url: '',
    logo_position: 'bottom-right',
    heading_font: 'Poppins',
    body_font: 'Poppins',
    slide_bg_color: '#084463',
    slide_accent_color: '#FFC64F',
    slide_accent2_color: '#6BB9D4',
    slide_text_color: '#F8FAFC',
    slide_muted_color: '#647488',
    slide_width: 1080,
    slide_height: 1350,
    instagram_handle: '@beautifio.space',
  })
}

// POST — save user settings
export async function POST(req: NextRequest) {
  const uid = getUserId(req)
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const {
    meta_token, ig_account_id, fb_page_id, openai_key, brand_voice,
    logo_url, logo_position, heading_font, body_font,
    slide_bg_color, slide_accent_color, slide_accent2_color,
    slide_text_color, slide_muted_color, slide_width, slide_height,
    instagram_handle,
  } = body
  const { error } = await supabase().from('user_settings').upsert({
    user_id: uid,
    meta_token: meta_token || '',
    ig_account_id: ig_account_id || '',
    fb_page_id: fb_page_id || '',
    openai_key: openai_key || '',
    brand_voice: brand_voice || '',
    logo_url: logo_url || '',
    logo_position: logo_position || 'bottom-right',
    heading_font: heading_font || 'Poppins',
    body_font: body_font || 'Poppins',
    slide_bg_color: slide_bg_color || '#084463',
    slide_accent_color: slide_accent_color || '#FFC64F',
    slide_accent2_color: slide_accent2_color || '#6BB9D4',
    slide_text_color: slide_text_color || '#F8FAFC',
    slide_muted_color: slide_muted_color || '#647488',
    slide_width: slide_width || 1080,
    slide_height: slide_height || 1350,
    instagram_handle: instagram_handle || '',
    updated_at: new Date().toISOString(),
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
