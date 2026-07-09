import { NextRequest } from 'next/server'
import { analyzeContent } from '@/lib/gemini'
import { generateSlideImage as geminiImage } from '@/lib/gemini-image'
import { generateSlideImage as openaiImage } from '@/lib/openai-image'
import { renderSlide, renderVideoOverlay, renderScreenshotSlide } from '@/lib/render-slide'
import { downloadVideo, isVideoUrl } from '@/lib/ytdlp'
import { fetchLinkContent } from '@/lib/scrape'
import { extractAssets } from '@/lib/asset-extractor'
import { processVideo } from '@/lib/ffmpeg'
import { publishFile } from '@/lib/storage'
import { CATEGORY_PALETTES, CATEGORY_KEYWORDS } from '@/lib/category-palette'
import { createClient } from '@supabase/supabase-js'
import path from 'path'
import fs from 'fs'
import { v4 as uuid } from 'uuid'

export const maxDuration = 300

const TMP = process.env.TMP_DIR || '/tmp'
const HANDLE = process.env.INSTAGRAM_HANDLE || '@beautifio.space'
const RATIO_PRESETS: Record<string, { width: number; height: number; label: string }> = {
  '4:5':  { width: 1080, height: 1350, label: 'Vertical 4:5 portrait composition' },
  '9:16': { width: 1080, height: 1920, label: 'Vertical 9:16 full-height story composition' },
  '1:1':  { width: 1080, height: 1080, label: 'Square 1:1 composition' },
  '16:9': { width: 1920, height: 1080, label: 'Horizontal 16:9 widescreen composition' },
}
const VALID_TYPES = ['cover', 'bullets', 'stat', 'grid4', 'quote', 'cta']
const SB_URL = process.env.SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_KEY

async function getPlatformOpenaiKey(): Promise<string | null> {
  try {
    const sb = createClient(SB_URL!, SB_KEY!, { auth: { persistSession: false } })
    const { data } = await sb.from('platform_settings').select('openai_key').eq('id', 1).maybeSingle()
    const key = data?.openai_key
    return key && key.startsWith('sk-') ? key : null
  } catch { return null }
}

async function getPlatformPromptSettings(): Promise<Record<string, string | null>> {
  try {
    const sb = createClient(SB_URL!, SB_KEY!, { auth: { persistSession: false } })
    const { data } = await sb.from('platform_settings').select('content_prompt,image_style,image_style_vivid').eq('id', 1).maybeSingle()
    return data ?? {}
  } catch { return {} }
}

async function getUserBrandSettings(req: NextRequest): Promise<Record<string, any>> {
  try {
    const token = req.cookies.get('sb-access-token')?.value
    if (!token) return {}
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
    const uid = payload.sub
    if (!uid) return {}
    const sb = createClient(SB_URL!, SB_KEY!, { auth: { persistSession: false } })
    const { data } = await sb.from('user_settings')
      .select('brand_voice,logo_url,logo_position,heading_font,body_font,slide_bg_color,slide_accent_color,slide_accent2_color,slide_text_color,slide_muted_color,slide_width,slide_height,instagram_handle')
      .eq('user_id', uid).maybeSingle()
    return data ?? {}
  } catch { return {} }
}

