import { NextRequest } from 'next/server'
import { analyzeContent } from '@/lib/gemini'
import { generateSlideImage as geminiImage } from '@/lib/gemini-image'
import { generateSlideImage as openaiImage } from '@/lib/openai-image'
import { renderSlide, renderVideoOverlay, renderScreenshotSlide } from '@/lib/render-slide'
import { downloadVideo, isVideoUrl } from '@/lib/ytdlp'
import { fetchLinkContent } from '@/lib/scrape'
import { extractAssets } from '@/lib/asset-extractor'
import { analyzeReferenceSlides } from '@/lib/analyze-reference'
import { scrapeIGCarousel } from '@/lib/scrape-ig-carousel'
import { processVideo, buildSlideshow, brandedReels } from '@/lib/ffmpeg'
import { publishFile } from '@/lib/storage'
import { preprocessImage, autoBrightness } from '@/lib/image-processor'
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
const VALID_TYPES = ['cover', 'profile', 'bullets', 'stat', 'grid4', 'quote', 'cta']
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
    let token = req.cookies.get('sb-access-token')?.value
    // If access token absent, try server-side refresh
    if (!token) {
      const rt = req.cookies.get('sb-refresh-token')?.value
      if (rt) {
        const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=refresh_token`, {
          method: 'POST',
          headers: { apikey: SB_KEY!, 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: rt }),
        })
        if (r.ok) { const d = await r.json(); token = d.access_token }
      }
    }
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
        const contentMode = body.contentMode || 'source-first'
        const aspectRatio = body.aspectRatio || '4:5'
        const outputType: 'carousel' | 'reels' | 'both' = body.outputType || 'carousel'
        const ratioPreset = RATIO_PRESETS[aspectRatio] || RATIO_PRESETS['4:5']

        // Reference analysis — clone layout from uploaded screenshots
        let referenceAnalysis: any = null
        const refScreenshots = body.refScreenshots || []
        if (refScreenshots.length > 0) {
          send(controller, { type: 'step', step: 'reference', pct: 5, label: 'Menganalisis format referensi...' })
          referenceAnalysis = await analyzeReferenceSlides(refScreenshots)
        }

        // Auto-scrape IG carousel if no manual ref screenshots but URL provided
        const referenceUrl = body.referenceUrl || ''
        if (refScreenshots.length === 0 && referenceUrl.includes('instagram.com')) {
          send(controller, { type: 'step', step: 'reference', pct: 5, label: 'Scraping Instagram carousel...' })
          const scrapedScreenshots = await scrapeIGCarousel(referenceUrl)
          if (scrapedScreenshots.length > 0) {
            referenceAnalysis = await analyzeReferenceSlides(scrapedScreenshots)
          }
        }

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
        let extractedAssets: Array<{type:string;url:string;localPath?:string;caption?:string;context?:string;source:string;priority:number}> = []
        if (contentMode !== 'full-ai' && body.url) {
          send(controller, { type: 'step', step: 'extracting', pct: 7, label: 'Extracting assets...' })
          try { extractedAssets = await extractAssets(body.url) } catch(e) { console.error('Asset extraction failed:', e) }

          // Last-resort: if no asset has a localPath, parse og:image directly and retry download
          const hasLocalPath = extractedAssets.some(a => a.localPath)
          if (!hasLocalPath && body.url) {
            try {
              const UA_HDR = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              const htmlRes = await fetch(body.url, {
                headers: { 'User-Agent': UA_HDR, 'Accept': 'text/html', 'Referer': new URL(body.url).origin },
                signal: AbortSignal.timeout(15000),
              })
              const html = await htmlRes.text()
              const ogMatch = html.match(/property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
                || html.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i)
              if (ogMatch?.[1]) {
                const imgUrl = new URL(ogMatch[1], body.url).href
                const imgRes = await fetch(imgUrl, {
                  headers: { 'User-Agent': UA_HDR, 'Referer': body.url, 'Accept': 'image/*' },
                  signal: AbortSignal.timeout(20000),
                })
                if (imgRes.ok) {
                  const buf = Buffer.from(await imgRes.arrayBuffer())
                  if (buf.length > 2000) {
                    const ct = imgRes.headers.get('content-type') || ''
                    const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg'
                    const imgPath = path.join(TMP, `cover-fallback-${uuid()}.${ext}`)
                    fs.writeFileSync(imgPath, buf)
                    // Prepend as highest priority so cover picks it up
                    extractedAssets.unshift({ type: 'image', url: imgUrl, localPath: imgPath, source: 'og:image', priority: 0 })
                    console.log('[generate] Last-resort og:image saved:', imgPath)
                  }
                }
              }
            } catch(e) { console.error('[generate] Last-resort og:image failed:', e) }
          }

          if (contentMode === 'source-first' && extractedAssets.length === 0) {
            send(controller, { type: 'warning', message: 'Tidak ada gambar ditemukan di halaman ini.' })
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

        // Reference-driven prompt — REPLACE template entirely with cloned layout
        if (referenceAnalysis) {
          console.log('[ROUTE] Reference analysis slideCount:', referenceAnalysis.slideCount)
          console.log('[ROUTE] Prompt starts with:', (customPromptForAnalysis || '').substring(0, 100))
          const refInstruction = `
KAMU HARUS MENIRU FORMAT CAROUSEL REFERENSI INI:

${JSON.stringify(referenceAnalysis, null, 2)}

ATURAN PENTING:
- Buat TEPAT ${referenceAnalysis.slideCount} slide
- Setiap slide MENIRU layout slide referensi di posisi yang sama (slide 1 = slide 1)
- Untuk setiap slide, IKUTI: type, layout, textPosition, imagePosition dari referensi
- KONTEN diambil dari sumber yang diberikan, ditulis ulang dengan gaya Beautifio
- Semua teks BAHASA INDONESIA

Untuk setiap slide output JSON, WAJIB sertakan field:
- "layout": deskripsi layout (sama seperti referensi)
- "imagePosition": "top" | "full" | "left" | "right" | "none"
- "imagePercent": angka 0-100, persen area gambar
- "textPosition": "bottom" | "center" | "top" | "left" | "right"

JANGAN gunakan template fixed (cover/bullets/stat/grid4/quote/cta) — gunakan type yang SESUAI REFERENSI.
`
          customPromptForAnalysis = refInstruction
        }

        if (contentMode === 'source-first' && extractedAssets.length > 0) {
          const assetList = extractedAssets.slice(0, 12).map((a, i) => `[${i}] ${a.type} - ${a.source} - ${a.caption || a.context || 'no caption'}`).join('\n')
          const assetInstruction = `
AVAILABLE SOURCE ASSETS (caption/name context included):
${assetList}

CRITICAL INSTRUCTION — ASSET USAGE:
- PRIORITASKAN penggunaan aset sumber untuk SETIAP slide yang relevan.
- Jika artikel berupa LISTICLE: buat SATU SLIDE PER ITEM, assign foto item tersebut (assetSource: "original", originalAssetIndex: N).
- Gunakan caption/context untuk mencocokkan foto ke slide yang tepat (misal: foto dengan caption "Tori Penso" → slide yang membahas Tori Penso).
- Set assetSource = "original" sebanyak mungkin — targetkan SEMUA slide utama memakai aset.
- HANYA gunakan assetSource = "generate" jika BENAR-BENAR TIDAK ADA aset sumber yang relevan.
- Untuk setiap slide, include:
  - "assetSource": "original" atau "generate"
  - "originalAssetIndex": nomor index aset dari daftar (hanya jika assetSource = "original")
  - "imagePrompt": selalu sertakan (sebagai fallback jika assetSource = "original" sekalipun)
`
          customPromptForAnalysis = (customPromptForAnalysis || '') + '\n\n' + assetInstruction
        }

        const analysis = await analyzeContent({ text: extraText || body.url, videoPath, imageBase64, imageMimeType, customPrompt: customPromptForAnalysis || undefined })
        // Filter unknown slide types (skip filter for reference-driven)
        if (!referenceAnalysis) {
          analysis.slides = analysis.slides.filter(s => VALID_TYPES.includes(s.type))
        }
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

          // Normalise: "not needed" imagePrompt → no AI image required (Media-First)
          if (slide.imagePrompt === 'not needed') slide.imagePrompt = ''

          const basePct = 20 + Math.round((i / total) * 60)

          // Slide types that always use a solid brand bg — no image at all.
          const NO_IMAGE_TYPES = ['stat', 'grid4', 'quote', 'cta']
          if (NO_IMAGE_TYPES.includes(slide.type as string)) {
            send(controller, { type: 'step', step: 'images', pct: basePct, current: i + 1, total, label: `Slide ${i + 1}/${total} (solid bg)...` })
            try {
              const renderedPath = await renderSlide({ ...slide }, { index: i, total, handle, ...slideDesign })
              slidesWithImages.push({ ...slide, imagePath: renderedPath, imageUrl: await publishFile(renderedPath), assetSource: 'none' })
            } catch { slidesWithImages.push(slide) }
            continue
          }

          // Source asset — use Gemini's explicit assignment, OR fall back to best
          // available asset for slide types that benefit from a real photo.
          // Cover always gets the first (og:image) asset if available.
          // Profile slides get the asset that best matches the person name.
          let slideWithAsset = slide.assetSource === 'original' && slide.originalAssetIndex !== undefined
            ? extractedAssets[slide.originalAssetIndex] : null

          // Auto-assign fallback for cover: use og:image (index 0) if Gemini didn't assign one
          if (!slideWithAsset && slide.type === 'cover' && extractedAssets.length > 0) {
            const candidate = extractedAssets.find(a => a.localPath) || null
            if (candidate) slideWithAsset = candidate
          }

          // Auto-assign fallback for profile: find asset whose context matches the person name
          if (!slideWithAsset && slide.type === 'profile' && slide.title && extractedAssets.length > 0) {
            const name = (slide.title as string).toLowerCase()
            const nameMatch = extractedAssets.find(a =>
              a.localPath && (
                (a.context || '').toLowerCase().includes(name.split(' ')[0]) ||
                (a.caption || '').toLowerCase().includes(name.split(' ')[0])
              )
            )
            if (nameMatch) slideWithAsset = nameMatch
            else {
              // Last resort: use next unassigned asset in order
              const usedIndices = new Set(
                (analysis.slides as any[])
                  .filter((s: any) => s.assetSource === 'original' && s.originalAssetIndex !== undefined)
                  .map((s: any) => s.originalAssetIndex)
              )
              slideWithAsset = extractedAssets.find((a, idx) => a.localPath && !usedIndices.has(idx)) || null
            }
          }

          if (slideWithAsset?.localPath) {
            send(controller, { type: 'step', step: 'images', pct: basePct, current: i + 1, total, label: `Slide ${i + 1}/${total} (foto sumber)...` })
            try {
              const boost = await autoBrightness(slideWithAsset.localPath)
              const ppPath = await preprocessImage(slideWithAsset.localPath, {
                width: ratioPreset.width,
                height: ratioPreset.height,
                cropNorth: true,
                brighten: boost,
              })
              const renderedPath = await renderSlide({ ...slide, imagePath: ppPath }, { index: i, total, handle, ...slideDesign })
              slidesWithImages.push({ ...slide, backgroundPath: ppPath, imagePath: renderedPath, imageUrl: await publishFile(renderedPath), assetSource: 'original' })
            } catch {
              try {
                const renderedPath = await renderSlide({ ...slide, imagePath: slideWithAsset.localPath }, { index: i, total, handle, ...slideDesign })
                slidesWithImages.push({ ...slide, imagePath: renderedPath, imageUrl: await publishFile(renderedPath), assetSource: 'original' })
              } catch { slidesWithImages.push(slide) }
            }
            continue
          }

          // No source asset. If no imagePrompt (Media-First / Source First mode) → solid bg render.
          if (!slide.imagePrompt) {
            send(controller, { type: 'step', step: 'images', pct: basePct, current: i + 1, total, label: `Slide ${i + 1}/${total}...` })
            try {
              const renderedPath = await renderSlide({ ...slide }, { index: i, total, handle, ...slideDesign })
              slidesWithImages.push({ ...slide, imagePath: renderedPath, imageUrl: await publishFile(renderedPath), assetSource: 'none' })
            } catch { slidesWithImages.push(slide) }
            continue
          }

          // Full AI mode: imagePrompt exists → generate via Gemini/DALL-E.
          send(controller, { type: 'step', step: 'images', pct: basePct, current: i + 1, total, label: `Generating slide ${i + 1}/${total}...` })
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

        send(controller, { type: 'step', step: 'images', pct: 80, label: 'Slides selesai' })

        // Screenshot slide
        if (uploadedImagePath && fs.existsSync(uploadedImagePath)) {
          try {
            const shotPath = await renderScreenshotSlide(uploadedImagePath, analysis.screenshotCaption || '')
            slidesWithImages.splice(Math.min(1, slidesWithImages.length), 0, {
              type: 'screenshot', text: analysis.screenshotCaption || '', imagePath: shotPath, imageUrl: await publishFile(shotPath),
            } as any)
          } catch {}
        }

        // Step 3: Video from source (if any)
        let videoSlide = null
        if (videoPath && fs.existsSync(videoPath)) {
          send(controller, { type: 'step', step: 'video', pct: 85, label: 'Memproses video...' })
          let overlayPath: string | undefined
          if (analysis.videoCaption) {
            try { overlayPath = await renderVideoOverlay(analysis.videoCaption, { handle }) } catch {}
          }
          const processedPath = await processVideo(videoPath, overlayPath)
          videoSlide = { type: 'video', localPath: processedPath, publicUrl: await publishFile(processedPath), durationSeconds: videoDuration }
        }

        // Step 4a: Branded Reels from source video (YouTube/TikTok)
        // Step 4b: Slideshow Reels from carousel PNG slides
        let reelsUrl: string | undefined
        if (outputType === 'reels' || outputType === 'both') {
          // 4a: Source video → branded Reels
          if (videoPath && fs.existsSync(videoPath)) {
            send(controller, { type: 'step', step: 'reels', pct: 88, label: 'Membuat Reels dari video sumber...' })
            try {
              const coverSlide = analysis.slides[0]
              const reelsPath = await brandedReels(videoPath, {
                title: coverSlide?.title || '',
                subtitle: coverSlide?.subtitle || '',
                handle,
                maxSec: 90,
              })
              reelsUrl = await publishFile(reelsPath)
            } catch (e) { console.error('[generate] brandedReels failed:', e) }
          }

          // 4b: Carousel slides → slideshow (if no source video, or outputType=both)
          if (!reelsUrl || outputType === 'both') {
            send(controller, { type: 'step', step: 'reels', pct: 92, label: 'Membuat Reels slideshow...' })
            try {
              const slidePaths = slidesWithImages
                .filter(s => s.imagePath && fs.existsSync(s.imagePath))
                .map(s => s.imagePath as string)
              if (slidePaths.length > 0) {
                const reelsPath = await buildSlideshow(slidePaths, { perSlideSec: 4 })
                reelsUrl = await publishFile(reelsPath)
              }
            } catch (e) { console.error('[generate] Reels slideshow failed:', e) }
          }
        }

        // Done
        send(controller, {
          type: 'done',
          pct: 100,
          result: { slides: slidesWithImages, videoSlide, reelsUrl, caption: analysis.caption, tag: analysis.tag, extractedAssets: extractedAssets.map(a => ({ type: a.type, url: a.url, source: a.source, caption: a.caption })) },
        })
        controller.close()
      } catch (err: any) {
        let msg = err.message || 'Generation failed'
        if (msg.includes('429') || msg.includes('503') || msg.includes('quota') || msg.includes('exceeded') || msg.includes('keys exhausted')) {
          msg = 'Server sedang sibuk. Coba lagi dalam 1-2 menit ya.'
        } else if (msg.includes('Gemini') || msg.includes('GoogleGenerativeAI') || msg.includes('fetch') || msg.includes('ENOENT') || msg.includes('ffmpeg') || msg.includes('yt-dlp')) {
          msg = 'Gangguan teknis. Tim kami sedang menanganinya.'
        }
        send(controller, { type: 'error', error: msg })
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
