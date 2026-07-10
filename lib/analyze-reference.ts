import fs from 'fs'
import path from 'path'
import { v4 as uuid } from 'uuid'
import { GoogleGenerativeAI } from '@google/generative-ai'

const TMP = process.env.TMP_DIR || '/tmp'

export interface ReferenceAnalysis {
  slideCount: number
  slides: Array<{
    index: number
    type: string
    layout: string
    textPosition: string
    imagePosition: string
    colorScheme: string
    textStyle: string
    composition: string
  }>
  overallStyle: string
  overallLayout: string
}

/**
 * Analyze reference carousel screenshots using Gemini Vision.
 * Extracts layout, composition, and style patterns.
 */
export async function analyzeReferenceSlides(
  images: Array<{ base64: string; mimeType: string }>,
): Promise<ReferenceAnalysis | null> {
  const keys = [
    process.env.GEMINI_API_KEY!,
    process.env.GEMINI_API_KEY_2 || '',
    process.env.GEMINI_API_KEY_3 || '',
  ].filter(Boolean)

  if (keys.length === 0) { console.error('No Gemini keys'); return null }

  let lastError: any = null
  for (const key of keys) {
    try {
      const genAI = new GoogleGenerativeAI(key)
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

      const parts: any[] = [
        { text: `Analyze these carousel slides from a reference Instagram post. For EACH slide, describe:
1. type: what kind of slide (cover/intro, bullet list, stat/data, grid/multi-card, quote, cta/closing, comparison, timeline, tutorial step, before-after, other)
2. layout: how elements are arranged (e.g. "image top 60% + text bottom 40% on solid color", "full-bleed image with text overlay", "two-column grid", "single large number centered", "image left + text right")
3. textPosition: where text sits (e.g. "bottom third centered", "top left", "centered middle")
4. imagePosition: where images sit (e.g. "full background", "top half", "left column", "none")
5. colorScheme: dominant colors used
6. textStyle: font style observed (e.g. "bold sans-serif headings", "serif body", "all-caps labels")
7. composition: overall visual feel (e.g. "minimal with lots of whitespace", "dense with overlapping elements", "editorial magazine")

Also describe overallStyle and overallLayout for the entire carousel.

Respond ONLY with raw JSON:
{
  "slideCount": N,
  "slides": [
    { "index": 0, "type": "...", "layout": "...", "textPosition": "...", "imagePosition": "...", "colorScheme": "...", "textStyle": "...", "composition": "..." }
  ],
  "overallStyle": "...",
  "overallLayout": "..."
}` },
      ]

      for (const img of images) {
        parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } })
      }

      const result = await model.generateContent(parts)
      let raw = result.response.text().trim()
      raw = raw.replace(/```json|```/gi, '').trim()
      const f = raw.indexOf('{'), l = raw.lastIndexOf('}')
      if (f < 0 || l < 0) throw new Error('No JSON in response')
      raw = raw.substring(f, l + 1)

      const parsed = JSON.parse(raw)
      parsed.slideCount = parsed.slides?.length || 0
      return parsed as ReferenceAnalysis
    } catch (e: any) {
      lastError = e
      // Try next key
      if (String(e.message).includes('429') || String(e.message).includes('503')) continue
      throw e
    }
  }

  console.error('Reference analysis failed with all keys:', lastError?.message)
  return null
}
