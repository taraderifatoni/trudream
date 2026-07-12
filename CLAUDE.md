# PUBLISIO — Master Brief
**Versi:** 5.0 FINAL — 12 Juli 2026
**Untuk:** Coding Agent
**Baca seluruhnya sebelum menulis satu baris kode.**
**Menggantikan SEMUA dokumen sebelumnya.**

---

# A. TENTANG PUBLISIO

## A1. Apa Ini

Publisio adalah **content repurposing tool** untuk Instagram. Satu kalimat:

> Ambil konten dari sumber manapun → produce carousel DAN reels yang siap posting, dengan branding Beautifio, dalam 2-3 menit.

Publisio BUKAN AI art generator. Dia **media processor** — ambil gambar dan video dari sumber, crop, resize, overlay teks, compose jadi carousel atau reels.

## A2. Filosofi: Media-First

```
PRINSIP: Jangan generate, ambil dan olah.

Sumber punya gambar → ambil, crop, resize (gratis, unlimited)
Sumber punya video  → ambil, potong, overlay teks (gratis, unlimited)
Sumber tidak punya  → solid color background + teks (gratis)
User minta AI       → baru generate (1 opsi terakhir, bayar token)
```

Gemini dipakai HANYA untuk **1 hal**: baca artikel → output JSON (struktur slide, judul, bullets). Itu 1 API call per carousel. Tidak ada AI image generation kecuali user explicitly minta Full AI mode.

Processing visual 100% dilakukan oleh engine sendiri:
- **sharp** → crop, resize, adjust gambar (gratis)
- **canvas (@napi-rs/canvas)** → overlay teks, compose slide (gratis)
- **ffmpeg** → potong video, resize, overlay teks, concat slides jadi video (gratis)
- **yt-dlp** → download video YouTube/TikTok (gratis)

## A3. Referensi Style: @herbyuss

Pelajari akun Instagram @herbyuss. Ciri khas yang harus ditiru:
- Slide foto → background GELAP, teks TERANG
- Slide teks → background TERANG (cream/putih), teks GELAP
- Layout CLEAN dan SIMPLE
- Typography besar, readable, hierarchical
- Tidak overloaded — setiap slide punya satu pesan jelas
- Carousel berganti-ganti gelap↔terang → dinamis dan engaging

Referensi:
- https://www.instagram.com/p/DXHOkSOk7lS/
- https://www.instagram.com/p/DamX_21k4un/
- https://www.instagram.com/p/DahNU8Wk1f-/
- https://www.instagram.com/reel/Dam154CzvtT/

---

# B. INPUT & OUTPUT

## B1. Dua Input

### Input 1: Sumber Konten (WAJIB)
Apa saja yang mengandung informasi:
- Link artikel web (BBC, Kompas, beautyjournal, dll)
- Link video YouTube
- Link video TikTok
- Teks yang diketik/paste manual
- Upload gambar
- Upload video

Dari input ini Publisio extract:
- **Teks**: isi artikel, judul, poin-poin utama
- **Gambar**: semua foto dari artikel (og:image, figure img, article img)
- **Video**: download via yt-dlp, extract thumbnail/frames via ffmpeg

### Input 2: Referensi Format (OPSIONAL)
Carousel yang stylenya mau ditiru:
- Link IG carousel → auto-scrape setiap slide via Puppeteer
- Upload screenshot slides manual (fallback kalau IG blocking)

Dari input ini Publisio pahami:
- Berapa slide
- Layout tiap slide (posisi gambar, posisi teks, proporsi)
- Style penulisan
→ Output meniru format referensi

## B2. Tiga Output

### Output 1: CAROUSEL (PNG slides)
- Set gambar PNG siap posting ke IG feed
- Default 1080×1350 (4:5), bisa 1:1, 9:16, 16:9
- Setiap slide: gambar/solid + text overlay + branding

### Output 2: REELS (video MP4)
Dua sub-jenis:

**2a. Video dari sumber → Reels branded**
- Input: link YouTube/TikTok/upload video
- yt-dlp download → ffmpeg resize 9:16 → overlay teks + branding
- Output: .mp4 siap posting sebagai Reels
- Durasi: sesuai sumber (max 90 detik)

