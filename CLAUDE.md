# AI Carousel Generator — Build Spec

## Overview

Single-page mobile-first web app. User paste link/teks/upload gambar atau video → AI analisis → generate carousel slides (PNG) + video (mp4) + caption Instagram. Semua di satu halaman, scroll dari input ke hasil.

**Stack**: Next.js 14 (App Router) + TypeScript + Tailwind CSS + Docker

**AI**:
- Gemini 2.5 Flash → analisis semua input (video, gambar, teks, link)
- OpenAI GPT-image-1 → generate visual per slide, style konsisten dark cinematic

**Processing**:
- yt-dlp → download video dari platform apapun (YouTube, X, TikTok, IG, FB, Reddit, dll)
- FFmpeg → scale video ke 4:5 (1080x1350) black background

**Output**:
- PNG slides 1080x1350 per slide
- mp4 1080x1350 black bg (kalau ada video input)
- Caption IG + hashtag
- Post via Meta Graph API atau download ZIP

---

## Project Structure

```
ai-carousel/
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── next.config.ts
├── tailwind.config.ts
├── package.json
├── app/
│   ├── layout.tsx
│   ├── page.tsx                  ← single page, semua UI di sini
│   ├── globals.css
│   └── api/
│       ├── health/route.ts
│       ├── download/route.ts     ← yt-dlp
│       ├── generate/route.ts     ← main orchestrator
│       ├── publish/route.ts      ← Meta Graph API
│       └── files/[filename]/route.ts  ← serve tmp files publicly
├── lib/
│   ├── gemini.ts
│   ├── openai-image.ts
│   ├── ffmpeg.ts
│   ├── ytdlp.ts
│   ├── instagram.ts
│   └── types.ts
└── tmp/                          ← gitignored
```

---

## Environment Variables — `.env.example`

```env
GEMINI_API_KEY=
OPENAI_API_KEY=
META_ACCESS_TOKEN=
META_APP_ID=
META_APP_SECRET=
INSTAGRAM_ACCOUNT_ID=
NEXT_PUBLIC_APP_URL=https://carousel.yourdomain.com
TMP_DIR=/app/tmp
```

---

## Docker

### Dockerfile

```dockerfile
FROM node:20-alpine AS base

RUN apk add --no-cache \
    python3 py3-pip ffmpeg \
    chromium nss freetype harfbuzz \
    ca-certificates ttf-freefont curl bash

RUN pip3 install --break-system-packages yt-dlp

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
RUN mkdir -p /app/tmp && chown nextjs:nodejs /app/tmp
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
```

### docker-compose.yml

```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    env_file: .env
    volumes:
      - ./tmp:/app/tmp
    restart: unless-stopped
```

---

## Types — `lib/types.ts`

```typescript
export type SlideType = 'cover' | 'bullets' | 'stat' | 'grid4' | 'quote' | 'cta'

export interface SlideContent {
  type: SlideType
  tag: string
  title?: string
  subtitle?: string
  bullets?: string[]
  stats?: { value: string; label: string }[]
  cards?: { num: string; title: string; desc: string }[]
  quote?: string
  source?: string
  text?: string
  imagePrompt: string   // always required — prompt for OpenAI
  imagePath?: string    // local path after generation
  imageUrl?: string     // public URL for serving
}

export interface VideoSlide {
  type: 'video'
  localPath: string
  publicUrl: string
  durationSeconds: number
}

export type AnySlide = SlideContent | VideoSlide

export interface GenerateResult {
  slides: AnySlide[]
  caption: string
  tag: string
}
```

---

## `lib/ytdlp.ts`

```typescript
import { spawn } from 'child_process'
import path from 'path'
import { v4 as uuid } from 'uuid'
import fs from 'fs'

const TMP = process.env.TMP_DIR || '/tmp'

export const VIDEO_PLATFORMS = [
  'youtube.com', 'youtu.be', 'x.com', 'twitter.com',
  'tiktok.com', 'instagram.com', 'facebook.com',
  'fb.com', 'fb.watch', 'reddit.com', 'vimeo.com', 'twitch.tv',
]

export function isVideoUrl(url: string) {
  return VIDEO_PLATFORMS.some(p => url.includes(p))
}

export function downloadVideo(url: string): Promise<{ filePath: string; title: string; duration: number }> {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(TMP, `${uuid()}.mp4`)

    // Get info first
    let infoRaw = ''
    const info = spawn('yt-dlp', ['--dump-json', '--no-playlist', url])
    info.stdout.on('data', d => infoRaw += d.toString())
    info.on('close', () => {
      let title = 'video', duration = 0
      try { const j = JSON.parse(infoRaw); title = j.title || 'video'; duration = j.duration || 0 } catch {}

      // Download
      const dl = spawn('yt-dlp', [
        '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        '--merge-output-format', 'mp4',
        '--no-playlist',
        '-o', outputPath,
        url,
      ])
      let stderr = ''
      dl.stderr.on('data', d => stderr += d.toString())
      dl.on('close', code => {
        if (code !== 0 || !fs.existsSync(outputPath))
          return reject(new Error(`yt-dlp failed: ${stderr.slice(-300)}`))
        resolve({ filePath: outputPath, title, duration })
      })
    })
  })
}
```

