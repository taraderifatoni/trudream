import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'

const TMP = process.env.TMP_DIR || '/tmp'

export async function GET(req: NextRequest, { params }: { params: { filename: string } }) {
  const safeName = path.basename(params.filename)
  const filePath = path.join(TMP, safeName)
  if (!fs.existsSync(filePath)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const buffer = fs.readFileSync(filePath)
  const ext = path.extname(safeName).toLowerCase()
  const contentType = ext === '.mp4' ? 'video/mp4' : ext === '.png' ? 'image/png' : 'application/octet-stream'

  return new NextResponse(buffer, { headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=3600' } })
}
