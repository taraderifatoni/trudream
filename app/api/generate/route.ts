import { NextRequest, NextResponse } from 'next/server'
import { analyzeContent } from '@/lib/gemini'
import { generateSlideImage } from '@/lib/openai-image'
import { renderSlide, renderVideoOverlay, renderScreenshotSlide } from '@/lib/render-slide'
import { downloadVideo, isVideoUrl } from '@/lib/ytdlp'
import { fetchLinkContent } from '@/lib/scrape'
import { processVideo } from '@/lib/ffmpeg'
import path from 'path'
import fs from 'fs'
import { v4 as uuid } from 'uuid'

export const maxDuration = 300

const TMP = process.env.TMP_DIR || '/tmp'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const HANDLE = process.env.INSTAGRAM_HANDLE || '@aiera.id'

function toPublicUrl(filePath: string) {
  return `${APP_URL}/api/files/${path.basename(filePath)}`
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    let videoPath: string | undefined
    let videoDuration = 0
    let extraText = body.text || ''

    // Save the user's uploaded image/screenshot so it can be embedded in a slide.
    let uploadedImagePath: string | undefined
    if (body.imageBase64 && body.imageMimeType) {
      const ext = String(body.imageMimeType).includes('png')
        ? 'png'
        : String(body.imageMimeType).includes('webp')
          ? 'webp'
          : 'jpg'
      const p = path.join(TMP, `upload-${uuid()}.${ext}`)
      try {
        fs.writeFileSync(p, Buffer.from(body.imageBase64, 'base64'))
        uploadedImagePath = p
      } catch (e) {
        console.error('Save uploaded image failed:', e)
      }
    }

    if (body.url) {
      let gotVideo = false
      if (isVideoUrl(body.url)) {
        try {
          const dl = await downloadVideo(body.url)
          videoPath = dl.filePath
          videoDuration = dl.duration
          extraText = `${extraText}\nVideo title: ${dl.title}`.trim()
          gotVideo = true
          // Also pull any text from the link (best-effort) for richer analysis.
          try {
            const l = await fetchLinkContent(body.url)
            if (l.text) extraText = `${extraText}\n${l.text}`.trim()
          } catch {
            /* ignore */
          }
        } catch (e) {
          // No video in this URL (e.g. an image/text tweet) → fall through to
          // scraping its image + text instead of failing.
          console.error('Video download failed, falling back to link scrape:', e)
        }
      }

      if (!gotVideo) {
        // Non-video link (or video download failed) → pull main text + image.
        try {
          const l = await fetchLinkContent(body.url)
          if (l.title) extraText = `${extraText}\n${l.title}`.trim()
          if (l.text) extraText = `${extraText}\n${l.text}`.trim()
          if (!uploadedImagePath && l.imagePath) uploadedImagePath = l.imagePath
        } catch (e) {
          console.error('Link content fetch failed:', e)
        }
      }
    }

    // Feed the image (user upload OR fetched from the link) to Gemini so it can
    // reference it and write an accurate screenshot caption.
    let imageBase64: string | undefined = body.imageBase64
    let imageMimeType: string | undefined = body.imageMimeType
    if (!imageBase64 && uploadedImagePath) {
      try {
        imageBase64 = fs.readFileSync(uploadedImagePath).toString('base64')
        const ext = path.extname(uploadedImagePath).toLowerCase()
        imageMimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
      } catch {
        /* ignore */
      }
    }

    const analysis = await analyzeContent({
      text: extraText || body.url,
      videoPath,
      imageBase64,
      imageMimeType,
    })

    const total = analysis.slides.length
    const slidesWithImages = await Promise.all(
      analysis.slides.map(async (slide: any, index: number) => {
        if (!slide.imagePrompt) return slide
        try {
          // 1) AI background image (cover uses a vivid/high-contrast style)
          const bgPath = await generateSlideImage(slide.imagePrompt, {
            vivid: slide.type === 'cover',
          })
          try {
            // 2) Composite the slide text onto it (@evolving.ai style, 1080x1350)
            const renderedPath = await renderSlide(
              { ...slide, imagePath: bgPath },
              { index, total, handle: HANDLE }
            )
            return {
              ...slide,
              backgroundPath: bgPath,
              imagePath: renderedPath,
              imageUrl: toPublicUrl(renderedPath),
            }
          } catch (re) {
            console.error('Slide render failed, using raw background:', re)
            return { ...slide, imagePath: bgPath, imageUrl: toPublicUrl(bgPath) }
          }
        } catch (e) {
          console.error('Image gen failed for slide:', e)
          return slide
        }
      })
    )

    // Embed the user's uploaded screenshot as a framed slide (after the cover).
    if (uploadedImagePath && fs.existsSync(uploadedImagePath)) {
      try {
        const shotPath = await renderScreenshotSlide(
          uploadedImagePath,
          analysis.screenshotCaption || '',
        )
        slidesWithImages.splice(Math.min(1, slidesWithImages.length), 0, {
          type: 'screenshot',
          text: analysis.screenshotCaption || '',
          imagePath: shotPath,
          imageUrl: toPublicUrl(shotPath),
        } as any)
      } catch (e) {
        console.error('Screenshot slide render failed:', e)
      }
    }

    let videoSlide = null
    if (videoPath && fs.existsSync(videoPath)) {
      // Burn a short caption onto the video slide (in the empty/top area).
      let overlayPath: string | undefined
      if (analysis.videoCaption) {
        try {
          overlayPath = await renderVideoOverlay(analysis.videoCaption, { handle: HANDLE })
        } catch (e) {
          console.error('Video overlay render failed:', e)
        }
      }
      const processedPath = await processVideo(videoPath, overlayPath)
      videoSlide = {
        type: 'video',
        localPath: processedPath,
        publicUrl: toPublicUrl(processedPath),
        durationSeconds: videoDuration,
      }
    }

    return NextResponse.json({
      slides: slidesWithImages,
      videoSlide,
      caption: analysis.caption,
      tag: analysis.tag,
    })
  } catch (err: any) {
    console.error('Generate error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
