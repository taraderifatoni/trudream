import * as cheerio from 'cheerio'
import fs from 'fs'
import path from 'path'
import { v4 as uuid } from 'uuid'

const TMP = process.env.TMP_DIR || '/tmp'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

/** Puppeteer fallback for SPA/JS-rendered sites */
async function extractWithBrowser(url: string): Promise<string | null> {
  try {
    const puppeteer = (await import('puppeteer-core')).default
    // @sparticuz/chromium provides the binary path via executablePath()
    const chromium = require('@sparticuz/chromium')
    const execPath = typeof chromium.executablePath === 'function'
      ? await chromium.executablePath()
      : (typeof chromium.default?.executablePath === 'function'
        ? await chromium.default.executablePath()
        : undefined)
    
    const browser = await puppeteer.launch({
      args: chromium.args || ['--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: execPath,
      headless: true,
    } as any)
    const page = await browser.newPage()
    await page.setUserAgent(UA)
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 25000 })
    const html = await page.content()
    await browser.close()
    return html
  } catch (e) {
    console.error('Puppeteer extract failed:', e)
    return null
  }
}

/** Recursively extract image URLs from JSON-LD structured data */
function extractImagesFromJson(obj: any): string[] {
  const images: string[] = []
  if (!obj || typeof obj !== 'object') return images
  if (Array.isArray(obj)) {
    for (const item of obj) images.push(...extractImagesFromJson(item))
    return images
  }
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'image' || key === 'thumbnailUrl' || key === 'thumbnail') {
      if (typeof value === 'string') images.push(value)
      else if (typeof value === 'object' && (value as any)?.['@type'] === 'ImageObject' && (value as any).url) images.push((value as any).url)
    } else if (typeof value === 'object') {
      images.push(...extractImagesFromJson(value))
    }
  }
  return images
}

export interface ExtractedAsset {
  type: 'image' | 'video' | 'thumbnail'
  url: string
  localPath?: string
  width?: number
  height?: number
  caption?: string
  context?: string  // nearby heading/person name for smarter matching
  source: 'og:image' | 'article-img' | 'video-thumbnail' | 'video-clip' | 'webpage-image'
  priority: number
}

async function downloadImage(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) })
    if (!res.ok) return
    const ct = res.headers.get('content-type') || ''
    if (!ct.startsWith('image/')) return
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 3000) return // skip tiny/icons
    const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg'
    const p = path.join(TMP, `asset-${uuid()}.${ext}`)
    fs.writeFileSync(p, buf)
    return p
  } catch { return }
}

