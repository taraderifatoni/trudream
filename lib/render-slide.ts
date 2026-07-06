import fs from 'fs'
import path from 'path'
import { v4 as uuid } from 'uuid'
import {
  createCanvas,
  loadImage,
  GlobalFonts,
  type SKRSContext2D,
  type Image,
} from '@napi-rs/canvas'
import { SlideContent } from './types'

// ─── Constants ──────────────────────────────────────────────────────────────

const TMP = process.env.TMP_DIR || '/tmp'

const W = 1080
const H = 1350

const PAD_X = 84
const PAD_TOP = 96
const PAD_BOTTOM = 110

const COLORS = {
  bg: '#09090B', // dark base (used when there is no AI image)
  accent: '#CDF22B', // arcade neon lime
  accent2: '#1E45FB', // arcade blue
  white: '#ffffff',
  muted: '#e2e2e2',
  dim: '#cfcfcf',
}

const FONT_PIXEL = 'Press Start 2P' // headings / short punchy text
const FONT_BODY = 'VT323' // long / readable text
const FONT = FONT_BODY

// Font weight keywords selected via ctx.font
const WEIGHT = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const

// ─── Font registration (module-level, run once) ─────────────────────────────

let fontsRegistered = false

function registerFonts() {
  if (fontsRegistered) return
  fontsRegistered = true

  const files: [string, string][] = [
    ['PressStart2P-Regular.ttf', FONT_PIXEL],
    ['VT323-Regular.ttf', FONT_BODY],
  ]

  for (const [file, family] of files) {
    try {
      const p = path.join(process.cwd(), 'fonts', file)
      if (fs.existsSync(p)) GlobalFonts.registerFromPath(p, family)
    } catch {
      // Fall back silently — canvas uses a default face if a file is missing.
    }
  }
}

// ─── Text helpers ───────────────────────────────────────────────────────────

function font(weight: string, size: number, family: string = FONT): string {
  return `${weight} ${Math.round(size)}px "${family}"`
}

/** Split a single word that is wider than maxWidth into hard character chunks. */
function hardBreakWord(ctx: SKRSContext2D, word: string, maxWidth: number): string[] {
  const chunks: string[] = []
  let cur = ''
  for (const ch of word) {
    const cand = cur + ch
    if (ctx.measureText(cand).width > maxWidth && cur) {
      chunks.push(cur)
      cur = ch
    } else {
      cur = cand
    }
  }
  if (cur) chunks.push(cur)
  return chunks
}

