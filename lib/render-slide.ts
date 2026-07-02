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
  bg: '#0a0a0a',
  accent: '#ffffff', // brand accent removed — everything white per request
  white: '#ffffff',
  muted: '#e2e2e2',
  dim: '#cfcfcf',
}

const FONT = 'Poppins'

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

  const files = [
    'Poppins-Bold.ttf',
    'Poppins-SemiBold.ttf',
    'Poppins-Medium.ttf',
    'Poppins-Regular.ttf',
  ]

  for (const file of files) {
    try {
      const p = path.join(process.cwd(), 'fonts', file)
      if (fs.existsSync(p)) {
        // Register all four under the same family; napi-rs derives the weight
        // from the file, and we select it at draw time via the ctx.font weight
        // keyword. Aliases kept for defensive lookups.
        GlobalFonts.registerFromPath(p, FONT)
      }
    } catch {
      // Fall back silently — canvas uses a default face if a file is missing.
    }
  }

  // Optional weight-named aliases (best-effort; ignored if already covered).
  try {
    const semibold = path.join(process.cwd(), 'fonts', 'Poppins-SemiBold.ttf')
    if (fs.existsSync(semibold)) GlobalFonts.registerFromPath(semibold, 'Poppins SemiBold')
  } catch {
    /* noop */
  }
  try {
    const medium = path.join(process.cwd(), 'fonts', 'Poppins-Medium.ttf')
    if (fs.existsSync(medium)) GlobalFonts.registerFromPath(medium, 'Poppins Medium')
  } catch {
    /* noop */
  }
}

// ─── Text helpers ───────────────────────────────────────────────────────────

function font(weight: string, size: number): string {
  return `${weight} ${Math.round(size)}px "${FONT}"`
}

/** Break `text` into lines that each fit within `maxWidth` at the current ctx.font. */
function wrapText(ctx: SKRSContext2D, text: string, maxWidth: number): string[] {
  const words = String(text ?? '').split(/\s+/).filter(Boolean)
  if (words.length === 0) return ['']

  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (ctx.measureText(candidate).width <= maxWidth || !current) {
      // If a single word is itself wider than maxWidth we still accept it
      // as its own line (hard break avoided to keep things simple/readable).
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
  },
): { size: number; lines: string[]; lineHeight: number } {
  let size = opts.startSize
  while (size > opts.minSize) {
    ctx.font = font(opts.weight, size)
    const lines = wrapText(ctx, text, opts.maxWidth)
    const lineHeight = size * opts.lineHeightRatio
    if (lines.length * lineHeight <= opts.maxHeight) {
      return { size, lines, lineHeight }
    }
    size -= 2
  }
  ctx.font = font(opts.weight, opts.minSize)
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
  } else {
    ctx.fillStyle = COLORS.bg
    ctx.fillRect(0, 0, W, H)
  }

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
    return
  }

  // Full-canvas darkening scrim for legibility.
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
  ctx.font = font(WEIGHT.semibold, 30)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
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
    ctx.font = font(WEIGHT.medium, 42)
    const lines = wrapText(ctx, slide.subtitle, CONTENT_W)
    subtitleBlock = { lines, size: 42, lineHeight: 42 * 1.3 }
  }

  const subtitleH = subtitleBlock
    ? subtitleBlock.lines.length * subtitleBlock.lineHeight + 34
    : 0

  // Title — big, bold, lower-third emphasis, auto-shrink.
  const title = slide.title || ''
  const titleMaxH = bottom - (headerBottom + 60) - subtitleH
  const fitted = fitText(ctx, title, {
    weight: WEIGHT.bold,
    startSize: 92,
    minSize: 52,
    maxWidth: CONTENT_W,
    maxHeight: Math.max(titleMaxH, 120),
    lineHeightRatio: 1.08,
  })

  const totalBlockH = fitted.lines.length * fitted.lineHeight + subtitleH
  // Anchor block to the lower third: place its bottom near `bottom`.
  const blockTop = Math.max(headerBottom + 60, bottom - totalBlockH)

  ctx.fillStyle = COLORS.white
  ctx.font = font(WEIGHT.bold, fitted.size)
  const afterTitle = drawLines(ctx, fitted.lines, PAD_X, blockTop, fitted.lineHeight, 'left')

  if (subtitleBlock) {
    ctx.fillStyle = COLORS.muted
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
      startSize: 64,
      minSize: 40,
      maxWidth: CONTENT_W,
      maxHeight: 300,
      lineHeightRatio: 1.12,
    })
    ctx.fillStyle = COLORS.white
    ctx.font = font(WEIGHT.bold, fitted.size)
    y = drawLines(ctx, fitted.lines, PAD_X, y, fitted.lineHeight, 'left') + 56
  }

  const bullets = slide.bullets || []
  if (bullets.length === 0) return

  const markX = PAD_X
  const textX = PAD_X + 44 // hanging indent
  const textMaxW = CONTENT_W - 44

  // Choose a bullet font size that lets everything fit.
  let bulletSize = 40
  const measure = (size: number) => {
    ctx.font = font(WEIGHT.medium, size)
    const lh = size * 1.28
    let total = 0
    for (const b of bullets) {
      const lines = wrapText(ctx, b, textMaxW)
      total += lines.length * lh + size * 0.85 // row gap
    }
    return total
  }
  while (bulletSize > 28 && y + measure(bulletSize) > bottom) {
    bulletSize -= 2
  }

  const lineHeight = bulletSize * 1.28
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  for (const b of bullets) {
    ctx.font = font(WEIGHT.medium, bulletSize)
    const lines = wrapText(ctx, b, textMaxW)
    const rowTop = y

    // Accent bullet mark — drawn as a circle (Poppins has no ● glyph → tofu box).
    ctx.fillStyle = COLORS.accent
    const dotR = Math.max(6, bulletSize * 0.16)
    ctx.beginPath()
    ctx.arc(markX + dotR, rowTop + lineHeight * 0.5, dotR, 0, Math.PI * 2)
    ctx.fill()

    // Bullet text (white, hanging indent).
    ctx.fillStyle = COLORS.white
    ctx.font = font(WEIGHT.medium, bulletSize)
    drawLines(ctx, lines, textX, rowTop, lineHeight, 'left')

    y = rowTop + lines.length * lineHeight + bulletSize * 0.85
    if (y > bottom) break
  }
}

