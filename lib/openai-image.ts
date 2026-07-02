import OpenAI from 'openai'
import fs from 'fs'
import path from 'path'
import { v4 as uuid } from 'uuid'

const TMP = process.env.TMP_DIR || '/tmp'

// Lazy singleton — instantiating at module load breaks `next build` when the
// key is absent (the OpenAI SDK throws in its constructor).
let _client: OpenAI | null = null
function client(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _client
}

const STYLE = `Dark cinematic tech aesthetic. Black background (#0c0c0c). Dramatic single-source lighting. High quality digital art. Sharp details. Moody and atmospheric. No text, no words, no letters, no UI elements.`

// For the cover slide — bright, high-contrast, eye-catching (not dark).
const STYLE_VIVID = `Vivid, high-contrast, striking hero image. Bold vibrant colors, dramatic yet bright lighting, cinematic, eye-catching, professional, sharp. It should POP and stand out. No text, no words, no letters, no UI elements.`

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
  opts: { vivid?: boolean } = {},
): Promise<string> {
  const outputPath = path.join(TMP, `img-${uuid()}.png`)
  const fullPrompt = `${prompt}\n\n${opts.vivid ? STYLE_VIVID : STYLE}`

  // Primary: gpt-image-1 (may return b64_json instead of url)
  try {
    const result = await client().images.generate({
      model: 'gpt-image-1',
      prompt: fullPrompt,
      size: '1024x1536',
      n: 1,
    })
    const item = result.data?.[0]
    if (!item) throw new Error('gpt-image-1 returned no image data')
    await saveImage(item, outputPath)
    return outputPath
  } catch (err) {
    // Fallback: dall-e-3
    const result = await client().images.generate({
      model: 'dall-e-3',
      prompt: fullPrompt,
      size: '1024x1792',
      quality: 'hd',
      n: 1,
    })
    const item = result.data?.[0]
    if (!item) throw new Error('dall-e-3 returned no image data')
    await saveImage(item, outputPath)
    return outputPath
  }
}