---

## `lib/ffmpeg.ts`

```typescript
import { spawn } from 'child_process'
import path from 'path'
import { v4 as uuid } from 'uuid'

const TMP = process.env.TMP_DIR || '/tmp'

// Scale video to 1080x1350 (4:5), black background, proportional
export function processVideo(inputPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(TMP, `reel-${uuid()}.mp4`)
    const args = [
      '-i', inputPath,
      '-vf', 'scale=1080:1350:force_original_aspect_ratio=decrease,pad=1080:1350:(ow-iw)/2:(oh-ih)/2:color=black',
      '-c:v', 'libx264', '-crf', '23', '-preset', 'fast',
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart',
      '-y', outputPath,
    ]
    const proc = spawn('ffmpeg', args)
    let stderr = ''
    proc.stderr.on('data', d => stderr += d.toString())
    proc.on('close', code => {
      if (code !== 0) return reject(new Error(`FFmpeg failed: ${stderr.slice(-300)}`))
      resolve(outputPath)
    })
  })
}
```

---

## `lib/gemini.ts`

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai'
import fs from 'fs'
import { SlideContent } from './types'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

const PROMPT = `You are an expert Instagram content creator for an AI news account (style: @evolving.ai).
Analyze the input and generate carousel slide data.

CRITICAL: Respond ONLY with raw JSON. No markdown, no backticks, nothing before { or after }.

{
  "tag": "AI News",
  "slides": [
    {
      "type": "cover",
      "tag": "AI News",
      "title": "Hook headline max 10 words",
      "subtitle": "Supporting line max 15 words",
      "imagePrompt": "Dark cinematic scene representing this topic. Black background, dramatic lighting, tech aesthetic. NO text, NO words, NO UI in image."
    },
    {
      "type": "bullets",
      "tag": "What happened",
      "title": "Short title",
      "bullets": ["Point one", "Point two", "Point three"],
      "imagePrompt": "Dark cinematic visual. NO text in image."
    },
    {
      "type": "stat",
      "tag": "By the numbers",
      "stats": [{"value": "87%", "label": "description"}],
      "imagePrompt": "Abstract dark tech visual. NO text in image."
    },
    {
      "type": "grid4",
      "tag": "Why it matters",
      "cards": [
        {"num": "01", "title": "Short", "desc": "brief"},
        {"num": "02", "title": "Short", "desc": "brief"},
        {"num": "03", "title": "Short", "desc": "brief"},
        {"num": "04", "title": "Short", "desc": "brief"}
      ],
      "imagePrompt": "Dark dramatic visual. NO text in image."
    },
    {
      "type": "quote",
      "tag": "From the source",
      "quote": "Actual quote",
      "source": "— Name, Role",
      "imagePrompt": "Moody portrait lighting, dark background. NO text in image."
    },
    {
      "type": "cta",
      "tag": "Follow for daily AI updates",
      "text": "Punchy closing line",
      "imagePrompt": "Abstract inspiring dark tech visual. NO text in image."
    }
  ],
  "caption": "Instagram caption. Hook. 3-4 takeaways. CTA. 15-20 hashtags. Max 200 words."
}

Rules:
- 4 to 8 slides depending on content richness
- Always start with cover, always end with cta
- Every slide MUST have imagePrompt
- stat slide only if real numbers exist
- Keep text SHORT`

