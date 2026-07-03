import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import { v4 as uuid } from 'uuid'

const TMP = process.env.TMP_DIR || '/tmp'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

function metaTag(html: string, prop: string): string | undefined {
  const a = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`,
    'i',
  )
  const b = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`,
    'i',
  )
  return (html.match(a)?.[1] || html.match(b)?.[1])?.trim()
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function downloadImage(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(12000) })
    if (!res.ok) return undefined
    const ct = res.headers.get('content-type') || ''
    if (!ct.startsWith('image/')) return undefined
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 1500) return undefined // skip tiny/placeholder images
    const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg'
    const p = path.join(TMP, `link-${uuid()}.${ext}`)
    fs.writeFileSync(p, buf)
    return p
  } catch {
    return undefined
  }
}

// yt-dlp metadata (no download): works for many platforms incl. X/IG/TikTok —
// gives title, description and a thumbnail even for some image posts.
function ytdlpMeta(url: string): Promise<{ title?: string; description?: string; thumbnail?: string }> {
  return new Promise((resolve) => {
    let out = ''
    const p = spawn('yt-dlp', ['--dump-json', '--no-playlist', '--no-warnings', url])
    p.stdout.on('data', (d) => (out += d.toString()))
    p.on('close', () => {
      try {
        const j = JSON.parse(out)
        resolve({ title: j.title, description: j.description, thumbnail: j.thumbnail })
      } catch {
        resolve({})
      }
    })
    p.on('error', () => resolve({}))
  })
}

// Fetch a link's main image + text so a pasted URL can become slide material.
export async function fetchLinkContent(
  url: string,
): Promise<{ title?: string; text?: string; imagePath?: string }> {
  const result: { title?: string; text?: string; imagePath?: string } = {}
  let imgUrl: string | undefined
  const social = /twitter\.com|x\.com|instagram\.com|tiktok\.com|facebook\.com|fb\.watch/.test(url)

  // A) Direct HTML scrape for OpenGraph tags + body text.
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA },
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
    })
    if (res.ok) {
      const html = await res.text()
      result.title = metaTag(html, 'og:title') || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim()
      const desc = metaTag(html, 'og:description') || metaTag(html, 'description')
      imgUrl =
        metaTag(html, 'og:image') ||
        metaTag(html, 'og:image:url') ||
        metaTag(html, 'og:image:secure_url') ||
        metaTag(html, 'twitter:image') ||
        metaTag(html, 'twitter:image:src')
      const body = stripTags(html).slice(0, 4000)
      result.text = [desc, body].filter(Boolean).join('\n').slice(0, 5000)
    }
  } catch {
    /* ignore */
  }

  // B) Social posts (or when no image/text found): try yt-dlp metadata.
  if (social || !imgUrl || !result.text || result.text.length < 120) {
    const m = await ytdlpMeta(url).catch(() => ({}) as any)
    if (m.title && !result.title) result.title = m.title
    if (m.description) result.text = [result.text, m.description].filter(Boolean).join('\n').slice(0, 5000)
    if (!imgUrl && m.thumbnail) imgUrl = m.thumbnail
  }

  if (imgUrl) {
    try {
      imgUrl = new URL(imgUrl, url).href
    } catch {
      /* keep as-is */
    }
    result.imagePath = await downloadImage(imgUrl)
  }
  return result
}