**2b. Carousel slides → video slideshow**
- Input: carousel PNG yang sudah di-generate
- ffmpeg concat slides (4 detik per slide, transisi fade)
- Output: .mp4 slideshow yang bisa diposting sebagai Reels
- Durasi: jumlah slides × 4 detik

### Output 3: BOTH
- Carousel PNG + Reels MP4 dari konten yang sama
- Satu generate, dua format output

### Selalu disertai:
- Caption siap posting (dengan #curhatinaja + tagline)
- ZIP download (carousel) dan/atau MP4 download (reels)
- Opsi direct post ke IG via Meta Graph API

## B3. UI Playground

```
┌─────────────────────────────────────────────────────────────┐
│ CONTENT MODE:  [Source First]  [Full AI]                    │
│ RATIO:         [4:5] [1:1] [9:16] [16:9]                  │
│ OUTPUT:        [Carousel] [Reels] [Both]                    │
│                                                             │
│ ┌─ Sumber Konten ────────────────────────────────────────┐ │
│ │ [paste link / ketik teks]                    [Upload]  │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─ Referensi Format (opsional) ──────────────────────────┐ │
│ │ [paste link IG carousel]                    [Upload]   │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                             │
│                    [ ▶ GO ]                                 │
│                                                             │
│ ┌─ Preview ──────────────────────────────────────────────┐ │
│ │ [slide1] [slide2] [slide3] [slide4] ...                │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                             │
│ CAPTION: [..........]                            [Copy]     │
│                                                             │
│         [Download ZIP]    [Download MP4]    [Post IG]        │
└─────────────────────────────────────────────────────────────┘
```

---

# C. PIPELINE

## C1. Alur Lengkap

```
User klik GO
    │
    ├─ [1] DETECT INPUT TYPE
    │      URL artikel? → scrape teks + gambar
    │      URL YouTube? → yt-dlp download video + thumbnail
    │      URL TikTok?  → yt-dlp download video + thumbnail
    │      URL IG?      → Puppeteer scrape
    │      Teks biasa?  → langsung ke analisis
    │      Upload file? → simpan, detect gambar/video
    │
    ├─ [2] EXTRACT MEDIA DARI SUMBER
    │      Teks:
    │        - cheerio parse HTML (SSR sites)
    │        - Puppeteer fallback (SPA sites)
    │        - Extract: judul, paragraf, struktur artikel
    │      Gambar:
    │        - og:image dari meta tags
    │        - Semua <img> di <article>/<main>/<figure>
    │        - JSON-LD structured data
    │        - Download semuanya ke /tmp via sharp
    │        - Catat caption/alt text + konteks heading terdekat
    │      Video:
    │        - yt-dlp: download video + thumbnail
    │        - ffmpeg: extract key frames (1 frame per 10 detik)
    │        - Simpan frames sebagai gambar untuk slide
    │
    ├─ [3] ANALYZE REFERENCE (jika ada)
    │      Link IG → Puppeteer scrape setiap slide carousel
    │      Upload screenshots → langsung pakai
    │      Kirim ke Gemini Vision → analisis layout per slide
    │      Output: ReferenceAnalysis JSON
    │
    ├─ [4] CONTENT ANALYSIS (Gemini — 1 API call)
    │      Input: teks artikel + daftar media tersedia + (referensi)
    │      Gemini output: JSON slides
    │        - type, title, bullets, text per slide
    │        - assetSource per slide (original/none)
    │        - originalAssetIndex (gambar mana dari sumber)
    │      ATURAN:
    │        - Listicle → 1 slide per item/orang
    │        - Bullets informatif 15-25 kata
    │        - 4-10 slide, cover pertama, CTA terakhir
    │
    ├─ [5] MEDIA PROCESSING (gratis, unlimited)
    │      Per slide:
    │        Ada gambar sumber → sharp resize/crop ke dimensi slide
    │        Tidak ada gambar  → solid color background
    │        (Full AI mode)    → Gemini Image / DALL-E generate
    │
    │      sharp operations:
    │        - resize(width, height, fit:'cover', position:'north')
    │        - extract() untuk crop region tertentu
    │        - modulate() untuk adjust brightness
    │
    ├─ [6] RENDER CAROUSEL (canvas)
    │      Per slide → PNG:
    │        - Background: gambar sumber ATAU solid color
    │        - Text overlay: title, bullets, quote, etc
    │        - Branding: @beautifio.space, logo
    │        - Dual mode: foto=gelap, teks=terang
    │        - Slide terakhir (CTA): logo + #curhatinaja + tagline
    │      Output: set PNG files
    │
    ├─ [7] RENDER REELS (ffmpeg) — jika output = Reels atau Both
    │
    │      7a. Dari video sumber:
    │        ffmpeg -i source.mp4
    │          -vf "scale=1080:1920:force_original_aspect_ratio=increase,
    │               crop=1080:1920,
    │               drawtext=text='Title':fontcolor=#FFC64F:fontsize=56:
    │                 x=(w-text_w)/2:y=h*0.7:fontfile=fonts/Poppins-Bold.ttf,
    │               drawtext=text='@beautifio.space':fontcolor=#647488:
    │                 fontsize=24:x=(w-text_w)/2:y=h*0.92:
    │                 fontfile=fonts/Poppins-Regular.ttf"
    │          -t 90 output.mp4
    │
    │      7b. Dari carousel slides:
    │        Per slide PNG → 4 detik video
    │        ffmpeg concat semua → slideshow MP4
    │        Transisi: crossfade 0.5 detik
    │
    └─ [8] OUTPUT
           - Upload PNG/MP4 ke Supabase Storage
           - Generate public URLs
           - Stream progress ke browser via SSE
           - Tampilkan preview di playground
           - Tombol: Download ZIP / Download MP4 / Post IG
```

## C2. Content Modes

### Source First (DEFAULT)
- Extract teks + SEMUA media dari sumber
- Media di-crop/resize oleh engine (gratis)
- Gemini: 1 API call untuk analisis teks
- TIDAK ADA AI image generation
- 90% penggunaan

### Full AI (opsional, boros)
- Extract teks saja
- Semua gambar AI-generated (Gemini Image / DALL-E)
- 6-8 API calls per carousel
- Hanya kalau user explicitly pilih

### Dengan Referensi (opsional)
- Analisis carousel referensi → pahami layout
- Output meniru format referensi
- Konten dari sumber, layout dari referensi, warna Beautifio

---

# D. BRAND BEAUTIFIO

## D1. Warna — HARD LOCK

| Nama | Hex | Fungsi |
|------|-----|--------|
| **Peacock** | `#084463` | Background slide foto, heading di mode teks |
| **Saffron** | `#FFC64F` | Heading di mode foto, bullet dots, hashtag, angka stat |
| **Icy Sky** | `#6BB9D4` | Teks secondary, desc, source attribution |
| **Cloud White** | `#F8FAFC` | Background slide teks (mode terang) |
| **White** | `#FFFFFF` | Body text di mode foto |
| **Deep Slate** | `#1E2938` | Body text di mode teks, background alternatif |
| **Slate Gray** | `#647488` | Muted text, handle @beautifio.space |

TIDAK BOLEH ada warna lain di slide maupun video output.

### Kode di render-slide.ts:

```typescript
const BEAUTIFIO = {
  primary:     '#084463',
  accent:      '#FFC64F',
  secondary:   '#6BB9D4',
  accent2:     '#6BB9D4',
  accent2Light:'#8CC5D0',
  bg:          '#F8FAFC',
  white:       '#FFFFFF',
  dark:        '#1E2938',
  muted:       '#647488',
  deepSlate:   '#1E2938',
}
```

## D2. Dual Layout System

Terinspirasi @herbyuss — carousel berganti-ganti gelap↔terang.

### Mode FOTO (slide ada gambar dari sumber)
- Background: **PEACOCK** gelap
- Heading: **SAFFRON** kuning
- Body: **WHITE** putih
- → Foto jadi hero, teks kontras terang

### Mode TEKS (slide tanpa gambar, dominan teks)
- Background: **CLOUD WHITE** terang
- Heading: **PEACOCK** biru gelap
- Body: **DEEP SLATE** gelap
- Bullet dots: **SAFFRON** kuning
- → Mudah dibaca lama, bersih, editorial

Engine memilih otomatis:
```typescript
function getSlideColors(hasImage: boolean) {
  if (hasImage) {
    return { bg: '#084463', heading: '#FFC64F', body: '#FFFFFF', secondary: '#6BB9D4' }
  } else {
    return { bg: '#F8FAFC', heading: '#084463', body: '#1E2938', secondary: '#647488', dot: '#FFC64F' }
  }
}
```

## D3. Typography

| Elemen | Font | Weight | Size |
|--------|------|--------|------|
| Cover title | Poppins | Bold 700 | 64-72px |
| Profile name | Poppins | Bold 700 | 56px |
| Section title | Poppins | SemiBold 600 | 48-56px |
| Bullet text | Poppins | Regular 400 | 28-34px adaptif |
| Subtitle | Poppins | Regular 400 | 28-32px |
| Stat number | Poppins | Bold 700 | 160-180px |
| Quote text | Poppins | Regular 400 | 44-52px |
| CTA text | Poppins | Bold 700 | 56px |
| Handle | Poppins | Regular 400 | 20px |
| Hashtag | Poppins | SemiBold 600 | 28px |
| Tagline | Poppins | Regular 400 | 22px |
| Video title overlay | Poppins | Bold 700 | 56px |
| Video subtitle overlay | Poppins | Regular 400 | 28px |
| Video branding bar | Poppins | Regular 400 | 24px |

## D4. Caption Rules

- Bahasa Indonesia natural, gaya Beautifio
- Hook kuat di kalimat pertama
- 3-4 poin inti
- CTA
- Baris wajib: **di sini, kita semua didengerin. Ruang Curhat 24/7**
- 5 hashtag huruf kecil, hashtag PERTAMA wajib **#curhatinaja**
- TANPA emoji
- JANGAN mention akun lain
- Maksimal 200 kata

Contoh:
```
Wasit perempuan di Piala Dunia 2026? Ini dia para pelopornya!

FIFA berkomitmen meningkatkan jumlah wasit perempuan di turnamen pria. Kenalan dengan Stéphanie Frappart, Salima Mukansanga, dan Yoshimi Yamashita — tiga wasit yang membuat sejarah di Qatar 2022.

Mereka bukan cuma mengisi kuota. Mereka mengukir sejarah.

di sini, kita semua didengerin. Ruang Curhat 24/7

#curhatinaja #wasitperempuan #pialadunia2026 #sepakbola #kesetaraan
```

## D5. Slide CTA (Slide Terakhir) — Selalu Ada

```
┌─────────────────────────┐
│  ■ PEACOCK solid        │
│                         │
│  Kalimat inspirasi!     │  SAFFRON 56px
│                         │
│  Follow @beautifio.space│  WHITE 28px
│                         │
│      [LOGO BEAUTIFIO]   │  dari settings
│     #curhatinaja        │  SAFFRON 28px
│  di sini, kita semua    │  WHITE 22px
│  didengerin.            │
│  Ruang Curhat 24/7      │
└─────────────────────────┘
```

## D6. Video Branding Overlay

Untuk Reels/video, overlay di lower-third:
```
┌─────────────────────────┐
│                         │
│      VIDEO CONTENT      │  70% — video asli
│                         │
├─ PEACOCK 70% opacity ───┤
│                         │  30% — branding bar
│  Title (SAFFRON 56px)   │
│  Subtitle (WHITE 28px)  │
│                         │
│  @beautifio.space       │  SLATE GRAY 24px
│  #curhatinaja           │  SAFFRON 24px
└─────────────────────────┘
```

ffmpeg drawtext command:
```bash
ffmpeg -i input.mp4 \
  -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,
       drawbox=y=ih*0.68:w=iw:h=ih*0.32:color=#084463@0.7:t=fill,
       drawtext=fontfile=fonts/Poppins-Bold.ttf:text='Title Here':
         fontcolor=#FFC64F:fontsize=56:x=(w-text_w)/2:y=h*0.73,
       drawtext=fontfile=fonts/Poppins-Regular.ttf:text='Subtitle':
         fontcolor=#FFFFFF:fontsize=28:x=(w-text_w)/2:y=h*0.80,
       drawtext=fontfile=fonts/Poppins-Regular.ttf:text='@beautifio.space':
         fontcolor=#647488:fontsize=24:x=(w-text_w)/2:y=h*0.90,
       drawtext=fontfile=fonts/Poppins-SemiBold.ttf:text='#curhatinaja':
         fontcolor=#FFC64F:fontsize=24:x=(w-text_w)/2:y=h*0.94" \
  -t 90 -c:a copy output.mp4
```

---

# E. SLIDE LAYOUTS

## E1. Cover (MODE FOTO)

```
┌─────────────────────────┐
│                         │
│      GAMBAR SUMBER      │  55% — foto dari artikel/video thumbnail
│      (crop bias ATAS    │       sharp position:'north'
│       kepala keliatan)  │
│                         │
├─────────────────────────┤
│ ■ PEACOCK #084463       │  45% — solid
│                         │
│  Title (SAFFRON 64px)   │
│  Subtitle (WHITE 28px)  │
│                         │
│          @beautifio.space│
└─────────────────────────┘
```

## E2. Profile — Listicle (MODE FOTO)

Untuk artikel daftar orang. 1 slide per orang.

```
┌─────────────────────────┐
│                         │
│    FOTO ORANG           │  45% — dari sumber, crop bias atas
│    (sharp position:     │
│     'north')            │
│                         │
├─────────────────────────┤
│ ■ PEACOCK               │  55% — teks centered vertikal
│                         │
│ Nama Lengkap            │  SAFFRON 56px bold
│                         │
│ ■ Bio informatif 1-2    │  WHITE 28-30px
│   kalimat pencapaian.   │
│ ■ Fakta menarik.        │
│                         │
│          @beautifio.space│
└─────────────────────────┘
```

## E3. Bullets — Ada Gambar (MODE FOTO)

```
┌─────────────────────────┐
│    GAMBAR SUMBER        │  ADAPTIF:
│                         │  ≤2 bullet → 45% gambar
├─────────────────────────┤  3-4 bullet → 30%
│ ■ PEACOCK               │  5+ bullet → 18%
│                         │
│ Title (SAFFRON 48px)    │  Font juga ADAPTIF:
│                         │  ≤3 bullet → 34px
│ ■ Bullet informatif     │  4-5 → 30px
│   15-25 kata.           │  6+ → 26px
│ ■ Berikan konteks.      │
│                         │  Teks VERTICALLY CENTERED
│          @beautifio.space│
└─────────────────────────┘
```

## E4. Bullets — Tanpa Gambar (MODE TEKS)

```
┌─────────────────────────┐
│ ■ CLOUD WHITE #F8FAFC   │  Background terang
│                         │
│ Title (PEACOCK 48px)    │  Teks gelap = mudah dibaca
│                         │
│ ■ Bullet informatif     │  DEEP SLATE 30px
│   15-25 kata.           │  Bullet dot: SAFFRON
│ ■ Berikan konteks.      │
│ ■ Fakta menarik.        │
│                         │  Teks VERTICALLY CENTERED
│          @beautifio.space│  SLATE GRAY
└─────────────────────────┘
```

## E5. Stat (MODE TEKS — TANPA gambar)

```
┌─────────────────────────┐
│ ■ PEACOCK solid         │
│                         │
│     ─── (ICY SKY line)  │
│         87%             │  SAFFRON 160-180px
│     ─── (ICY SKY line)  │
│   Keterangan singkat    │  WHITE 32px
│                         │  Semua CENTERED
│          @beautifio.space│
└─────────────────────────┘
```

## E6. Grid4 (MODE TEKS — TANPA gambar)

```
┌────────────┬────────────┐
│  PEACOCK   │ DEEP SLATE │  Konten CENTERED
│    01      │    02      │  VERTIKAL tiap cell
│   Title    │   Title    │
│   desc     │   desc     │  Num: SAFFRON
├────────────┼────────────┤  Title: WHITE
│ DEEP SLATE │  PEACOCK   │  Desc: ICY SKY
│    03      │    04      │
│   Title    │   Title    │
│   desc     │   desc     │
└────────────┴────────────┘
```

## E7. Quote (MODE TEKS — TANPA gambar)

```
┌─────────────────────────┐
│ ■ DEEP SLATE #1E2938    │
│                         │
│         " "             │  SAFFRON 80px
│  "Kutipan bermakna"     │  WHITE 44-52px centered
│  — Nama, Peran          │  ICY SKY 28px
│                         │  Semua VERTICALLY CENTERED
│          @beautifio.space│
└─────────────────────────┘
```

## E8. CTA (lihat D5 di atas)

---

# F. MEDIA PROCESSING ENGINE

## F1. Image Processing (sharp)

```bash
npm install sharp
```

```typescript
import sharp from 'sharp'

// Resize + crop ke dimensi slide, bias ATAS (kepala keliatan)
async function fitToSlide(input: string, w: number, h: number): Promise<Buffer> {
  return sharp(input)
    .resize(w, h, { fit: 'cover', position: 'north' })
    .toBuffer()
}

// Crop region tertentu
async function cropRegion(input: string, left: number, top: number, w: number, h: number): Promise<Buffer> {
  return sharp(input).extract({ left, top, width: w, height: h }).toBuffer()
}

// Adjust brightness kalau terlalu gelap
async function brighten(input: string): Promise<Buffer> {
  return sharp(input).modulate({ brightness: 1.1 }).toBuffer()
}
```

## F2. Video Processing (ffmpeg)

```typescript
import { exec } from 'child_process'
import { promisify } from 'util'
const run = promisify(exec)

// Download video dari YouTube/TikTok
async function downloadVideo(url: string, output: string) {
  await run(`yt-dlp -f 'best[height<=720]' -o '${output}' '${url}'`)
}

// Extract thumbnail dari video
async function extractThumbnail(video: string, output: string, atSecond = 2) {
  await run(`ffmpeg -i '${video}' -vframes 1 -ss ${atSecond} '${output}'`)
}

// Extract key frames (1 per 10 detik) — untuk slide content dari video
async function extractKeyFrames(video: string, outputDir: string) {
  await run(`ffmpeg -i '${video}' -vf "fps=1/10" '${outputDir}/frame-%03d.png'`)
}

// Resize video ke 9:16 untuk Reels
async function resizeTo916(input: string, output: string) {
  await run(`ffmpeg -i '${input}' -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920" -c:a copy '${output}'`)
}