function renderStat(ctx: SKRSContext2D, slide: SlideContent, headerBottom: number) {
  const { top, bottom, height } = contentBounds(headerBottom)
  const stats = slide.stats || []
  if (stats.length === 0) return

  const cx = W / 2
  const valueSize = stats.length > 2 ? 110 : 150
  const labelSize = 46
  const blockGap = 56

  // Pre-measure to center vertically.
  ctx.textAlign = 'center'
  const blocks = stats.map((s) => {
    ctx.font = font(WEIGHT.medium, labelSize)
    const labelLines = wrapText(ctx, s.label, CONTENT_W)
    const h = valueSize * 1.05 + 18 + labelLines.length * labelSize * 1.25
    return { s, labelLines, h }
  })
  const totalH = blocks.reduce((a, b) => a + b.h, 0) + blockGap * (blocks.length - 1)
  let y = top + Math.max(0, (height - totalH) / 2)

  for (const block of blocks) {
    // Value — huge accent.
    ctx.fillStyle = COLORS.accent
    ctx.font = font(WEIGHT.bold, valueSize)
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(block.s.value, cx, y + valueSize * 0.85)
    y += valueSize * 1.05 + 18

    // Label — white/muted.
    ctx.fillStyle = COLORS.white
    ctx.font = font(WEIGHT.medium, labelSize)
    y = drawLines(ctx, block.labelLines, cx, y, labelSize * 1.25, 'center')
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
      startSize: 56,
      minSize: 38,
      maxWidth: CONTENT_W,
      maxHeight: 220,
      lineHeightRatio: 1.12,
    })
    ctx.fillStyle = COLORS.white
    ctx.font = font(WEIGHT.bold, fitted.size)
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

  // Thin separators between rows/cols.
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'
  ctx.lineWidth = 1
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

    // Number.
    ctx.fillStyle = COLORS.accent
    ctx.font = font(WEIGHT.bold, 40)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(card.num || '', cellX, cy + 40)
    cy += 40 + 20

    // Title.
    ctx.fillStyle = COLORS.white
    ctx.font = font(WEIGHT.semibold, 34)
    const titleLines = wrapText(ctx, card.title || '', innerW).slice(0, 2)
    cy = drawLines(ctx, titleLines, cellX, cy, 34 * 1.18, 'left') + 12

    // Description.
    ctx.fillStyle = COLORS.muted
    ctx.font = font(WEIGHT.regular, 26)
    const descMaxLines = Math.max(1, Math.floor((cellY + cellH - cy) / (26 * 1.3)))
    const descLines = wrapText(ctx, card.desc || '', innerW).slice(0, descMaxLines)
    drawLines(ctx, descLines, cellX, cy, 26 * 1.3, 'left')
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

  // Quote text, auto-fit.
  const fitted = fitText(ctx, slide.quote || '', {
    weight: WEIGHT.semibold,
    startSize: 54,
    minSize: 36,
    maxWidth: maxW,
    maxHeight: height - 260,
    lineHeightRatio: 1.32,
  })

  let sourceLines: string[] = []
  if (slide.source) {
    ctx.font = font(WEIGHT.medium, 36)
    sourceLines = wrapText(ctx, slide.source, maxW)
  }

  const quoteH = fitted.lines.length * fitted.lineHeight
  const sourceH = sourceLines.length ? sourceLines.length * 36 * 1.3 + 44 : 0
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
    ctx.fillStyle = COLORS.muted
    ctx.font = font(WEIGHT.medium, 36)
    drawLines(ctx, sourceLines, cx, y, 36 * 1.3, 'center')
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
    startSize: 68,
    minSize: 44,
    maxWidth: CONTENT_W,
    maxHeight: height - 200,
    lineHeightRatio: 1.16,
  })

  const handleSize = 40

  ctx.font = font(WEIGHT.semibold, handleSize)
  const handleH = handleSize * 1.3

  const textH = fitted.lines.length * fitted.lineHeight
  const totalH = textH + 60 + handleH
  let y = top + Math.max(0, (height - totalH) / 2)

  // Main punchy line.
  ctx.fillStyle = COLORS.white
  ctx.font = font(WEIGHT.bold, fitted.size)
  y = drawLines(ctx, fitted.lines, cx, y, fitted.lineHeight, 'center')
  y += 60

  // "Follow @handle" (white). This is the last slide's only branding.
  ctx.fillStyle = COLORS.white
  ctx.font = font(WEIGHT.semibold, handleSize)
  ctx.textAlign = 'center'
  ctx.fillText(`Follow ${handle || ''}`.trim(), cx, y + handleSize * 0.85)
}

