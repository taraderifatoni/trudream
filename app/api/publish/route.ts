import { NextRequest, NextResponse } from 'next/server'
import { postCarousel, postReel } from '@/lib/instagram'
import { postToFacebookPage } from '@/lib/facebook'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const mode: 'carousel' | 'reel' = body?.mode
    const caption: string = body?.caption ?? ''

    if (mode !== 'carousel' && mode !== 'reel') {
      return NextResponse.json({ error: 'Invalid mode' }, { status: 400 })
    }

    if (mode === 'reel') {
      const videoUrl: string | undefined = body?.videoUrl
      if (!videoUrl) {
        return NextResponse.json({ error: 'videoUrl is required for reel mode' }, { status: 400 })
      }
      const result = await postReel(videoUrl, caption)
      return NextResponse.json(result)
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