export async function analyzeContent(input: {
  text?: string
  videoPath?: string
  imageBase64?: string
  imageMimeType?: string
}): Promise<{ slides: SlideContent[]; caption: string; tag: string }> {
  const parts: any[] = [{ text: PROMPT }]

  if (input.videoPath && fs.existsSync(input.videoPath)) {
    const data = fs.readFileSync(input.videoPath)
    if (data.length <= 20 * 1024 * 1024) {
      parts.push({ inlineData: { mimeType: 'video/mp4', data: data.toString('base64') } })
    }
  }

  if (input.imageBase64 && input.imageMimeType) {
    parts.push({ inlineData: { mimeType: input.imageMimeType, data: input.imageBase64 } })
  }

  parts.push({ text: input.text ? `Content:\n${input.text}\n\nGenerate carousel. Raw JSON only.` : 'Generate carousel from the media above. Raw JSON only.' })

  const result = await model.generateContent(parts)
  let raw = result.response.text().trim().replace(/```json|```/gi, '').trim()
  const f = raw.indexOf('{'), l = raw.lastIndexOf('}')
  raw = raw.substring(f, l + 1)

  const parsed = JSON.parse(raw)
  return { slides: parsed.slides || [], caption: parsed.caption || '', tag: parsed.tag || 'AI News' }
}
```

---

## `lib/openai-image.ts`

```typescript
import OpenAI from 'openai'
import fs from 'fs'
import path from 'path'
import { v4 as uuid } from 'uuid'

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const TMP = process.env.TMP_DIR || '/tmp'

const STYLE = `Dark cinematic tech aesthetic. Black background (#0c0c0c). Dramatic single-source lighting. High quality digital art. Sharp details. Moody and atmospheric. No text, no words, no letters, no UI elements.`

export async function generateSlideImage(prompt: string): Promise<string> {
  const response = await client.images.generate({
    model: 'gpt-image-1',
    prompt: `${STYLE} ${prompt}`,
    size: '1024x1536',
    quality: 'high',
    n: 1,
  })

  const url = response.data[0]?.url
  if (!url) throw new Error('No image URL from OpenAI')

  const outputPath = path.join(TMP, `img-${uuid()}.png`)
  const res = await fetch(url)
  const buffer = await res.arrayBuffer()
  fs.writeFileSync(outputPath, Buffer.from(buffer))
  return outputPath
}
```

---

## `lib/instagram.ts`

```typescript
const BASE = 'https://graph.facebook.com/v19.0'
const TOKEN = process.env.META_ACCESS_TOKEN
const ACCOUNT = process.env.INSTAGRAM_ACCOUNT_ID

export async function postCarousel(items: { type: 'image' | 'video'; url: string }[], caption: string) {
  const ids: string[] = []
  for (const item of items) {
    const body: any = { access_token: TOKEN, is_carousel_item: true }
    if (item.type === 'video') { body.media_type = 'VIDEO'; body.video_url = item.url }
    else { body.image_url = item.url }
    const r = await fetch(`${BASE}/${ACCOUNT}/media`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await r.json()
    if (!d.id) throw new Error(`Container failed: ${JSON.stringify(d)}`)
    ids.push(d.id)
  }

  const carousel = await (await fetch(`${BASE}/${ACCOUNT}/media`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ media_type: 'CAROUSEL', caption, children: ids.join(','), access_token: TOKEN }),
  })).json()
  if (!carousel.id) throw new Error(`Carousel failed: ${JSON.stringify(carousel)}`)

  return (await fetch(`${BASE}/${ACCOUNT}/media_publish`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: carousel.id, access_token: TOKEN }),
  })).json()
}

