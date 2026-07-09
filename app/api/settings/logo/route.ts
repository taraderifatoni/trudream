import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { v4 as uuid } from 'uuid'

const SB = process.env.SUPABASE_URL
const SK = process.env.SUPABASE_SERVICE_KEY

async function getUserId(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get('sb-access-token')?.value
  if (!token) return null
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
    return payload.sub ?? null
  } catch { return null }
}

export async function POST(req: NextRequest) {
  const uid = await getUserId(req)
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { imageBase64, imageMimeType } = await req.json()
  if (!imageBase64) return NextResponse.json({ error: 'No image' }, { status: 400 })
  const ext = imageMimeType?.includes('png') ? 'png' : imageMimeType?.includes('webp') ? 'webp' : 'jpg'
  const name = `logos/${uid}-${uuid()}.${ext}`
  const sb = createClient(SB!, SK!, { auth: { persistSession: false } })
  const { error } = await sb.storage.from('media').upload(name, Buffer.from(imageBase64, 'base64'), { contentType: imageMimeType || 'image/png', upsert: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const { data: pub } = sb.storage.from('media').getPublicUrl(name)
  return NextResponse.json({ url: pub.publicUrl })
}
