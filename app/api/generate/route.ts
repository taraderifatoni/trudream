import { NextRequest, NextResponse } from 'next/server'
import { analyzeContent } from '@/lib/gemini'
import { generateSlideImage } from '@/lib/openai-image'
import { downloadVideo, isVideoUrl } from '@/lib/ytdlp'
import { processVideo } from '@/lib/ffmpeg'
import path from 'path'
import fs from 'fs'

export const maxDuration = 300

const TMP = process.env.TMP_DIR || '/tmp'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

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

    const slidesWithImages = await Promise.all(
      analysis.slides.map(async (slide: any) => {
        if (!slide.imagePrompt) return slide
        try {
          const imagePath = await generateSlideImage(slide.imagePrompt)
          return { ...slide, imagePath, imageUrl: toPublicUrl(imagePath) }
        } catch (e) {
          console.error('Image gen failed for slide:', e)
          return slide
        }
      })
    )

    let videoSlide = null
    if (videoPath && fs.existsSync(videoPath)) {
      const processedPath = await processVideo(videoPath)
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