// Add branding overlay ke video (title + handle + hashtag)
async function addBranding(input: string, output: string, title: string, subtitle: string) {
  const filter = [
    `drawbox=y=ih*0.68:w=iw:h=ih*0.32:color=#084463@0.7:t=fill`,
    `drawtext=fontfile=fonts/Poppins-Bold.ttf:text='${title}':fontcolor=#FFC64F:fontsize=56:x=(w-text_w)/2:y=h*0.73`,
    `drawtext=fontfile=fonts/Poppins-Regular.ttf:text='${subtitle}':fontcolor=#FFFFFF:fontsize=28:x=(w-text_w)/2:y=h*0.80`,
    `drawtext=fontfile=fonts/Poppins-Regular.ttf:text='@beautifio.space':fontcolor=#647488:fontsize=24:x=(w-text_w)/2:y=h*0.90`,
    `drawtext=fontfile=fonts/Poppins-SemiBold.ttf:text='\\#curhatinaja':fontcolor=#FFC64F:fontsize=24:x=(w-text_w)/2:y=h*0.94`,
  ].join(',')
  await run(`ffmpeg -i '${input}' -vf "${filter}" -t 90 -c:a copy '${output}'`)
}

// Carousel PNG slides → video slideshow
async function slidesToVideo(slidePaths: string[], output: string, secPerSlide = 4) {
  const parts: string[] = []
  for (let i = 0; i < slidePaths.length; i++) {
    const out = `/tmp/slide-${i}.mp4`
    await run(`ffmpeg -loop 1 -i '${slidePaths[i]}' -t ${secPerSlide} -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=#084463" -pix_fmt yuv420p -c:v libx264 '${out}'`)
    parts.push(out)
  }
  const listFile = '/tmp/concat-list.txt'
  const listContent = parts.map(p => `file '${p}'`).join('\n')
  require('fs').writeFileSync(listFile, listContent)
  await run(`ffmpeg -f concat -safe 0 -i '${listFile}' -c copy '${output}'`)
}
```

## F3. Canvas Rendering (render-slide.ts)

Sudah ada. Yang perlu diperbaiki:

### drawImageTop — bias atas
```typescript
function drawImageTop(ctx, img, w, regionH) {
  const scale = Math.max(w / img.width, regionH / img.height)
  const dw = img.width * scale
  const dh = img.height * scale
  const dx = (w - dw) / 2
  const dy = Math.min(0, (regionH - dh) * 0.15)  // 15% bias atas
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, w, regionH)
  ctx.clip()
  ctx.drawImage(img, dx, dy, dw, dh)
  ctx.restore()
}
```

### Layout adaptif
```typescript
const bulletCount = slide.bullets?.length || 0
const imagePercent = bulletCount <= 2 ? 0.45 : bulletCount <= 4 ? 0.30 : 0.18
const titleSize = bulletCount <= 3 ? 56 : bulletCount <= 5 ? 48 : 42
const bulletSize = bulletCount <= 3 ? 34 : bulletCount <= 5 ? 30 : 26
// Teks VERTICALLY CENTERED
const startY = imgH + Math.max(40, (availH - totalTextH) / 2)
```

---

# G. CONTENT PROMPT (Gemini)

Update `platform_settings.content_prompt` via SQL:

```sql
UPDATE platform_settings SET content_prompt = 'Kamu content creator Instagram profesional untuk akun media lifestyle wanita modern.