export async function postReel(videoUrl: string, caption: string) {
  const container = await (await fetch(`${BASE}/${ACCOUNT}/media`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ media_type: 'REELS', video_url: videoUrl, caption, access_token: TOKEN }),
  })).json()
  if (!container.id) throw new Error(`Reel container failed`)

  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 5000))
    const s = await (await fetch(`${BASE}/${container.id}?fields=status_code&access_token=${TOKEN}`)).json()
    if (s.status_code === 'FINISHED') break
    if (s.status_code === 'ERROR') throw new Error('Video processing error')
  }

  return (await fetch(`${BASE}/${ACCOUNT}/media_publish`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: container.id, access_token: TOKEN }),
  })).json()
}
```

---

## `app/api/generate/route.ts` — Main Orchestrator

```typescript
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
    // body: { text?, url?, imageBase64?, imageMimeType? }

    let videoPath: string | undefined
    let extraText = body.text || ''

    // Step 1: Download video if URL is a video platform
    if (body.url && isVideoUrl(body.url)) {
      const dl = await downloadVideo(body.url)
      videoPath = dl.filePath
      extraText = `${extraText}\nVideo title: ${dl.title}`.trim()
    }

    // Step 2: Gemini analyzes everything
    const analysis = await analyzeContent({
      text: extraText || body.url,
      videoPath,
      imageBase64: body.imageBase64,
      imageMimeType: body.imageMimeType,
    })

    // Step 3: Generate images for all slides in parallel
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

    // Step 4: Process video with FFmpeg if exists
    let videoSlide = null
    if (videoPath && fs.existsSync(videoPath)) {
      const processedPath = await processVideo(videoPath)
      videoSlide = {
        type: 'video',
        localPath: processedPath,
        publicUrl: toPublicUrl(processedPath),
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
```

---

## `app/api/files/[filename]/route.ts` — Serve tmp files publicly (needed for IG API)

```typescript
import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'

const TMP = process.env.TMP_DIR || '/tmp'

export async function GET(req: NextRequest, { params }: { params: { filename: string } }) {
  const filePath = path.join(TMP, params.filename)
  if (!fs.existsSync(filePath)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const buffer = fs.readFileSync(filePath)
  const ext = path.extname(params.filename).toLowerCase()
  const contentType = ext === '.mp4' ? 'video/mp4' : ext === '.png' ? 'image/png' : 'application/octet-stream'

  return new NextResponse(buffer, { headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=3600' } })
}
```

---

## `app/api/health/route.ts`

```typescript
import { NextResponse } from 'next/server'
export async function GET() { return NextResponse.json({ status: 'ok' }) }
```

---

## `app/page.tsx` — Single Page UI

Build a single scrollable page with these exact sections in order:

### Design tokens
```
bg: #0a0a0a
surface: #111111
surface2: #171717
border: #222222
accent: #5a9cf8
text: #e8e8e8
muted: #666666
font: 'Courier New', monospace
```

### Section 1 — Header (sticky top)
```
● AI CAROUSEL          [mk_wiro]
```
Thin top bar, accent dot, monospace, muted badge right.

### Section 2 — Input (always visible)
```
┌─────────────────────────────┐
│ Paste link, teks, atau      │
│ ketik konten AI di sini...  │
│                             │
│                      [▶ Go] │
└─────────────────────────────┘
[📎 Upload gambar / video]
```
- Textarea auto-grow, min 4 rows
- Detect input type on change:
  - Video platform URL → badge "🎬 YouTube / TikTok / X / ..."
  - Other URL → badge "🔗 Link artikel"
  - Image uploaded → thumbnail preview + remove button
  - Video uploaded → filename + size + remove button
- Upload: jpg, png, webp, mp4, mov, webm (max 500MB)
- Go button disabled while loading

### Section 3 — Progress (shown during generation, hidden otherwise)
```
┌─────────────────────────────┐
│ ⟳ Analyzing with Gemini...  │
│ ──────────────────  Step 1/4│
├─────────────────────────────┤
│ ✓ Analysis done             │
│ ⟳ Generating slide 3/6...  │
│ ○ Processing video          │
│ ○ Done                      │
└─────────────────────────────┘
```
Steps: Analyzing → Generating images (per slide) → Processing video → Done

### Section 4 — Results (shown after generation)
```
┌─────────────────────────────┐
│ 6 slides · AI News          │
│ ← [S1][S2][S3][S4][S5][S6] →│
│      (horizontal scroll)    │
├─────────────────────────────┤
│ Caption                     │
│ ┌─────────────────────────┐ │
│ │ [editable caption text] │ │
│ └─────────────────────────┘ │
│                    [⎘ Copy] │
├─────────────────────────────┤
│ [↓ Download ZIP]            │
│ [▶ Post to Instagram]       │
└─────────────────────────────┘
```

Slides strip:
- Each slide thumbnail: 120x150px, dark bg, rounded, border
- If slide has imageUrl → show image as background
- If slide is video → show play icon overlay
- Tap → full screen modal preview
- Video slide shows mp4 player in modal

Post to Instagram → modal:
```
┌─────────────────────────────┐
│ Post to Instagram           │
│                             │
│ ● Carousel (photo + video)  │
│ ○ Single Reel               │
│                             │
│ [Cancel]    [Post Now ▶]    │
└─────────────────────────────┘
```

### Interactions
- After posting: show "✓ Posted!" green toast, reset form
- Error: show red inline error below input
- All API calls use fetch with proper loading states

---

## `package.json`

```json
{
  "name": "ai-carousel",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "14.2.0",
    "react": "^18",
    "react-dom": "^18",
    "@google/generative-ai": "^0.21.0",
    "openai": "^4.67.0",
    "uuid": "^10.0.0",
    "archiver": "^7.0.0"
  },
  "devDependencies": {
    "typescript": "^5",
    "@types/node": "^20",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "@types/uuid": "^10",
    "@types/archiver": "^6",
    "tailwindcss": "^3.4.0",
    "autoprefixer": "^10.0.0",
    "postcss": "^8.0.0"
  }
}
```

---

## `next.config.ts`

```typescript
import type { NextConfig } from 'next'
const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: { serverActions: { bodySizeLimit: '500mb' } },
}
export default nextConfig
```

---

## Notes for Claude Code

1. Build semua file paralel sekaligus
2. Magnific tidak dipakai — hapus jika ada referensinya
3. OpenAI model: `gpt-image-1`, fallback ke `dall-e-3` jika error
4. Video > 20MB ke Gemini: pakai `genAI.getFileManager()` File API, bukan inline
5. Tmp cleanup: delete files older than 2 hours via setInterval di layout.tsx server component
6. Instagram Graph API butuh public URL — `/api/files/[filename]` route sudah handle ini
7. ZIP download: gunakan `archiver` package, stream semua imagePath + videoPath
8. Mobile-first: max-width 480px, semua touch-friendly (min tap target 44px)
9. Tidak perlu database, tidak perlu auth — single user tool

---

## SECTION 16: VIDEO / REELS OUTPUT

Publisio BUKAN hanya carousel statis. Dia juga harus bisa produce **video Reels siap posting**.

### Jenis 1: Video dari sumber → Reels branded

```
Input: Link YouTube / TikTok / video upload
Output: Video 9:16 (1080×1920) dengan:
  - Video asli sebagai background
  - Text overlay Beautifio (judul, poin-poin)
  - Branding: @beautifio.space + #curhatinaja
  - Durasi: sesuai sumber (max 90 detik untuk Reels)
```

Pipeline:
```
URL video → yt-dlp download → ffmpeg resize ke 9:16
  → ffmpeg add text overlay (judul, subtitle)
  → ffmpeg add branding bar (handle + hashtag)
  → output: .mp4 siap posting
```

### Jenis 2: Carousel slides → video slideshow

```
Input: Carousel yang sudah di-generate (PNG slides)
Output: Video 9:16 dari slides yang di-animate:
  - Setiap slide tampil 3-5 detik
  - Transisi smooth (fade atau slide)
  - Background music opsional
  - Total durasi: slides × 4 detik
```

Pipeline:
```
Slide PNG × N → ffmpeg concat dengan transisi
  → ffmpeg add duration per slide (4 detik)
  → output: .mp4 slideshow
```

### Yang sudah ada di kode (belum optimal)
- `lib/ytdlp.ts` — download video dari YouTube/TikTok
- `lib/ffmpeg.ts` — process video
- `renderVideoOverlay` di `render-slide.ts` — text overlay di video

### Yang perlu dibangun/diperbaiki
- Text overlay harus pakai warna Beautifio (saffron title, white body)
- Branding bar di bawah video: `@beautifio.space | #curhatinaja`
- Ratio selector harus berlaku untuk video juga (9:16 untuk Reels, 1:1 untuk feed video, 16:9 untuk YouTube)
- UI playground: kalau input video, tampilkan opsi "Output as: Carousel / Reels / Both"
- Download: selain ZIP (carousel), juga bisa download .mp4 (Reels)

### Aturan text overlay di video

- Font: Poppins Bold untuk title, Poppins Regular untuk body
- Warna teks: #FFC64F (saffron) untuk title, #FFFFFF (white) untuk body
- Background bar semi-transparan: rgba(8, 68, 99, 0.7) — peacock 70% opacity
- Posisi: lower-third (bawah 30% video)
- Handle + hashtag: bar kecil di very bottom

```
┌─────────────────────────┐
│                         │
│      VIDEO CONTENT      │  70% atas — video asli
│                         │
│                         │
├─────────────────────────┤
│ ▓▓▓ PEACOCK 70% ▓▓▓▓▓  │  30% bawah — text overlay
│                         │
│  Title (SAFFRON)        │
│  Subtitle (WHITE)       │
│                         │
│  @beautifio.space       │
│  #curhatinaja           │
└─────────────────────────┘
```
