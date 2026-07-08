import { NextRequest } from 'next/server'
import { analyzeContent } from '@/lib/gemini'
import { generateSlideImage } from '@/lib/gemini-image'
import { renderSlide, renderVideoOverlay, renderScreenshotSlide } from '@/lib/render-slide'
import { downloadVideo, isVideoUrl } from '@/lib/ytdlp'
import { fetchLinkContent } from '@/lib/scrape'
import { processVideo } from '@/lib/ffmpeg'
import { publishFile } from '@/lib/storage'
import path from 'path'
import fs from 'fs'
import { v4 as uuid } from 'uuid'

export const maxDuration = 300

const TMP = process.env.TMP_DIR || '/tmp'
const HANDLE = process.env.INSTAGRAM_HANDLE || '@aiera.id'

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder()
  const send = (controller: ReadableStreamDefaultController, data: any) => {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const body = await req.json()

        send(controller, { type: 'step', step: 'preparing', pct: 5 })

        let videoPath: string | undefined
        let videoDuration = 0
        let extraText = body.text || ''
        let uploadedImagePath: string | undefined

        if (body.imageBase64 && body.imageMimeType) {
          const ext = String(body.imageMimeType).includes('png') ? 'png' : String(body.imageMimeType).includes('webp') ? 'webp' : 'jpg'
          const p = path.join(TMP, `upload-${uuid()}.${ext}`)
          try { fs.writeFileSync(p, Buffer.from(body.imageBase64, 'base64')); uploadedImagePath = p } catch {}
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
              try { const l = await fetchLinkContent(body.url); if (l.text) extraText = `${extraText}\n${l.text}`.trim() } catch {}
            } catch {}
          }
          if (!gotVideo) {
            try {
              const l = await fetchLinkContent(body.url)
              if (l.title) extraText = `${extraText}\n${l.title}`.trim()
              if (l.text) extraText = `${extraText}\n${l.text}`.trim()
              if (!uploadedImagePath && l.imagePath) uploadedImagePath = l.imagePath
            } catch {}
          }
        }

        let imageBase64 = body.imageBase64
        let imageMimeType = body.imageMimeType
        if (!imageBase64 && uploadedImagePath) {
          try {
            imageBase64 = fs.readFileSync(uploadedImagePath).toString('base64')
            const ext = path.extname(uploadedImagePath).toLowerCase()
            imageMimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
          } catch {}
        }

        // Step 1: Analyze (Gemini)
        send(controller, { type: 'step', step: 'analyzing', pct: 10, label: 'Analyzing with Gemini...' })
        const analysis = await analyzeContent({ text: extraText || body.url, videoPath, imageBase64, imageMimeType })
        send(controller, { type: 'step', step: 'analyzed', pct: 20, label: 'Analysis done' })

        // Step 2: Generate images (sequential for real progress)
        const total = analysis.slides.length
        const slidesWithImages: any[] = []
        for (let i = 0; i < analysis.slides.length; i++) {
          const slide: any = analysis.slides[i]
          if (!slide.imagePrompt) { slidesWithImages.push(slide); continue }

          const basePct = 20 + Math.round((i / total) * 60)
          send(controller, {
            type: 'step',
            step: 'images',
            pct: basePct,
            current: i + 1,
            total,
            label: `Generating slide ${i + 1}/${total}...`,
          })

          try {
            const bgPath = await generateSlideImage(slide.imagePrompt, { vivid: slide.type === 'cover' })
            try {
              const renderedPath = await renderSlide({ ...slide, imagePath: bgPath }, { index: i, total, handle: HANDLE })
              slidesWithImages.push({ ...slide, backgroundPath: bgPath, imagePath: renderedPath, imageUrl: await publishFile(renderedPath) })
            } catch {
              slidesWithImages.push({ ...slide, imagePath: bgPath, imageUrl: await publishFile(bgPath) })
            }
          } catch {
            slidesWithImages.push(slide)
          }
        }

        send(controller, { type: 'step', step: 'images', pct: 80, label: 'Images generated' })

        // Screenshot slide
        if (uploadedImagePath && fs.existsSync(uploadedImagePath)) {
          try {
            const shotPath = await renderScreenshotSlide(uploadedImagePath, analysis.screenshotCaption || '')
            slidesWithImages.splice(Math.min(1, slidesWithImages.length), 0, {
              type: 'screenshot', text: analysis.screenshotCaption || '', imagePath: shotPath, imageUrl: await publishFile(shotPath),
            } as any)
          } catch {}
        }

        // Step 3: Video (if any)
        let videoSlide = null
        if (videoPath && fs.existsSync(videoPath)) {
          send(controller, { type: 'step', step: 'video', pct: 85, label: 'Processing video...' })
          let overlayPath: string | undefined
          if (analysis.videoCaption) {
            try { overlayPath = await renderVideoOverlay(analysis.videoCaption, { handle: HANDLE }) } catch {}
          }
          const processedPath = await processVideo(videoPath, overlayPath)
          videoSlide = { type: 'video', localPath: processedPath, publicUrl: await publishFile(processedPath), durationSeconds: videoDuration }
        }

        // Done
        send(controller, {
          type: 'done',
          pct: 100,
          result: { slides: slidesWithImages, videoSlide, caption: analysis.caption, tag: analysis.tag },
        })
        controller.close()
      } catch (err: any) {
        send(controller, { type: 'error', error: err.message || 'Generation failed' })
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
  })
}
