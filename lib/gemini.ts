import { GoogleGenerativeAI } from '@google/generative-ai'
import fs from 'fs'
import { SlideContent } from './types'

// Multi-key rotation — avoid 429/503 quota by cycling through backup keys
const KEY_1 = process.env.GEMINI_API_KEY!
let _currentKeyIndex = 0
function getKey(): string {
  const keys = [
    KEY_1,
    process.env.GEMINI_API_KEY_2 || '',
    process.env.GEMINI_API_KEY_3 || '',
  ].filter(Boolean)
  if (keys.length === 0) throw new Error('No Gemini API keys configured')
  return keys[_currentKeyIndex % keys.length]
}
function rotateKey(): void { _currentKeyIndex++ }

function genModel(): import('@google/generative-ai').GenerativeModel {
  const genAI = new GoogleGenerativeAI(getKey())
  return genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
}

// Retry on 429/503 with exponential backoff AND key rotation
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try { return await fn() }
    catch (e: any) {
      const msg = String(e?.message || e?.status || '')
      const isRateLimit = msg.includes('429') || msg.includes('503')
      if (!isRateLimit || attempt === maxRetries - 1) throw e
      rotateKey()
      const delay = Math.min(2000 * (2 ** attempt) + Math.random() * 1000, 15000)
      await new Promise(r => setTimeout(r, delay))
    }
  }
  throw new Error('Retry exhausted')
}

const PROMPT = `Kamu content creator Instagram profesional untuk akun media lifestyle wanita modern @beautifio.space.

Analisis input dan buat data slide carousel.

BAHASA: Semua teks Bahasa Indonesia natural. Istilah Inggris lazim JANGAN diterjemahkan (AI, skincare, wellness, career, dll).
AKURASI: Konten HARUS sesuai isi input. Jangan mengarang fakta.
CRITICAL: Jawab HANYA raw JSON. Tanpa markdown, tanpa backtick.

{
  "tag": "Kategori",
  "slides": [
    { "type": "cover", "title": "Hook maks 6 kata", "subtitle": "Pendukung maks 15 kata", "imagePrompt": "not needed" },
    { "type": "profile", "tag": "Tag unik", "title": "Nama Lengkap", "bullets": ["Bio 15-25 kata informatif.", "Fakta menarik.", "Fun fact."], "imagePrompt": "not needed" },
    { "type": "bullets", "title": "Judul maks 5 kata", "bullets": ["Poin 15-25 kata informatif."], "imagePrompt": "not needed" },
    { "type": "stat", "stats": [{"value": "87%", "label": "keterangan"}], "imagePrompt": "not needed" },
    { "type": "grid4", "cards": [{"num": "01", "title": "X", "desc": "10-15 kata"}], "imagePrompt": "not needed" },
    { "type": "quote", "quote": "Kutipan minimal 15 kata.", "source": "— Nama, Jabatan", "imagePrompt": "not needed" },
    { "type": "cta", "text": "Kalimat penutup inspiratif", "imagePrompt": "not needed" }
  ],
  "videoCaption": "Keterangan ringkas video, maks 10 kata. Kosong jika tidak ada video.",
  "screenshotCaption": "Penjelasan screenshot, maks 12 kata. Kosong jika tidak ada gambar.",
  "caption": "Caption IG. Hook. 3-4 poin. CTA. Maks 200 kata."
}

ATURAN:
- 4-10 slide. Cover pertama, CTA terakhir.
- imagePrompt SELALU "not needed" — media dari sumber, bukan AI.
- Bullet 15-25 kata informatif, BUKAN label pendek.
- LISTICLE: 1 slide per orang/item, type "profile". Artikel 6 orang = 8 slide.
- Title maks 5 kata. Stat hanya kalau ada angka nyata.

CAPTION:
- TANPA emoji.
- 5 hashtag huruf kecil. Pertama wajib #curhatinaja.
- Setelah CTA tambahkan: "di sini, kita semua didengerin. Ruang Curhat 24/7"
- JANGAN mention akun lain.`

export async function analyzeContent(input: {
  text?: string
  videoPath?: string
  imageBase64?: string
  imageMimeType?: string
  customPrompt?: string
}): Promise<{
  slides: SlideContent[]
  caption: string
  tag: string
  videoCaption: string
  screenshotCaption: string
}> {
  const parts: any[] = [{ text: input.customPrompt || PROMPT }]

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

  const result = await withRetry(() => genModel().generateContent(parts))
  let raw = result.response.text().trim().replace(/```json|```/gi, '').trim()
  const f = raw.indexOf('{'), l = raw.lastIndexOf('}')
  raw = raw.substring(f, l + 1)

  let parsed: any
  try {
    parsed = JSON.parse(raw)
  } catch (e: any) {
    // Gemini sometimes returns malformed JSON — try to recover
    console.error('Gemini JSON parse error:', e.message?.substring(0, 100))
    // Fix common issues: unescaped newlines in strings
    raw = raw.replace(/(?<=\": \")[^\"]*(?=\")/g, (m: string) => m.replace(/\n/g, ' ').replace(/"/g, '\\"'))
    try { parsed = JSON.parse(raw) }
    catch (e2) { throw new Error('Gemini returned unparseable JSON') }
  }
  return {
    slides: stripMd(parsed.slides || []),
    caption: stripMd(parsed.caption || ''),
    tag: stripMd(parsed.tag || 'Berita AI'),
    videoCaption: stripMd(parsed.videoCaption || ''),
    screenshotCaption: stripMd(parsed.screenshotCaption || ''),
  }
}

// Remove stray markdown emphasis (*bold*, _italic_, `code`, ~~strike~~) that
// Gemini sometimes leaves in text — it renders as literal chars on the slides.
// Keeps '#' so caption hashtags survive.
// Emoji / pictographs (Gemini sometimes adds them despite instructions).
const EMOJI_RE =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}\u{200D}\u{20E3}]/gu

function stripMd(v: any): any {
  if (typeof v === 'string')
    return v
      .replace(/\*\*?|__?|`|~~/g, '')
      .replace(EMOJI_RE, '')
      .replace(/[ \t]{2,}/g, ' ')
      .trim()
  if (Array.isArray(v)) return v.map(stripMd)
  if (v && typeof v === 'object') {
    for (const k of Object.keys(v)) v[k] = stripMd(v[k])
    return v
  }
  return v
}
