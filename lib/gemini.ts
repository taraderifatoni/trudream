import { GoogleGenerativeAI } from '@google/generative-ai'
import fs from 'fs'
import { SlideContent } from './types'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

const PROMPT = `Kamu content creator Instagram profesional untuk akun berita/edukasi AI modern (teks tegas & informatif, visual sinematik).
Analisis input (video/gambar/teks/link) dan buat data slide carousel.

BAHASA: SEMUA teks yang dibaca manusia (tag, title, subtitle, bullets, stats.label, cards, quote, source, text, caption) WAJIB Bahasa Indonesia yang natural & catchy. HANYA "imagePrompt" yang ditulis dalam Bahasa Inggris (itu buat generator gambar).
PENTING soal istilah: istilah teknis/jargon Inggris yang memang lazim dipakai apa adanya JANGAN diterjemahkan — biarkan dalam Bahasa Inggris. Contoh: developer, skill, framework, tools, prompt, deploy, startup, coding, dataset, machine learning, AI, model, open source, update, feature, dll. Nama produk/brand/orang JUGA jangan diterjemahkan. Tulis natural seperti orang Indonesia bidang tech ngobrol (boleh campur Indonesia-Inggris/Indonglish, jangan dipaksa jadi istilah Indonesia yang kaku, mis. JANGAN "pengembang" tapi "developer", JANGAN "keterampilan" tapi "skill", JANGAN "peranti" tapi "tools").

AKURASI: Konten HARUS sesuai isi input yang sebenarnya — sebutkan fakta, nama, angka, istilah nyata dari input. JANGAN mengarang/generic.

CRITICAL: Jawab HANYA raw JSON. Tanpa markdown, tanpa backtick, tanpa teks sebelum { atau sesudah }.

{
  "tag": "Berita AI",
  "slides": [
    {
      "type": "cover",
      "tag": "Berita AI",
      "title": "Judul hook maksimal 10 kata (Bahasa Indonesia)",
      "subtitle": "Kalimat pendukung maksimal 15 kata",
      "imagePrompt": "VIVID retro arcade / synthwave hero image of this exact topic. Neon lime green and electric blue glow on deep black, 80s arcade cabinet / cyberpunk energy, striking high-contrast glow, eye-catching, bold. Make it POP and stand out. NO text, NO words, NO letters, NO UI in image."
    },
    {
      "type": "bullets",
      "tag": "Apa yang terjadi",
      "title": "Judul singkat",
      "bullets": ["Poin satu", "Poin dua", "Poin tiga"],
      "imagePrompt": "Retro arcade / synthwave visual related to the topic. Neon lime and electric blue glow on black, 80s arcade energy. NO text in image."
    },
    {
      "type": "stat",
      "tag": "Dalam angka",
      "stats": [{"value": "87%", "label": "keterangan singkat"}],
      "imagePrompt": "Abstract retro arcade visual, neon lime and electric blue glow on black, synthwave grid. NO text in image."
    },
    {
      "type": "grid4",
      "tag": "Kenapa penting",
      "cards": [
        {"num": "01", "title": "Singkat", "desc": "penjelasan ringkas"},
        {"num": "02", "title": "Singkat", "desc": "penjelasan ringkas"},
        {"num": "03", "title": "Singkat", "desc": "penjelasan ringkas"},
        {"num": "04", "title": "Singkat", "desc": "penjelasan ringkas"}
      ],
      "imagePrompt": "Retro arcade dramatic visual, neon lime and electric blue glow on black, 80s cabinet vibe. NO text in image."
    },
    {
      "type": "quote",
      "tag": "Dari sumbernya",
      "quote": "Kutipan nyata (terjemahkan ke Indonesia bila perlu)",
      "source": "— Nama, Peran",
      "imagePrompt": "Moody neon portrait lighting, lime green and electric blue rim light, deep black background, arcade/cyberpunk mood. NO text in image."
    },
    {
      "type": "cta",
      "tag": "Ikuti untuk update AI harian",
      "text": "Kalimat penutup yang nendang (Bahasa Indonesia)",
      "imagePrompt": "Abstract inspiring retro arcade visual, neon lime and electric blue glow on black, synthwave energy. NO text in image."
    }
  ],
  "videoCaption": "Keterangan ringkas untuk klip video, maksimal 10 kata (Bahasa Indonesia). Kosongkan '' jika input tidak mengandung video.",
  "screenshotCaption": "Penjelasan singkat untuk gambar/screenshot yang diunggah user, maksimal 12 kata (Bahasa Indonesia). Kosongkan '' jika user tidak mengunggah gambar.",
  "caption": "Caption Instagram Bahasa Indonesia. Hook. 3-4 poin inti. CTA. Maksimal 200 kata."
}

Aturan:
- 4 sampai 8 slide tergantung kekayaan konten
- SELALU mulai dengan cover, SELALU akhiri dengan cta
- Setiap slide WAJIB punya imagePrompt (dalam Bahasa Inggris)
- slide "stat" hanya kalau ada angka nyata di input
- Teks SINGKAT & padat, gaya Indonesia yang enak dibaca
- imagePrompt harus mencerminkan topik SPESIFIK input, bukan arcade/neon generik
- Slide cover: imagePrompt WAJIB cerah, neon, kontras tinggi, stunning & menonjol (JANGAN gelap/suram)
CAPTION:
- TANPA emoji sama sekali
- Maksimal 5 hashtag, semua HURUF KECIL, ditaruh di akhir
- JANGAN sebut/menyebut akun lain (mis. evolving.ai) atau sumber gaya apa pun`

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

  const result = await model.generateContent(parts)
  let raw = result.response.text().trim().replace(/```json|```/gi, '').trim()
  const f = raw.indexOf('{'), l = raw.lastIndexOf('}')
  raw = raw.substring(f, l + 1)

  const parsed = JSON.parse(raw)
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