function renderFallback(ctx: SKRSContext2D, slide: SlideContent, headerBottom: number) {
  const { top, height } = contentBounds(headerBottom)
  const text = slide.title || slide.text || slide.tag || ''
  const fitted = fitText(ctx, text, {
    weight: WEIGHT.bold,
    startSize: 72,
    minSize: 40,
    maxWidth: CONTENT_W,
    maxHeight: height,
    lineHeightRatio: 1.15,
  })
  const blockH = fitted.lines.length * fitted.lineHeight
  const y = top + Math.max(0, (height - blockH) / 2)
  ctx.fillStyle = COLORS.white
  ctx.font = font(WEIGHT.bold, fitted.size)
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

  // Caption heading near the top.
  const fitted = fitText(ctx, text || '', {
    weight: WEIGHT.bold,
    startSize: 54,
    minSize: 34,
    maxWidth: CONTENT_W,
    maxHeight: 280,
    lineHeightRatio: 1.14,
  })
  ctx.fillStyle = COLORS.white
  ctx.font = font(WEIGHT.bold, fitted.size)
  drawLines(ctx, fitted.lines, PAD_X, PAD_TOP + 6, fitted.lineHeight, 'left')

  const outputPath = path.join(TMP, `voverlay-${uuid()}.png`)
  fs.writeFileSync(outputPath, canvas.toBuffer('image/png'))
  return outputPath
}