/** Extract images + metadata from a web article */
export async function extractFromWeb(url: string): Promise<ExtractedAsset[]> {
  const assets: ExtractedAsset[] = []
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(20000) })
    if (!res.ok) return assets
    const html = await res.text()
    const $ = cheerio.load(html)
    let priority = 1

    // 1. og:image (highest priority)
    const ogImg = $('meta[property="og:image"]').attr('content')
      || $('meta[property="og:image:url"]').attr('content')
      || $('meta[property="og:image:secure_url"]').attr('content')
      || $('meta[name="twitter:image"]').attr('content')
      || $('meta[name="twitter:image:src"]').attr('content')
    if (ogImg) {
      const fullUrl = new URL(ogImg, url).href
      const local = await downloadImage(fullUrl)
      assets.push({ type: 'image', url: fullUrl, localPath: local, caption: $('meta[property="og:title"]').attr('content') || undefined, source: 'og:image', priority: priority++ })
    }

    // 2. JSON-LD structured data (many news sites embed images here)
    try {
      $('script[type="application/ld+json"]').each((_, el) => {
        const text = $(el).html()
        if (!text) return
        try {
          const json = JSON.parse(text)
          const images = extractImagesFromJson(json)
          for (const img of images) {
            if (!img || img.startsWith('data:')) continue
            const fullUrl = new URL(img, url).href
            if (assets.some(a => a.url === fullUrl)) continue
            assets.push({ type: 'image', url: fullUrl, source: 'og:image', priority: priority++ })
          }
        } catch { /* invalid JSON */ }
      })
    } catch { /* no JSON-LD */ }

    // 3. Article images with broader selectors
    const containers = ['article', 'main', '[class*="content"]', '[class*="article"]', '[class*="post"]', '[class*="story"]', '.entry-content', '.post-content', '[data-component="text-block"]', '.bbc-1cvxiy9', '.gel-layout__item']
    let found = 0
    for (const sel of containers) {
      // Direct <img> tags
      $(sel).find('img').each((_, el) => {
        if (found > 10) return false
        let src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src')
        // Try srcset
        if (!src || src.startsWith('data:')) {
          const srcset = $(el).attr('srcset')
          if (srcset) {
            const candidates = srcset.split(',').map(s => s.trim().split(' ')[0])
            src = candidates[candidates.length - 1] // largest image
          }
        }
        if (!src || src.startsWith('data:') || src.includes('avatar') || src.includes('icon') || src.includes('pixel') || src.includes('1x1')) return
        if (src.includes('//')) src = 'https:' + src.replace(/^https?:/, '')
        const fullUrl = new URL(src, url).href
        const alt = $(el).attr('alt') || ''
        // Capture context from nearby elements (caption, heading, strong text)
        let ctx = alt
        const figcaption = $(el).closest('figure').find('figcaption').text().trim()
        if (figcaption) ctx = figcaption
        if (!ctx) {
          const prevH = $(el).closest('div,section,article').prevAll('h2,h3,h4,strong').first().text().trim()
          if (prevH && prevH.length < 80) ctx = prevH
        }
        if (!ctx) {
          const nextP = $(el).closest('figure,div').next('p').text().trim()
          if (nextP && nextP.length < 120) ctx = nextP
        }
        if (assets.some(a => a.url === fullUrl)) return
        assets.push({ type: 'image', url: fullUrl, caption: alt, context: ctx || undefined, source: 'article-img', priority: priority++, width: parseInt($(el).attr('width') || '0') || undefined, height: parseInt($(el).attr('height') || '0') || undefined })
        found++
      })
      // <figure> > <img>, <picture> > <source> / <img>
      $(sel).find('figure img, picture img, figure source[srcset]').each((_, el) => {
        if (found > 10) return false
        let src = $(el).attr('src') || $(el).attr('data-src')
        if (!src || src.startsWith('data:')) {
          const srcset = $(el).attr('srcset')
          if (srcset) {
            const candidates = srcset.split(',').map(s => s.trim().split(' ')[0])
            src = candidates[candidates.length - 1]
          }
        }
        if (!src || src.startsWith('data:')) return
        if (src.includes('//')) src = 'https:' + src.replace(/^https?:/, '')
        const fullUrl = new URL(src, url).href
        if (assets.some(a => a.url === fullUrl)) return
        assets.push({ type: 'image', url: fullUrl, source: 'article-img', priority: priority++ })
        found++
      })
      if (found > 5) break
    }

    // 4. Fallback: all page images (wider net)
    if (found === 0) {
      $('img').each((_, el) => {
        if (assets.length > 12) return false
        let src = $(el).attr('src') || $(el).attr('data-src')
        if (!src || src.startsWith('data:') || src.includes('1x1')) return
        if (src.includes('//')) src = 'https:' + src.replace(/^https?:/, '')
        const fullUrl = new URL(src, url).href
        if (assets.some(a => a.url === fullUrl)) return
        assets.push({ type: 'image', url: fullUrl, source: 'webpage-image', priority: priority++ })
      })
    }

    // Download top assets
    const topAssets = assets.filter(a => a.priority <= 8)
    for (const a of topAssets) {
      if (!a.localPath) a.localPath = await downloadImage(a.url)
    }

    // Fallback: if cheerio got ≤1 useful asset, try Puppeteer for SPA sites
    const usefulAssets = assets.filter(a => a.source !== 'webpage-image' || a.caption)
    if (usefulAssets.length <= 1) {
      console.log('[extractor] Few assets from static HTML, trying Puppeteer...')
      const browserHtml = await extractWithBrowser(url)
      if (browserHtml && browserHtml.length > 10000) {
        const $b = cheerio.load(browserHtml)
        // Retry og:image from browser HTML
        const ogImgB = $b('meta[property="og:image"]').attr('content')
          || $b('meta[name="twitter:image"]').attr('content')
        if (ogImgB && !assets.some(a => a.url === ogImgB)) {
          const fullUrl = new URL(ogImgB, url).href
          const local = await downloadImage(fullUrl)
          assets.push({ type: 'image', url: fullUrl, localPath: local, caption: $b('meta[property="og:title"]').attr('content') || undefined, source: 'og:image', priority: 1 })
        }
        // Extract article images from browser-rendered HTML
        $b('article img, main img, [class*="content"] img, figure img, picture img').each((_, el) => {
          if (assets.length > 12) return false
          const src = $b(el).attr('src') || $b(el).attr('data-src') || ''
          if (!src || src.startsWith('data:')) return
          const fullUrl = new URL(src, url).href
          if (assets.some(a => a.url === fullUrl)) return
          const caption = $b(el).attr('alt') || ''
          assets.push({ type: 'image', url: fullUrl, caption, source: 'article-img', priority: priority++ })
        })
        // Re-download top assets
        const top2 = assets.filter(a => a.priority <= 6)
        for (const a of top2) {
          if (!a.localPath) a.localPath = await downloadImage(a.url)
        }
        console.log('[extractor] Puppeteer added', assets.length - usefulAssets.length, 'more assets')
      }
    }
  } catch { /* extraction failed is non-fatal */ }
  return assets
}

/** Extract assets from any URL — auto-detect type */
export async function extractAssets(url: string): Promise<ExtractedAsset[]> {
  // Check for video platforms — these need yt-dlp (handled by separate flow)
  const isVideoPlatform = /youtube\.com|youtu\.be|tiktok\.com|instagram\.com|x\.com|twitter\.com/.test(url)
  if (isVideoPlatform) {
    // For video platforms, we primarily get content from the existing yt-dlp flow
    // This extractor returns what we can scrape from the page
    return extractFromWeb(url)
  }
  return extractFromWeb(url)
}
