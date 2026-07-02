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
