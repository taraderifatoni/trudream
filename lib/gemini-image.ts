import fs from 'fs'
import path from 'path'
import { v4 as uuid } from 'uuid'

const TMP = process.env.TMP_DIR || '/tmp'
const MODEL = 'gemini-2.5-flash-image'

// Multi-key rotation — matches lib/gemini.ts
const KEY_1 = process.env.GEMINI_API_KEY!
let _currentKeyIndex = 0
function getKey(): string {
  const keys = [KEY_1, process.env.GEMINI_API_KEY_2 || '', process.env.GEMINI_API_KEY_3 || ''].filter(Boolean)
  if (keys.length === 0) throw new Error('No Gemini API keys configured')
  return keys[_currentKeyIndex % keys.length]
}
function rotateKey(): void { _currentKeyIndex++ }

const STYLE = `Dark cinematic aesthetic. Deep navy (#191E29) background. Mint green (#01C38D) and dark teal (#132D46) accents. Clean, modern, atmospheric. Moody single-source lighting. High quality digital art. No text, no words, no letters, no UI elements. Vertical 4:5 portrait composition.`

// For the cover slide — brighter, punchier.
const STYLE_VIVID = `Vivid dark cinematic hero image. Vibrant mint green (#01C38D) and dark teal (#132D46) accents on deep navy (#191E29) background. Striking high-contrast lighting, atmospheric and bold. It should POP and stand out. No text, no words, no letters, no UI elements. Vertical 4:5 portrait composition.`

async function callWithRetry(url: string, init: RequestInit, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await fetch(url, init)
    if ((res.status === 429 || res.status === 503) && attempt < maxRetries - 1) {
      rotateKey()
      init.headers = { ...init.headers, 'x-goog-api-key': getKey() } as any
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)))
      continue
    }
    return res
  }
  throw new Error('All Gemini image keys exhausted (429/503)')
}

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

  const res = await callWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({ contents: [{ parts: [{ text: fullPrompt }] }] }),
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
