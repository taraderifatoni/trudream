import fs from 'fs'
import path from 'path'
import { v4 as uuid } from 'uuid'

const TMP = process.env.TMP_DIR || '/tmp'
const MODEL = 'gemini-2.5-flash-image'
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

const STYLE = `Retro arcade / synthwave aesthetic. Pure black background. Neon lime green (#CDF22B) and electric blue (#1E45FB) glowing accents. 80s arcade cabinet vibe, subtle CRT scanlines, pixel-art / vaporwave energy, bold geometric neon shapes, high contrast glow. No text, no words, no letters, no UI elements. Vertical 4:5 portrait composition.`

// For the cover slide — brighter, punchier arcade hero.
const STYLE_VIVID = `Vivid retro arcade hero image, synthwave/vaporwave energy. Explosive neon lime green (#CDF22B) and electric blue (#1E45FB) glow on deep black, striking high-contrast lighting, glowing edges, 80s arcade cabinet / cyberpunk feel, eye-catching and bold. It should POP and stand out. No text, no words, no letters, no UI elements. Vertical 4:5 portrait composition.`

export async function generateSlideImage(
  prompt: string,
  opts: { vivid?: boolean; customStyle?: string; customStyleVivid?: string } = {},
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set')

  const outputPath = path.join(TMP, `img-${uuid()}.png`)
  const style = opts.customStyle || STYLE
  const styleVivid = opts.customStyleVivid || STYLE_VIVID
  const fullPrompt = `${prompt}\n\n${opts.vivid ? styleVivid : style}`

  const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: fullPrompt }] }],
    }),
    signal: AbortSignal.timeout(90_000),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Gemini image failed: ${res.status} ${detail.slice(-300)}`)
  }

  const data: any = await res.json()
  const parts = data?.candidates?.[0]?.content?.parts ?? []
  const imagePart = parts.find((p: any) => p?.inlineData?.data)
  if (!imagePart) {
    const textPart = parts.find((p: any) => p?.text)?.text
    throw new Error(`Gemini returned no image${textPart ? `: ${textPart.slice(0, 200)}` : ''}`)
  }

  fs.writeFileSync(outputPath, Buffer.from(imagePart.inlineData.data, 'base64'))
  return outputPath
}
