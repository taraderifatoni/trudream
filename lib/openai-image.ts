import OpenAI from 'openai'
import fs from 'fs'
import path from 'path'
import { v4 as uuid } from 'uuid'

const TMP = process.env.TMP_DIR || '/tmp'

// Lazy singleton — instantiating at module load breaks `next build` when the
// key is absent (the OpenAI SDK throws in its constructor).
let _client: OpenAI | null = null
function client(): OpenAI {
  // Bound each request so one slow/stuck image can't hang the whole generate.
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 90_000, maxRetries: 1 })
  return _client
}

const STYLE = `Dark cinematic aesthetic. Deep navy (#191E29) background. Mint green (#01C38D) and dark teal (#132D46) accents. Clean, modern, atmospheric. Moody single-source lighting. High quality digital art. No text, no words, no letters, no UI elements.`

// For the cover slide — brighter, punchier.
const STYLE_VIVID = `Vivid dark cinematic hero image. Vibrant mint green (#01C38D) and dark teal (#132D46) accents on deep navy (#191E29) background. Striking high-contrast lighting, atmospheric and bold. It should POP and stand out. No text, no words, no letters, no UI elements.`

async function saveImage(item: { url?: string; b64_json?: string }, outputPath: string): Promise<void> {
  if (item.url) {
    const res = await fetch(item.url)
    if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`)
    const buffer = Buffer.from(await res.arrayBuffer())
    fs.writeFileSync(outputPath, buffer)
    return
  }
  if (item.b64_json) {
    fs.writeFileSync(outputPath, Buffer.from(item.b64_json, 'base64'))
    return
  }
  throw new Error('Image response contained neither url nor b64_json')
}

export async function generateSlideImage(
  prompt: string,
  opts: { vivid?: boolean; customStyle?: string; customStyleVivid?: string } = {},
): Promise<string> {
  const outputPath = path.join(TMP, `img-${uuid()}.png`)
  const style = opts.customStyle || STYLE
  const styleVivid = opts.customStyleVivid || STYLE_VIVID
  const fullPrompt = `${prompt}\n\n${opts.vivid ? styleVivid : style}`

  // Primary: gpt-image-1 (may return b64_json instead of url).
  // quality 'medium' — these are backgrounds behind text+scrim, so 'high'
  // (~35s/image) is wasted time & money; 'medium' is much faster and cheaper.
  try {
    const result = await client().images.generate({
      model: 'gpt-image-1',
      prompt: fullPrompt,
      size: '1024x1536',
      quality: 'medium',
      n: 1,
    })
    const item = result.data?.[0]
    if (!item) throw new Error('gpt-image-1 returned no image data')
    await saveImage(item, outputPath)
    return outputPath
  } catch (err) {
    // Fallback: dall-e-3 (standard quality for speed)
    const result = await client().images.generate({
      model: 'dall-e-3',
      prompt: fullPrompt,
      size: '1024x1792',
      quality: 'standard',
      n: 1,
    })
    const item = result.data?.[0]
    if (!item) throw new Error('dall-e-3 returned no image data')
    await saveImage(item, outputPath)
    return outputPath
  }
}