Analisis input dan buat data slide carousel.

BAHASA: Semua teks Bahasa Indonesia natural. HANYA imagePrompt dalam Bahasa Inggris.
Istilah Inggris lazim JANGAN diterjemahkan (AI, skincare, wellness, career, dll).
AKURASI: Konten HARUS sesuai isi input. Jangan mengarang fakta.
CRITICAL: Jawab HANYA raw JSON.

{
  "tag": "Kategori",
  "slides": [
    { "type": "cover", "title": "Hook maks 6 kata", "subtitle": "Pendukung maks 15 kata", "imagePrompt": "not needed" },
    { "type": "profile", "tag": "Tag unik", "title": "Nama Lengkap", "bullets": ["Bio 15-25 kata informatif.", "Fakta menarik.", "Fun fact."], "imagePrompt": "not needed" },
    { "type": "bullets", "title": "Judul maks 5 kata", "bullets": ["Poin 15-25 kata informatif."], "imagePrompt": "not needed" },
    { "type": "stat", "stats": [{"value": "87%", "label": "keterangan"}], "imagePrompt": "not needed" },
    { "type": "grid4", "cards": [{"num": "01", "title": "X", "desc": "Penjelasan 10-15 kata"}], "imagePrompt": "not needed" },
    { "type": "quote", "quote": "Kutipan minimal 15 kata.", "source": "— Nama, Jabatan", "imagePrompt": "not needed" },
    { "type": "cta", "text": "Kalimat penutup inspiratif", "imagePrompt": "not needed" }
  ],
  "caption": "Caption IG. Hook. 3-4 poin. CTA. Maks 200 kata."
}