function stripMd(v: any): any {
  if (typeof v === 'string') return v.replace(/[*_~`#>|]/g, '').trim()
  if (Array.isArray(v)) return v.map(stripMd)
  if (v && typeof v === 'object') {
    const r: any = Array.isArray(v) ? [] : {}
    for (const k of Object.keys(v)) r[k] = stripMd(v[k])
    return r
  }
  return v
}

function findPalette(tag: string) {
  for (const [category, palette] of Object.entries(CATEGORY_PALETTES)) {
    if (tag.toLowerCase().includes(category.toLowerCase())) return palette
  }
  for (const [cat, words] of Object.entries(CATEGORY_KEYWORDS)) {
    if (words.some(w => tag.toLowerCase().includes(w))) return CATEGORY_PALETTES[cat]
  }
  return null
}

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder()
  const send = (controller: ReadableStreamDefaultController, data: any) => {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const body = await req.json()
        const contentMode = body.contentMode || 'full-ai'
        const aspectRatio = body.aspectRatio || '4:5'
        const ratioPreset = RATIO_PRESETS[aspectRatio] || RATIO_PRESETS['4:5']

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

        // Asset extraction (source-first mode)
        let extractedAssets: Array<{type:string;url:string;localPath?:string;caption?:string;source:string;priority:number}> = []
        if (contentMode !== 'full-ai' && body.url) {
          send(controller, { type: 'step', step: 'extracting', pct: 7, label: 'Extracting assets...' })
          try { extractedAssets = await extractAssets(body.url) } catch(e) { console.error('Asset extraction failed:', e) }
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
        send(controller, { type: 'step', step: 'analyzing', pct: 10, label: 'Analyzing...' })
        const platformSettings = await getPlatformPromptSettings()
        const userBrand = await getUserBrandSettings(req)
        const handle = userBrand.instagram_handle || HANDLE
        const slideDesign = {
          design: {
            headingFont: userBrand.heading_font || undefined,
            bodyFont: userBrand.body_font || undefined,
            bgColor: userBrand.slide_bg_color || undefined,
            accentColor: userBrand.slide_accent_color || undefined,
            accent2Color: userBrand.slide_accent2_color || undefined,
            textColor: userBrand.slide_text_color || undefined,
            mutedColor: userBrand.slide_muted_color || undefined,
            width: ratioPreset.width,
            height: ratioPreset.height,
            logoUrl: userBrand.logo_url || undefined,
            logoPosition: userBrand.logo_position || undefined,
          },
        }
        const userBrandVoice = userBrand.brand_voice || null
        const platformContentPrompt = platformSettings.content_prompt || undefined
        const PROMPT_DEFAULT = undefined // uses built-in prompt in gemini.ts
        const customPromptExt = userBrandVoice
          ? `BRAND VOICE: ${userBrandVoice}\n\n---\n\n` + (platformContentPrompt || '')
          : (platformContentPrompt || '')
        // Replace {{HANDLE}} with actual Instagram handle (fallback to env if no user context)
        const finalPrompt = (customPromptExt || '').replace(/\{\{HANDLE\}\}/g, handle || HANDLE)

        let customPromptForAnalysis = finalPrompt
        if (contentMode === 'source-first' && extractedAssets.length > 0) {
          const assetList = extractedAssets.slice(0, 10).map((a, i) => `[${i}] ${a.type} - ${a.source} - ${a.caption || 'no caption'}`).join('\n')
          const assetInstruction = `
AVAILABLE SOURCE ASSETS:
${assetList}

CRITICAL INSTRUCTION — ASSET USAGE:
- PRIORITASKAN penggunaan aset sumber untuk setiap slide yang relevan.
- Untuk SETIAP slide, cek apakah ada aset dari daftar yang COCOK dengan topik slide tersebut.
- Set assetSource = "original" sebanyak mungkin — targetkan SEMUA slide cover dan bullets memakai aset.
- HANYA gunakan assetSource = "generate" jika BENAR-BENAR TIDAK ADA aset sumber yang relevan untuk slide tersebut.
- Untuk setiap slide, include:
  - "assetSource": "original" atau "generate"
  - "originalAssetIndex": nomor index aset dari daftar (hanya jika assetSource = "original")
  - "imagePrompt": selalu sertakan (sebagai fallback jika assetSource = "original" sekalipun)
`
          customPromptForAnalysis = (finalPrompt || '') + assetInstruction
        }

        const analysis = await analyzeContent({ text: extraText || body.url, videoPath, imageBase64, imageMimeType, customPrompt: customPromptForAnalysis || undefined })
        // Filter unknown slide types to prevent render errors
        analysis.slides = analysis.slides.filter(s => VALID_TYPES.includes(s.type))
        // Apply category color palette per slide
        for (const slide of analysis.slides) {
          const tag = stripMd((slide as any).tag || '')
          const palette = findPalette(tag)
          if (palette) {
            ;(slide as any).palette = palette
            if ((slide as any).imagePrompt) {
              (slide as any).imagePrompt += ` Apply category color palette: primary ${palette.primary}, secondary ${palette.secondary}, accent ${palette.accent}.`
            }
          }
        }
        send(controller, { type: 'step', step: 'analyzed', pct: 20, label: 'Analysis done' })

        // Step 2: Generate images (sequential for real progress)
        const total = analysis.slides.length
        const slidesWithImages: any[] = []
        // Step 2: Check if user has OpenAI key → use that for images
        const openaiUserKey = await getPlatformOpenaiKey()
        const genImage = openaiUserKey
          ? (prompt: string, opts?: any) => { process.env.OPENAI_API_KEY = openaiUserKey; return openaiImage(prompt, opts) }
          : geminiImage

        const ratioLabel = RATIO_PRESETS[aspectRatio]?.label || 'Vertical 4:5 portrait composition'

        for (let i = 0; i < analysis.slides.length; i++) {
          const slide: any = analysis.slides[i]
          if (!slide.imagePrompt && !(slide.assetSource === 'original' && slide.originalAssetIndex !== undefined)) { slidesWithImages.push(slide); continue }

          const basePct = 20 + Math.round((i / total) * 60)

          // Source-first: use extracted asset if available
          const slideWithAsset = slide.assetSource === 'original' && slide.originalAssetIndex !== undefined
            ? extractedAssets[slide.originalAssetIndex] : null

          if (slideWithAsset?.localPath) {
            send(controller, {
              type: 'step',
              step: 'images',
              pct: basePct,
              current: i + 1,
              total,
              label: `Using source asset for slide ${i + 1}/${total}...`,
            })
            try {
              const renderedPath = await renderSlide({ ...slide, imagePath: slideWithAsset.localPath }, { index: i, total, handle, ...slideDesign })
              slidesWithImages.push({ ...slide, backgroundPath: slideWithAsset.localPath, imagePath: renderedPath, imageUrl: await publishFile(renderedPath), assetSource: 'original' })
            } catch {
              slidesWithImages.push({ ...slide, imagePath: slideWithAsset.localPath, imageUrl: await publishFile(slideWithAsset.localPath), assetSource: 'original' })
            }
            continue
          }

          send(controller, {
            type: 'step',
            step: 'images',
            pct: basePct,
            current: i + 1,
            total,
            label: `Generating slide ${i + 1}/${total}...`,
          })

          try {
            const fullImagePrompt = `${slide.imagePrompt}\n\n${ratioLabel}`
            const bgPath = await genImage(fullImagePrompt, { vivid: slide.type === 'cover', customStyle: platformSettings.image_style || undefined, customStyleVivid: platformSettings.image_style_vivid || undefined })
            try {
              const renderedPath = await renderSlide({ ...slide, imagePath: bgPath }, { index: i, total, handle, ...slideDesign })
              slidesWithImages.push({ ...slide, backgroundPath: bgPath, imagePath: renderedPath, imageUrl: await publishFile(renderedPath), assetSource: 'generate' })
            } catch {
              slidesWithImages.push({ ...slide, imagePath: bgPath, imageUrl: await publishFile(bgPath), assetSource: 'generate' })
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
            try { overlayPath = await renderVideoOverlay(analysis.videoCaption, { handle }) } catch {}
          }
          const processedPath = await processVideo(videoPath, overlayPath)
          videoSlide = { type: 'video', localPath: processedPath, publicUrl: await publishFile(processedPath), durationSeconds: videoDuration }
        }

        // Done
        send(controller, {
          type: 'done',
          pct: 100,
          result: { slides: slidesWithImages, videoSlide, caption: analysis.caption, tag: analysis.tag, extractedAssets: extractedAssets.map(a => ({ type: a.type, url: a.url, source: a.source, caption: a.caption })) },
        })
        controller.close()
      } catch (err: any) {
        send(controller, { type: 'error', error: err.message || 'Generation failed' })
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
