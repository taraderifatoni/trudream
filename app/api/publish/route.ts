import { NextRequest, NextResponse } from 'next/server'
import { postCarousel, postReel } from '@/lib/instagram'
import { postToFacebookPage } from '@/lib/facebook'
import { buildSlideshow } from '@/lib/ffmpeg'
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
  try {
    const body = await req.json()
    const mode: 'carousel' | 'reel' = body?.mode
    const caption: string = body?.caption ?? ''

    if (mode !== 'carousel' && mode !== 'reel') {
      return NextResponse.json({ error: 'Invalid mode' }, { status: 400 })
    }

    if (mode === 'reel') {
      let videoUrl: string | undefined = body?.videoUrl

      // No source video? Build a slideshow Reel from the slide images.
      if (!videoUrl) {
        const slides: Array<{ imageUrl?: string }> = Array.isArray(body?.slides) ? body.slides : []
        const imgPaths = slides
          .map((s) => (s?.imageUrl ? localFromUrl(s.imageUrl) : null))
          .filter((p): p is string => !!p)
        if (imgPaths.length === 0) {
          return NextResponse.json({ error: 'reel needs videoUrl or slide images' }, { status: 400 })
        }
        const reelPath = await buildSlideshow(imgPaths, { perSlideSec: body?.perSlideSec ?? 3 })
        videoUrl = `${APP_URL}/api/files/${path.basename(reelPath)}`
      }

      const result = await postReel(videoUrl, caption)
      return NextResponse.json({ ok: true, result, reelUrl: videoUrl })
    }

    // carousel
    const slides: Array<{ imageUrl?: string }> = Array.isArray(body?.slides) ? body.slides : []
    const items: Array<{ type: 'image' | 'video'; url: string }> = slides
      .filter((s) => s?.imageUrl)
      .map((s) => ({ type: 'image' as const, url: s.imageUrl as string }))

    if (body?.videoUrl) {
      // Insert the video (already 1080x1350) as the 2nd slide when possible.
      const pos = Math.min(1, items.length)
      items.splice(pos, 0, { type: 'video', url: body.videoUrl })
    }

    if (items.length === 0) {
      return NextResponse.json({ error: 'No items to publish' }, { status: 400 })
    }

    const result = await postCarousel(items, caption)

    // Optionally also post the slide images to the Facebook Page.
    let facebook: any = null
    if (body?.facebook) {
      const imageUrls = slides.filter((s) => s?.imageUrl).map((s) => s.imageUrl as string)
      try {
        facebook = await postToFacebookPage(imageUrls, caption)
      } catch (e: any) {
        console.error('Facebook post failed:', e)
        facebook = { error: e.message }
      }
    }

    return NextResponse.json({ ok: true, result, facebook })
  } catch (err: any) {
    console.error('Publish error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