ATURAN:
- 4-10 slide. Cover pertama, CTA terakhir.
- imagePrompt SELALU "not needed" — media diambil dari sumber, bukan AI.
- Bullet 15-25 kata informatif, BUKAN label pendek.
- LISTICLE: 1 slide per orang/item, type "profile". Artikel 6 orang = 8 slide.
- Title maks 5 kata. Stat hanya kalau ada angka nyata.

CAPTION:
- TANPA emoji.
- 5 hashtag huruf kecil. Pertama wajib #curhatinaja.
- Setelah CTA tambahkan: "di sini, kita semua didengerin. Ruang Curhat 24/7"
- JANGAN mention akun lain.'
WHERE id = 1;
```

Catatan: `imagePrompt` diset "not needed" karena Media-First — gambar dari sumber, bukan AI.

---

# H. REFERENCE CLONE FEATURE

## H1. Route.ts — Sambungkan referenceAnalysis ke prompt

```typescript
if (referenceAnalysis && referenceAnalysis.slides?.length > 0) {
  const refInstruction = `
MENIRU FORMAT REFERENSI:
${JSON.stringify(referenceAnalysis, null, 2)}

- Buat TEPAT ${referenceAnalysis.slideCount} slide
- Slide 1 output meniru layout slide 1 referensi, dst
- ABAIKAN template default
- Setiap slide output sertakan: layout, imagePosition, imagePercent, textPosition
`
  customPromptForAnalysis = refInstruction + '\n\n' + customPromptForAnalysis
}
```

## H2. IG Scraper — lib/scrape-ig-carousel.ts

Puppeteer buka link IG → screenshot setiap slide → kirim ke analyzeReferenceSlides.
Fallback: user upload screenshot manual kalau IG blocking.

## H3. renderFlexible — untuk reference-driven slides

Renderer yang baca layout dari Gemini output (imagePosition, textPosition, imagePercent) bukan template fixed. Fallback ke template fixed kalau tidak ada referensi.

---

# I. TECHNICAL

## I1. Stack

| Komponen | Teknologi |
|----------|-----------|
| Framework | Next.js App Router |
| Hosting | Vercel |
| Database | Supabase PostgreSQL |
| Auth | Supabase Auth |
| Storage | Supabase Storage |
| AI Content | Gemini 2.5 Flash (1 call per generate) |
| AI Image | Gemini Image / DALL-E (FALLBACK ONLY) |
| Image Processing | sharp (gratis) |
| Canvas | @napi-rs/canvas |
| Video Download | yt-dlp |
| Video Processing | ffmpeg |
| Scraping | cheerio + Puppeteer/@sparticuz/chromium |

## I2. Database

```
platform_settings (1 row, admin)
├── content_prompt, image_style
├── gemini_key (comma-separated untuk rotation)
├── openai_key (opsional)
└── admin_emails