/** Break `text` into lines that each fit within `maxWidth` at the current ctx.font. */
function wrapText(ctx: SKRSContext2D, text: string, maxWidth: number): string[] {
  const words = String(text ?? '').split(/\s+/).filter(Boolean)
  if (words.length === 0) return ['']

  const lines: string[] = []
  let current = ''

  for (const word of words) {
    // A word wider than the line (common with the wide pixel font) is hard-broken.
    if (ctx.measureText(word).width > maxWidth) {
      if (current) {
        lines.push(current)
        current = ''
      }
      const pieces = hardBreakWord(ctx, word, maxWidth)
      for (let i = 0; i < pieces.length - 1; i++) lines.push(pieces[i])
      current = pieces[pieces.length - 1] || ''
      continue
    }
    const candidate = current ? `${current} ${word}` : word
    if (ctx.measureText(candidate).width <= maxWidth || !current) {
      current = candidate
    } else {
      lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines
}

/**
 * Wrap `text` and shrink the font size until the wrapped block fits within
 * `maxHeight`. Returns the chosen size plus the resulting lines.
 */
function fitText(
  ctx: SKRSContext2D,
  text: string,
  opts: {
    weight: string
    startSize: number
    minSize: number
    maxWidth: number
    maxHeight: number
    lineHeightRatio: number
    family?: string
  },
): { size: number; lines: string[]; lineHeight: number } {
  const family = opts.family ?? FONT
  let size = opts.startSize
  while (size > opts.minSize) {
    ctx.font = font(opts.weight, size, family)
    const lines = wrapText(ctx, text, opts.maxWidth)
    const lineHeight = size * opts.lineHeightRatio
    if (lines.length * lineHeight <= opts.maxHeight) {
      return { size, lines, lineHeight }
    }
    size -= 2
  }
  ctx.font = font(opts.weight, opts.minSize, family)
  const lines = wrapText(ctx, text, opts.maxWidth)
  return { size: opts.minSize, lines, lineHeight: opts.minSize * opts.lineHeightRatio }
}

/** Draw already-wrapped lines from a top baseline. Returns the y after the block. */
function drawLines(
  ctx: SKRSContext2D,
  lines: string[],
  x: number,
  yTop: number,
  lineHeight: number,
  align: CanvasTextAlign = 'left',
): number {
  ctx.textAlign = align
  ctx.textBaseline = 'alphabetic'
  let y = yTop + lineHeight * 0.8 // approximate baseline offset within first line
  for (const line of lines) {
    ctx.fillText(line, x, y)
    y += lineHeight
  }
  return yTop + lines.length * lineHeight
}

function roundRectPath(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

// ─── Background ─────────────────────────────────────────────────────────────

async function drawBackground(
  ctx: SKRSContext2D,
  slide: SlideContent,
  opts: { light?: boolean } = {},
) {
  let img: Image | null = null
  if (slide.imagePath && fs.existsSync(slide.imagePath)) {
    try {
      img = await loadImage(slide.imagePath)
    } catch {
      img = null
    }
  }

  if (img) {
    // Cover: scale to fill, center-crop.
    const scale = Math.max(W / img.width, H / img.height)
    const dw = img.width * scale
    const dh = img.height * scale
    const dx = (W - dw) / 2
    const dy = (H - dh) / 2
    ctx.drawImage(img, dx, dy, dw, dh)

    // Light mode (cover): keep the image vivid & contrasty — only a bottom
    // gradient behind the lower-third title, no full-canvas darkening.
    if (opts.light) {
      const start = H * 0.48
      const g = ctx.createLinearGradient(0, start, 0, H)
      g.addColorStop(0, 'rgba(8,8,10,0)')
      g.addColorStop(0.55, 'rgba(8,8,10,0.55)')
      g.addColorStop(1, 'rgba(8,8,10,0.92)')
      ctx.fillStyle = g
      ctx.fillRect(0, start, W, H - start)
    } else {
      // Full-canvas darkening scrim for legibility (only on real images).
      ctx.fillStyle = 'rgba(10,10,10,0.55)'
      ctx.fillRect(0, 0, W, H)

      // Stronger bottom gradient (bottom 45%).
      const bottomStart = H * 0.55
      const bottomGrad = ctx.createLinearGradient(0, bottomStart, 0, H)
      bottomGrad.addColorStop(0, 'rgba(10,10,10,0)')
      bottomGrad.addColorStop(1, 'rgba(10,10,10,0.92)')
      ctx.fillStyle = bottomGrad
      ctx.fillRect(0, bottomStart, W, H - bottomStart)

      // Subtle top gradient (top 25%).
      const topEnd = H * 0.25
      const topGrad = ctx.createLinearGradient(0, 0, 0, topEnd)
      topGrad.addColorStop(0, 'rgba(10,10,10,0.6)')
      topGrad.addColorStop(1, 'rgba(10,10,10,0)')
      ctx.fillStyle = topGrad
      ctx.fillRect(0, 0, W, topEnd)
    }
    return
  }

  // No image — bright blue arcade backdrop (dominant colour, no scrim).
  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, W, H)
}

// ─── Header (tag pill) ──────────────────────────────────────────────────────

/** Draws the tag pill at top-left and returns the y where content may begin. */
// Tag pill removed per request — no header label is drawn. Content starts
// from the top padding.
function drawHeader(_ctx: SKRSContext2D, _tag: string): number {
  return PAD_TOP
}

// ─── Footer ─────────────────────────────────────────────────────────────────

// Footer handle is only drawn on the first slide (per request); page numbers
// removed. The last (CTA) slide shows "Follow @handle" in its body instead.
function drawFooter(ctx: SKRSContext2D, handle: string, showHandle: boolean) {
  if (!showHandle || !handle) return
  const y = H - PAD_BOTTOM + 40
  ctx.font = font(WEIGHT.semibold, 18, FONT_PIXEL)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = COLORS.accent
  ctx.fillText(handle, PAD_X, y)
}

// ─── Layout: content area helpers ───────────────────────────────────────────

const CONTENT_W = W - PAD_X * 2

// Vertical band available for body content (below header, above footer).
function contentBounds(headerBottom: number) {
  const top = headerBottom + 60
  const bottom = H - PAD_BOTTOM - 30
  return { top, bottom, height: bottom - top }
}

// ─── Per-type renderers ─────────────────────────────────────────────────────

function renderCover(ctx: SKRSContext2D, slide: SlideContent, headerBottom: number) {
  const { bottom } = contentBounds(headerBottom)

  // Subtitle first (measured to reserve room below the title block).
  let subtitleBlock: { lines: string[]; size: number; lineHeight: number } | null = null
  if (slide.subtitle) {
    ctx.font = font(WEIGHT.medium, 48)
    const lines = wrapText(ctx, slide.subtitle, CONTENT_W)
    subtitleBlock = { lines, size: 48, lineHeight: 48 * 1.15 }
  }

  const subtitleH = subtitleBlock
    ? subtitleBlock.lines.length * subtitleBlock.lineHeight + 34
    : 0

  // Title — big pixel arcade type, lower-third emphasis, auto-shrink.
  const title = slide.title || ''
  const titleMaxH = bottom - (headerBottom + 60) - subtitleH
  const fitted = fitText(ctx, title, {
    weight: WEIGHT.bold,
    startSize: 60,
    minSize: 22,
    maxWidth: CONTENT_W,
    maxHeight: Math.max(titleMaxH, 120),
    lineHeightRatio: 1.32,
    family: FONT_PIXEL,
  })

  const totalBlockH = fitted.lines.length * fitted.lineHeight + subtitleH
  // Anchor block to the lower third: place its bottom near `bottom`.
  const blockTop = Math.max(headerBottom + 60, bottom - totalBlockH)

  ctx.fillStyle = COLORS.accent
  ctx.font = font(WEIGHT.bold, fitted.size, FONT_PIXEL)
  const afterTitle = drawLines(ctx, fitted.lines, PAD_X, blockTop, fitted.lineHeight, 'left')

  if (subtitleBlock) {
    ctx.fillStyle = COLORS.white
    ctx.font = font(WEIGHT.medium, subtitleBlock.size)
    drawLines(ctx, subtitleBlock.lines, PAD_X, afterTitle + 34, subtitleBlock.lineHeight, 'left')
  }
}

function renderBullets(ctx: SKRSContext2D, slide: SlideContent, headerBottom: number) {
  const { top, bottom } = contentBounds(headerBottom)

  // Title at top.
  let y = top
  if (slide.title) {
    const fitted = fitText(ctx, slide.title, {
      weight: WEIGHT.bold,
      startSize: 40,
      minSize: 20,
      maxWidth: CONTENT_W,
      maxHeight: 300,
      lineHeightRatio: 1.3,
      family: FONT_PIXEL,
    })
    ctx.fillStyle = COLORS.accent
    ctx.font = font(WEIGHT.bold, fitted.size, FONT_PIXEL)
    y = drawLines(ctx, fitted.lines, PAD_X, y, fitted.lineHeight, 'left') + 56
  }

  const bullets = slide.bullets || []
  if (bullets.length === 0) return

  const markX = PAD_X
  const textX = PAD_X + 44 // hanging indent
  const textMaxW = CONTENT_W - 44

  // Choose a bullet font size that lets everything fit.
  let bulletSize = 50
  const measure = (size: number) => {
    ctx.font = font(WEIGHT.medium, size)
    const lh = size * 1.15
    let total = 0
    for (const b of bullets) {
      const lines = wrapText(ctx, b, textMaxW)
      total += lines.length * lh + size * 0.7 // row gap
    }
    return total
  }
  while (bulletSize > 32 && y + measure(bulletSize) > bottom) {
    bulletSize -= 2
  }

  const lineHeight = bulletSize * 1.15
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  for (const b of bullets) {
    ctx.font = font(WEIGHT.medium, bulletSize)
    const lines = wrapText(ctx, b, textMaxW)
    const rowTop = y

    // Accent bullet mark — a neon square block (arcade pixel style).
    ctx.fillStyle = COLORS.accent
    const dotR = Math.max(6, bulletSize * 0.16)
    ctx.fillRect(markX, rowTop + lineHeight * 0.5 - dotR, dotR * 2, dotR * 2)

    // Bullet text (white, hanging indent).
    ctx.fillStyle = COLORS.white
    ctx.font = font(WEIGHT.medium, bulletSize)
    drawLines(ctx, lines, textX, rowTop, lineHeight, 'left')

    y = rowTop + lines.length * lineHeight + bulletSize * 0.7
    if (y > bottom) break
  }
}

function renderStat(ctx: SKRSContext2D, slide: SlideContent, headerBottom: number) {
  const { top, bottom, height } = contentBounds(headerBottom)
  const stats = slide.stats || []
  if (stats.length === 0) return

  const cx = W / 2
  const valueSize = stats.length > 2 ? 72 : 96
  const labelSize = 52
  const blockGap = 56

  // Pre-measure to center vertically.
  ctx.textAlign = 'center'
  const blocks = stats.map((s) => {
    ctx.font = font(WEIGHT.medium, labelSize)
    const labelLines = wrapText(ctx, s.label, CONTENT_W)
    const h = valueSize * 1.25 + 22 + labelLines.length * labelSize * 1.15
    return { s, labelLines, h }
  })
  const totalH = blocks.reduce((a, b) => a + b.h, 0) + blockGap * (blocks.length - 1)
  let y = top + Math.max(0, (height - totalH) / 2)

  for (const block of blocks) {
    // Value — huge pixel accent.
    ctx.fillStyle = COLORS.accent
    ctx.font = font(WEIGHT.bold, valueSize, FONT_PIXEL)
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(block.s.value, cx, y + valueSize * 0.9)
    y += valueSize * 1.25 + 22

    // Label — white body.
    ctx.fillStyle = COLORS.white
    ctx.font = font(WEIGHT.medium, labelSize)
    y = drawLines(ctx, block.labelLines, cx, y, labelSize * 1.15, 'center')
    y += blockGap

    if (y > bottom) break
  }
}

function renderGrid4(ctx: SKRSContext2D, slide: SlideContent, headerBottom: number) {
  const { top, bottom } = contentBounds(headerBottom)

  let y = top
  if (slide.title) {
    const fitted = fitText(ctx, slide.title, {
      weight: WEIGHT.bold,
      startSize: 34,
      minSize: 18,
      maxWidth: CONTENT_W,
      maxHeight: 220,
      lineHeightRatio: 1.3,
      family: FONT_PIXEL,
    })
    ctx.fillStyle = COLORS.accent
    ctx.font = font(WEIGHT.bold, fitted.size, FONT_PIXEL)
    y = drawLines(ctx, fitted.lines, PAD_X, y, fitted.lineHeight, 'left') + 50
  }

  const cards = (slide.cards || []).slice(0, 4)
  if (cards.length === 0) return

  const colGap = 40
  const rowGap = 44
  const cellW = (CONTENT_W - colGap) / 2
  const gridTop = y
  const gridH = bottom - gridTop
  const cellH = (gridH - rowGap) / 2

  // Neon separators between rows/cols (arcade grid).
  ctx.strokeStyle = 'rgba(205,242,43,0.35)'
  ctx.lineWidth = 2
  // Vertical divider.
  const midX = PAD_X + cellW + colGap / 2
  ctx.beginPath()
  ctx.moveTo(midX, gridTop)
  ctx.lineTo(midX, gridTop + gridH)
  ctx.stroke()
  // Horizontal divider (only if >2 cards).
  if (cards.length > 2) {
    const midY = gridTop + cellH + rowGap / 2
    ctx.beginPath()
    ctx.moveTo(PAD_X, midY)
    ctx.lineTo(PAD_X + CONTENT_W, midY)
    ctx.stroke()
  }

  cards.forEach((card, i) => {
    const col = i % 2
    const row = Math.floor(i / 2)
    const cellX = PAD_X + col * (cellW + colGap)
    const cellY = gridTop + row * (cellH + rowGap)
    const innerW = cellW - 8

    let cy = cellY

    // Number — pixel accent.
    ctx.fillStyle = COLORS.accent
    ctx.font = font(WEIGHT.bold, 26, FONT_PIXEL)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(card.num || '', cellX, cy + 26)
    cy += 26 + 22

    // Title — body.
    ctx.fillStyle = COLORS.white
    ctx.font = font(WEIGHT.semibold, 40)
    const titleLines = wrapText(ctx, card.title || '', innerW).slice(0, 2)
    cy = drawLines(ctx, titleLines, cellX, cy, 40 * 1.12, 'left') + 10

    // Description — body.
    ctx.fillStyle = COLORS.muted
    ctx.font = font(WEIGHT.regular, 32)
    const descMaxLines = Math.max(1, Math.floor((cellY + cellH - cy) / (32 * 1.15)))
    const descLines = wrapText(ctx, card.desc || '', innerW).slice(0, descMaxLines)
    drawLines(ctx, descLines, cellX, cy, 32 * 1.15, 'left')
  })
}

function renderQuote(ctx: SKRSContext2D, slide: SlideContent, headerBottom: number) {
  const { top, bottom, height } = contentBounds(headerBottom)
  const cx = W / 2
  const maxW = CONTENT_W - 40

  // Big leading quote glyph.
  const glyphSize = 200
  ctx.fillStyle = COLORS.accent
  ctx.font = font(WEIGHT.bold, glyphSize)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'

  // Quote text, auto-fit (body font for readability).
  const fitted = fitText(ctx, slide.quote || '', {
    weight: WEIGHT.semibold,
    startSize: 66,
    minSize: 42,
    maxWidth: maxW,
    maxHeight: height - 260,
    lineHeightRatio: 1.2,
  })

  let sourceLines: string[] = []
  if (slide.source) {
    ctx.font = font(WEIGHT.medium, 44)
    sourceLines = wrapText(ctx, slide.source, maxW)
  }

  const quoteH = fitted.lines.length * fitted.lineHeight
  const sourceH = sourceLines.length ? sourceLines.length * 44 * 1.2 + 44 : 0
  const glyphH = glyphSize * 0.5
  const totalH = glyphH + 20 + quoteH + sourceH
  let y = top + Math.max(0, (height - totalH) / 2)

  // Glyph.
  ctx.fillStyle = COLORS.accent
  ctx.font = font(WEIGHT.bold, glyphSize)
  ctx.fillText('“', cx, y + glyphSize * 0.72)
  y += glyphH + 20

  // Quote.
  ctx.fillStyle = COLORS.white
  ctx.font = font(WEIGHT.semibold, fitted.size)
  y = drawLines(ctx, fitted.lines, cx, y, fitted.lineHeight, 'center')

  // Source.
  if (sourceLines.length) {
    y += 44
    ctx.fillStyle = COLORS.accent
    ctx.font = font(WEIGHT.medium, 44)
    drawLines(ctx, sourceLines, cx, y, 44 * 1.2, 'center')
  }

  void bottom
}

function renderCta(
  ctx: SKRSContext2D,
  slide: SlideContent,
  headerBottom: number,
  handle: string,
) {
  const { top, height } = contentBounds(headerBottom)
  const cx = W / 2

  const fitted = fitText(ctx, slide.text || '', {
    weight: WEIGHT.bold,
    startSize: 46,
    minSize: 22,
    maxWidth: CONTENT_W,
    maxHeight: height - 200,
    lineHeightRatio: 1.3,
    family: FONT_PIXEL,
  })

  const handleSize = 26

  ctx.font = font(WEIGHT.semibold, handleSize, FONT_PIXEL)
  const handleH = handleSize * 1.3

  const textH = fitted.lines.length * fitted.lineHeight
  const totalH = textH + 60 + handleH
  let y = top + Math.max(0, (height - totalH) / 2)

  // Main punchy line — pixel accent.
  ctx.fillStyle = COLORS.accent
  ctx.font = font(WEIGHT.bold, fitted.size, FONT_PIXEL)
  y = drawLines(ctx, fitted.lines, cx, y, fitted.lineHeight, 'center')
  y += 60

  // "Follow @handle" — the last slide's only branding.
  ctx.fillStyle = COLORS.white
  ctx.font = font(WEIGHT.semibold, handleSize, FONT_PIXEL)
  ctx.textAlign = 'center'
  ctx.fillText(`Follow ${handle || ''}`.trim(), cx, y + handleSize * 0.85)
}

function renderFallback(ctx: SKRSContext2D, slide: SlideContent, headerBottom: number) {
  const { top, height } = contentBounds(headerBottom)
  const text = slide.title || slide.text || slide.tag || ''
  const fitted = fitText(ctx, text, {
    weight: WEIGHT.bold,
    startSize: 48,
    minSize: 20,
    maxWidth: CONTENT_W,
    maxHeight: height,
    lineHeightRatio: 1.3,
    family: FONT_PIXEL,
  })
  const blockH = fitted.lines.length * fitted.lineHeight
  const y = top + Math.max(0, (height - blockH) / 2)
  ctx.fillStyle = COLORS.accent
  ctx.font = font(WEIGHT.bold, fitted.size, FONT_PIXEL)
  drawLines(ctx, fitted.lines, W / 2, y, fitted.lineHeight, 'center')
}

// ─── Public entrypoint ──────────────────────────────────────────────────────

export async function renderSlide(
  slide: SlideContent,
  opts: { index: number; total: number; handle: string },
): Promise<string> {
  registerFonts()

  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d') as unknown as SKRSContext2D

  const isFirst = opts.index === 0
  const isLast = opts.index === opts.total - 1

  // 1. Background image + scrims. Cover stays vivid/high-contrast (light scrim).
  await drawBackground(ctx, slide, { light: slide.type === 'cover' })

  // 2. Header tag pill (removed — no-op).
  const headerBottom = drawHeader(ctx, slide.tag)

  // 3. Body per slide type.
  switch (slide.type) {
    case 'cover':
      renderCover(ctx, slide, headerBottom)
      break
    case 'bullets':
      renderBullets(ctx, slide, headerBottom)
      break
    case 'stat':
      renderStat(ctx, slide, headerBottom)
      break
    case 'grid4':
      renderGrid4(ctx, slide, headerBottom)
      break
    case 'quote':
      renderQuote(ctx, slide, headerBottom)
      break
    case 'cta':
      renderCta(ctx, slide, headerBottom, opts.handle)
      break
    default:
      renderFallback(ctx, slide, headerBottom)
      break
  }

  // 4. Footer handle — first slide only (last slide brands via CTA body).
  drawFooter(ctx, opts.handle, isFirst && !isLast)

  // 5. Encode and write.
  const outputPath = path.join(TMP, `slide-${uuid()}.png`)
  const png = canvas.toBuffer('image/png')
  fs.writeFileSync(outputPath, png)
  return outputPath
}

// Transparent 1080x1350 overlay (short caption at top) to burn onto the video
// carousel slide with ffmpeg. Text sits over a soft top scrim; the rest is
// transparent so the video shows through.
export async function renderVideoOverlay(
  text: string,
  opts: { handle?: string } = {},
): Promise<string> {
  registerFonts()
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d') as unknown as SKRSContext2D

  // Soft top scrim for legibility (transparent elsewhere).
  const topEnd = H * 0.36
  const g = ctx.createLinearGradient(0, 0, 0, topEnd)
  g.addColorStop(0, 'rgba(8,8,10,0.88)')
  g.addColorStop(0.7, 'rgba(8,8,10,0.5)')
  g.addColorStop(1, 'rgba(8,8,10,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, topEnd)

  // Caption heading near the top — pixel accent.
  const fitted = fitText(ctx, text || '', {
    weight: WEIGHT.bold,
    startSize: 34,
    minSize: 18,
    maxWidth: CONTENT_W,
    maxHeight: 280,
    lineHeightRatio: 1.3,
    family: FONT_PIXEL,
  })
  ctx.fillStyle = COLORS.accent
  ctx.font = font(WEIGHT.bold, fitted.size, FONT_PIXEL)
  drawLines(ctx, fitted.lines, PAD_X, PAD_TOP + 6, fitted.lineHeight, 'left')

  const outputPath = path.join(TMP, `voverlay-${uuid()}.png`)
  fs.writeFileSync(outputPath, canvas.toBuffer('image/png'))
  return outputPath
}

// A slide that embeds the user's uploaded image/screenshot in a rounded frame
// (fitted whole, not cropped) with a short explanation above it.
export async function renderScreenshotSlide(
  imagePath: string,
  text: string,
): Promise<string> {
  registerFonts()
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d') as unknown as SKRSContext2D

  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, W, H)

  // Explanation heading at the top.
  const top = 110
  let textBottom = top
  if (text) {
    const fitted = fitText(ctx, text, {
      weight: WEIGHT.bold,
      startSize: 32,
      minSize: 18,
      maxWidth: CONTENT_W,
      maxHeight: 240,
      lineHeightRatio: 1.3,
      family: FONT_PIXEL,
    })
    ctx.fillStyle = COLORS.accent
    ctx.font = font(WEIGHT.bold, fitted.size, FONT_PIXEL)
    textBottom = drawLines(ctx, fitted.lines, PAD_X, top, fitted.lineHeight, 'left')
  }

  // Framed screenshot below the text (contained, never cropped).
  const cardTop = textBottom + 56
  const cardBottom = H - 110
  const boxX = PAD_X
  const boxW = CONTENT_W
  const boxH = Math.max(200, cardBottom - cardTop)

  try {
    const img = await loadImage(imagePath)
    const s = Math.min(boxW / img.width, boxH / img.height)
    const dw = img.width * s
    const dh = img.height * s
    const dx = boxX + (boxW - dw) / 2
    const dy = cardTop + (boxH - dh) / 2

    // Card backing behind the image.
    ctx.fillStyle = '#111111'
    roundRectPath(ctx, dx - 16, dy - 16, dw + 32, dh + 32, 8)
    ctx.fill()

    // Rounded-clipped image.
    ctx.save()
    roundRectPath(ctx, dx, dy, dw, dh, 4)
    ctx.clip()
    ctx.drawImage(img, dx, dy, dw, dh)
    ctx.restore()

    // Neon arcade border.
    ctx.strokeStyle = COLORS.accent
    ctx.lineWidth = 4
    roundRectPath(ctx, dx, dy, dw, dh, 4)
    ctx.stroke()
  } catch {
    /* if the upload can't be read, just leave the dark slide with the text */
  }

  const outputPath = path.join(TMP, `slide-${uuid()}.png`)
  fs.writeFileSync(outputPath, canvas.toBuffer('image/png'))
  return outputPath
}
