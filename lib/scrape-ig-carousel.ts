import type { Page } from 'puppeteer-core'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

export async function scrapeIGCarousel(
  url: string
): Promise<Array<{ base64: string; mimeType: string }>> {
  const screenshots: Array<{ base64: string; mimeType: string }> = []

  try {
    const puppeteer = (await import('puppeteer-core')).default
    // @sparticuz/chromium provides the binary path via executablePath()
    const chromium = require('@sparticuz/chromium')

    const execPath = typeof chromium.executablePath === 'function'
      ? await chromium.executablePath()
      : chromium.default?.executablePath
        ? await chromium.default.executablePath()
        : undefined

    const browser = await puppeteer.launch({
      args: chromium.args || ['--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: execPath,
      headless: true,
    } as any)

    const page = await browser.newPage()
    await page.setUserAgent(UA)
    await page.setViewport({ width: 430, height: 932 })

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 25000 })
    await page.waitForSelector('article img', { timeout: 10000 }).catch(() => {})

    const maxSlides = 15
    let slideCount = 0

    while (slideCount < maxSlides) {
      await new Promise(r => setTimeout(r, 800))
      const article = await page.$('article')
      if (article) {
        const screenshotBuffer = await article.screenshot({ encoding: 'base64' }) as string
        screenshots.push({ base64: screenshotBuffer, mimeType: 'image/png' })
      }
      slideCount++

      const nextBtn = await page.$('button[aria-label="Next"]')
        || await page.$('button[aria-label="Berikutnya"]')
        || await page.$('div._aaqg._aaqh')
      
      if (!nextBtn) break
      try {
        await nextBtn.click()
        await new Promise(r => setTimeout(r, 600))
      } catch { break }
    }

    await browser.close()
  } catch (e) {
    console.error('[scrape-ig] Failed:', e)
  }

  return screenshots
}