user_settings (per user)
├── brand_voice (2-3 kalimat tone, BUKAN prompt)
├── heading_font: "Poppins", body_font: "Poppins"
├── slide colors: bg=#F8FAFC, accent=#FFC64F, accent2=#6BB9D4, text=#1E2938, muted=#647488
├── slide_width: 1080, slide_height: 1350
├── logo_url, logo_position
├── instagram_handle: "@beautifio.space"
└── meta_token, ig_account_id
```

## I3. Key Files

| File | Fungsi |
|------|--------|
| `lib/render-slide.ts` | PALING KRITIS — render slide PNG + warna + layout |
| `app/api/generate/route.ts` | Pipeline utama — orchestrator |
| `lib/gemini.ts` | Gemini content analysis |
| `lib/asset-extractor.ts` | Extract media dari URL sumber |
| `lib/analyze-reference.ts` | Gemini Vision analisis referensi |
| `lib/scrape-ig-carousel.ts` | Puppeteer scrape IG |
| `lib/gemini-image.ts` | AI image gen (fallback only) |
| `lib/openai-image.ts` | DALL-E gen (fallback only) |
| `lib/ytdlp.ts` | Download video |
| `lib/ffmpeg.ts` | Process video |
| `app/playground/page.tsx` | UI utama |

---

# J. ATURAN AGENT

1. JANGAN ubah warna BEAUTIFIO tanpa instruksi eksplisit.
2. JANGAN `supabase db push` — DB via SQL Editor.
3. Test VISUAL setelah setiap perubahan — generate, lihat hasil, upload bukti.
4. Jangan claim done tanpa evidence.
5. Backup DB sebelum edit.
6. Source First = DEFAULT. Jangan generate AI image kecuali user pilih Full AI.
7. Kalau ragu, TANYA.
8. sharp position:'north' untuk crop gambar (bias atas, kepala keliatan).
9. Setiap slide yang punya gambar → mode foto (gelap). Tanpa gambar → mode teks (terang).
10. Slide terakhir SELALU: logo + #curhatinaja + tagline.
11. Caption SELALU: #curhatinaja pertama + tagline.
12. Video Reels: lower-third branding bar dengan warna Beautifio.
