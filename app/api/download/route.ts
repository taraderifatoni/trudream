import { NextRequest, NextResponse } from 'next/server'
import archiver from 'archiver'
import path from 'path'
import fs from 'fs'

export const maxDuration = 120

const TMP = process.env.TMP_DIR || '/tmp'

// Resolve a supplied local path against TMP_DIR and ensure it stays inside it.
function resolveInsideTmp(localPath: string): string | null {
  if (!localPath || typeof localPath !== 'string') return null
  const safeName = path.basename(localPath)
  const resolved = path.join(TMP, safeName)
  const tmpResolved = path.resolve(TMP)
  if (!path.resolve(resolved).startsWith(tmpResolved + path.sep) && path.resolve(resolved) !== tmpResolved) {
    return null
  }
  if (!fs.existsSync(resolved)) return null
  return resolved
}

// Fetch a remote (Supabase) file as a Buffer when the local copy is gone
// (e.g. on serverless where /tmp is ephemeral between requests).
async function fetchBuffer(url?: string): Promise<Buffer | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) })
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const slides: Array<{ imagePath?: string; imageUrl?: string }> = Array.isArray(body?.slides)
      ? body.slides
      : []
    const videoSlide: { localPath?: string; publicUrl?: string } | null = body?.videoSlide ?? null

    const archive = archiver('zip', { zlib: { level: 9 } })
    const chunks: Buffer[] = []

    const done = new Promise<Buffer>((resolve, reject) => {
      archive.on('data', (chunk: Buffer) => chunks.push(chunk))
      archive.on('end', () => resolve(Buffer.concat(chunks)))
      archive.on('warning', (err: any) => {
        if (err.code !== 'ENOENT') reject(err)
      })
      archive.on('error', (err: any) => reject(err))
    })

    let index = 0
    for (const slide of slides) {
      const resolved = slide?.imagePath ? resolveInsideTmp(slide.imagePath) : null
      const buf = resolved ? fs.readFileSync(resolved) : await fetchBuffer(slide?.imageUrl)
      if (!buf) continue
      index += 1
      const name = `slide-${String(index).padStart(2, '0')}.png`
      archive.append(buf, { name })
    }

    if (videoSlide) {
      const resolvedVideo = videoSlide.localPath ? resolveInsideTmp(videoSlide.localPath) : null
      const vbuf = resolvedVideo ? fs.readFileSync(resolvedVideo) : await fetchBuffer(videoSlide.publicUrl)
      if (vbuf) archive.append(vbuf, { name: 'reel.mp4' })
    }

    await archive.finalize()
    const buffer = await done

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="carousel.zip"',
      },
    })
  } catch (err: any) {
    console.error('Download error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
