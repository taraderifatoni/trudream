import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { v4 as uuid } from 'uuid'

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

export async function POST(req: NextRequest) {
  if (!(await isAdmin(req))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const { imageBase64, imageMimeType } = await req.json()
    if (!imageBase64 || !imageMimeType) return NextResponse.json({ error: 'Missing image data' }, { status: 400 })
    const ext = imageMimeType === 'image/png' ? 'png' : imageMimeType === 'image/webp' ? 'webp' : imageMimeType === 'image/svg+xml' ? 'svg' : 'jpg'
    const filename = `logos/${uuid()}.${ext}`
    const buffer = Buffer.from(imageBase64, 'base64')
    const { error } = await sb().storage.from('media').upload(filename, buffer, { contentType: imageMimeType, upsert: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const { data: urlData } = sb().storage.from('media').getPublicUrl(filename)
    return NextResponse.json({ url: urlData.publicUrl })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
