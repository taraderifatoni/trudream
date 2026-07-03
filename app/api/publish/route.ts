import { NextRequest, NextResponse } from 'next/server'
import { postCarousel, postReel, getPermalink } from '@/lib/instagram'
import { postToFacebookPage } from '@/lib/facebook'
import { buildSlideshow, buildReel } from '@/lib/ffmpeg'
import { addHistory, PlatformResult } from '@/lib/history'
import path from 'path'
import fs from 'fs'

export const maxDuration = 300

const TMP = process.env.TMP_DIR || '/tmp'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

// Resolve a public /api/files URL (or bare filename) to a local TMP path.
function localFromUrl(u: string): string | null {
  const base = path.basename(u.split('?')[0])
  const p = path.join(TMP, base)
  return fs.existsSync(p) ? p : null
}

export async function POST(req: NextRequest) {
  const logs: string[] = []
  const log = (m: string) => {
    logs.push(`${new Date().toISOString().slice(11, 19)}  ${m}`)
    console.log('[publish]', m)
  }

  try {
    const body = await req.json()
    const mode: 'carousel' | 'reel' = body?.mode
    const caption: string = body?.caption ?? ''
    const wantFacebook = !!body?.facebook

    if (mode !== 'carousel' && mode !== 'reel') {
      return NextResponse.json({ error: 'Invalid mode' }, { status: 400 })
    }

    const slides: Array<{ imageUrl?: string }> = Array.isArray(body?.slides) ? body.slides : []
    const imageUrls = slides.filter((s) => s?.imageUrl).map((s) => s.imageUrl as string)
    const thumbUrl = imageUrls[0]

    let instagram: PlatformResult = { ok: false }

    // ── Instagram ──────────────────────────────────────────────
    if (mode === 'reel') {
      log('Mode: Reel')
      let videoUrl: string | undefined = body?.videoUrl
      const per = body?.perSlideSec ?? 3
      const imgPaths = slides
        .map((s) => (s?.imageUrl ? localFromUrl(s.imageUrl) : null))
        .filter((p): p is string => !!p)
      const videoLocal = videoUrl ? localFromUrl(videoUrl) : null

      if (videoLocal && imgPaths.length > 0) {
        // Combined Reel: cover → video (original audio kept) → rest of slides.
        log(`Menggabungkan cover + video + ${imgPaths.length - 1} slide (suara video dipertahankan)...`)
        const reelPath = await buildReel(imgPaths[0], videoLocal, imgPaths.slice(1), { perSlideSec: per })
        videoUrl = `${APP_URL}/api/files/${path.basename(reelPath)}`
        log('Reel gabungan selesai.')
      } else if (imgPaths.length > 0) {
        // No video → silent image slideshow.
        log(`Membuat slideshow dari ${imgPaths.length} slide...`)
        const reelPath = await buildSlideshow(imgPaths, { perSlideSec: per })
        videoUrl = `${APP_URL}/api/files/${path.basename(reelPath)}`
        log('Slideshow selesai.')
      } else if (!videoUrl) {
        return NextResponse.json({ error: 'reel needs a video or slide images' }, { status: 400 })
      } else {
        log('Pakai video sumber langsung.')
      }
      log('Upload Reel ke Instagram (proses video ~1-2 menit)...')
      try {
        const res: any = await postReel(videoUrl, caption)
        if (res?.id) {
          instagram = { ok: true, id: res.id, permalink: await getPermalink(res.id) }
          log('Reel Instagram terbit.')
        } else {
          instagram = { ok: false, error: JSON.stringify(res) }
          log('Reel Instagram gagal.')
        }
      } catch (e: any) {
        instagram = { ok: false, error: e.message }
        log('Error Reel Instagram: ' + e.message)
      }
    } else {
      log('Mode: Carousel')
      const items: Array<{ type: 'image' | 'video'; url: string }> = imageUrls.map((url) => ({
        type: 'image' as const,
        url,
      }))
      if (body?.videoUrl) {
        items.splice(Math.min(1, items.length), 0, { type: 'video', url: body.videoUrl })
        log('Video disisipkan sebagai slide ke-2.')
      }
      if (items.length === 0) {
        return NextResponse.json({ error: 'No items to publish' }, { status: 400 })
      }
      log(`Upload ${items.length} item ke Instagram...`)
      try {
        const res: any = await postCarousel(items, caption)
        if (res?.id) {
          instagram = { ok: true, id: res.id, permalink: await getPermalink(res.id) }
          log('Carousel Instagram terbit.')
        } else {
          instagram = { ok: false, error: JSON.stringify(res) }
          log('Carousel Instagram gagal.')
        }
      } catch (e: any) {
        instagram = { ok: false, error: e.message }
        log('Error Carousel Instagram: ' + e.message)
      }
    }

    // ── Facebook (optional, always the image album) ────────────
    let facebook: PlatformResult | undefined
    if (wantFacebook) {
      log('Posting ke Facebook Page...')
      try {
        const fb: any = await postToFacebookPage(imageUrls, caption)
        facebook = { ok: true, id: fb.id }
        log('Post Facebook terbit.')
      } catch (e: any) {
        facebook = { ok: false, error: e.message }
        log('Error Facebook: ' + e.message)
      }
    }

    const entry = addHistory({
      kind: mode,
      caption,
      slideCount: imageUrls.length,
      hasVideo: !!body?.videoUrl,
      thumbUrl,
      instagram,
      facebook,
      logs,
    })

    return NextResponse.json({ ok: instagram.ok, entry }, { status: instagram.ok ? 200 : 502 })
  } catch (err: any) {
    log('Fatal: ' + err.message)
    try {
      addHistory({
        kind: 'carousel',
        caption: '',
        slideCount: 0,
        hasVideo: false,
        instagram: { ok: false, error: err.message },
        logs,
      })
    } catch {
      /* ignore */
    }
    return NextResponse.json({ error: err.message, logs }, { status: 500 })
  }
}
