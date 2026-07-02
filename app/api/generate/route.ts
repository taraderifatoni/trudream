import { NextRequest, NextResponse } from 'next/server'
import { analyzeContent } from '@/lib/gemini'
import { generateSlideImage } from '@/lib/openai-image'
import { renderSlide, renderVideoOverlay } from '@/lib/render-slide'
import { downloadVideo, isVideoUrl } from '@/lib/ytdlp'
import { processVideo } from '@/lib/ffmpeg'
import path from 'path'
import fs from 'fs'

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

    if (body.url && isVideoUrl(body.url)) {
      const dl = await downloadVideo(body.url)
      videoPath = dl.filePath
      videoDuration = dl.duration
      extraText = `${extraText}\nVideo title: ${dl.title}`.trim()
    }

    const analysis = await analyzeContent({
      text: extraText || body.url,
      videoPath,
      imageBase64: body.imageBase64,
      imageMimeType: body.imageMimeType,
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
