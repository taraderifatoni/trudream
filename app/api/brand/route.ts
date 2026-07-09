import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SB = process.env.SUPABASE_URL
const SK = process.env.SUPABASE_SERVICE_KEY

export async function GET() {
  try {
    const sb = createClient(SB!, SK!, { auth: { persistSession: false } })
    const { data } = await sb.from('platform_settings').select('logo_url,instagram_handle').eq('id', 1).maybeSingle()
    return NextResponse.json(data || { logo_url: '', instagram_handle: '' })
  } catch { return NextResponse.json({ logo_url: '', instagram_handle: '' }) }
}
