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

// ─── Brand palette (HARD LOCK — no other colors allowed on slides) ───────────

const BEAUTIFIO = {
  primary: '#084463',   // peacock dark blue
  secondary: '#6BB9D4', // icy sky blue
  accent: '#FFC64F',    // saffron yellow/gold
  bg: '#F8FAFC',        // cloud white
  white: '#FFFFFF',
  dark: '#1E2938',      // deep slate
  muted: '#647488',     // slate gray
}

// Legacy color slots kept for the design-context type and the two auxiliary
// renderers (video overlay / screenshot). Everything maps onto the brand.
const COLORS = {
  bg: BEAUTIFIO.primary,
  accent: BEAUTIFIO.accent,
  accent2: BEAUTIFIO.secondary,
  white: BEAUTIFIO.white,
  muted: BEAUTIFIO.muted,
  dim: BEAUTIFIO.secondary,
}

interface SlideDesignCtx {
  W: number; H: number
  colors: typeof COLORS
  headingFont: string
  bodyFont: string
  logoUrl?: string
  logoPosition?: string
}

// Poppins is the only registered family — used for both heading and body since
// Inter could not be downloaded.
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

  const files: [string, string][] = [
    // Brand fonts (Poppins) — used for headings and body.
    ['Poppins-Bold.ttf', 'Poppins'],
    ['Poppins-SemiBold.ttf', 'Poppins'],
    ['Poppins-Medium.ttf', 'Poppins'],
    ['Poppins-Regular.ttf', 'Poppins'],
  ]

  for (const [file, family] of files) {
    try {
      const p = path.join(process.cwd(), 'fonts', file)
      if (fs.existsSync(p)) GlobalFonts.registerFromPath(p, family)
      else console.warn('Font file not found:', file)
    } catch (e) {
      console.error('Font registration error:', file, e)
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
  let y = yTop + lineHeight * 0.8
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

// ─── Image helpers ──────────────────────────────────────────────────────────

async function loadSlideImage(slide: SlideContent): Promise<Image | null> {
  if (slide.imagePath && fs.existsSync(slide.imagePath)) {
    try {
      return await loadImage(slide.imagePath)
    } catch {
      return null
    }
  }
  return null
}

/** Draw an image cover-cropped into the top region [0..regionH]. */
function drawImageTop(ctx: SKRSContext2D, img: Image, w: number, regionH: number) {
  const scale = Math.max(w / img.width, regionH / img.height)
  const dw = img.width * scale
  const dh = img.height * scale
  const dx = (w - dw) / 2
  const dy = (regionH - dh) / 2
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, w, regionH)
  ctx.clip()
  ctx.drawImage(img, dx, dy, dw, dh)
  ctx.restore()
}

function drawImageFull(ctx: SKRSContext2D, img: Image, w: number, h: number) {
  const scale = Math.max(w / img.width, h / img.height)
  ctx.drawImage(img, (w - img.width * scale) / 2, (h - img.height * scale) / 2, img.width * scale, img.height * scale)
}
function drawImageLeft(ctx: SKRSContext2D, img: Image, regionW: number, h: number) {
  const scale = Math.min(regionW / img.width, h / img.height)
  const dh = img.height * scale
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, regionW, h); ctx.clip()
  ctx.drawImage(img, 0, (h - dh) / 2, img.width * scale, dh); ctx.restore()
}
function drawImageRight(ctx: SKRSContext2D, img: Image, regionW: number, h: number) {
  const scale = Math.min(regionW / img.width, h / img.height)
  const dh = img.height * scale
  const x = ctx.canvas ? (ctx.canvas as any).width : 0
  ctx.save(); ctx.beginPath(); ctx.rect(x - regionW, 0, regionW, h); ctx.clip()
  ctx.drawImage(img, x - regionW, (h - dh) / 2, img.width * scale, dh); ctx.restore()
}

// ─── Background ─────────────────────────────────────────────────────────────

// Solid cloud-white base. Each renderer paints its own solid color blocks over
// this — there are NO gradient scrims anymore.
function drawBackground(ctx: SKRSContext2D, dc: SlideDesignCtx) {
  ctx.fillStyle = BEAUTIFIO.bg
  ctx.fillRect(0, 0, dc.W, dc.H)
}

// ─── Logo ───────────────────────────────────────────────────────────────────

async function drawLogo(ctx2d: SKRSContext2D, dc: SlideDesignCtx) {
  if (!dc.logoUrl || !dc.logoPosition || dc.logoPosition === 'none') return
  let img: Image | null = null
  try {
    img = await loadImage(dc.logoUrl)
  } catch { return }
  if (!img) return

  const maxDim = 80
  let logoW = img.width
  let logoH = img.height
  if (logoW > logoH && logoW > maxDim) {
    logoH = (logoH / logoW) * maxDim
    logoW = maxDim
  } else if (logoH > maxDim) {
    logoW = (logoW / logoH) * maxDim
    logoH = maxDim
  }

  const pad = 40
  let x = 0, y = 0
  switch (dc.logoPosition) {
    case 'top-left':       x = pad; y = pad; break
    case 'top-center':     x = (dc.W - logoW) / 2; y = pad; break
    case 'top-right':      x = dc.W - logoW - pad; y = pad; break
    case 'center-left':    x = pad; y = (dc.H - logoH) / 2; break
    case 'center':         x = (dc.W - logoW) / 2; y = (dc.H - logoH) / 2; break
    case 'center-right':   x = dc.W - logoW - pad; y = (dc.H - logoH) / 2; break
    case 'bottom-left':    x = pad; y = dc.H - logoH - pad; break
    case 'bottom-center':  x = (dc.W - logoW) / 2; y = dc.H - logoH - pad; break
    case 'bottom-right':   x = dc.W - logoW - pad; y = dc.H - logoH - pad; break
    default: return
  }

  ctx2d.globalAlpha = 0.85
  ctx2d.drawImage(img, x, y, logoW, logoH)
  ctx2d.globalAlpha = 1
}

// ─── Per-type renderers ─────────────────────────────────────────────────────

// COVER — image top 55%, solid peacock block bottom 45%. No gradient.
async function renderCover(
  ctx: SKRSContext2D,
  slide: SlideContent,
  dc: SlideDesignCtx,
  handle: string,
) {
  const imgH = Math.round(dc.H * 0.55)

  const img = await loadSlideImage(slide)
  if (img) drawImageTop(ctx, img, dc.W, imgH)
  else {
    ctx.fillStyle = BEAUTIFIO.secondary
    ctx.fillRect(0, 0, dc.W, imgH)
  }

  // Solid peacock block, bottom 45%.
  ctx.fillStyle = BEAUTIFIO.primary
  ctx.fillRect(0, imgH, dc.W, dc.H - imgH)

  const contentW = dc.W - PAD_X * 2
  const blockTop = imgH + 72
  const blockBottom = dc.H - 96

  // Measure subtitle first to reserve room.
  const subSize = 34
  let subLines: string[] = []
  if (slide.subtitle) {
    ctx.font = font(WEIGHT.regular, subSize, FONT)
    subLines = wrapText(ctx, slide.subtitle, contentW)
  }
  const subH = subLines.length ? subLines.length * subSize * 1.3 + 28 : 0

  // Title — saffron, Poppins Bold, 72–80px auto-shrink.
  const titleMaxH = blockBottom - blockTop - subH
  const fitted = fitText(ctx, slide.title || '', {
    weight: WEIGHT.bold,
    startSize: 80,
    minSize: 56,
    maxWidth: contentW,
    maxHeight: Math.max(titleMaxH, 120),
    lineHeightRatio: 1.1,
    family: FONT,
  })

  let y = blockTop
  ctx.fillStyle = BEAUTIFIO.accent
  ctx.font = font(WEIGHT.bold, fitted.size, FONT)
  y = drawLines(ctx, fitted.lines, PAD_X, y, fitted.lineHeight, 'left')

  if (subLines.length) {
    y += 28
    ctx.fillStyle = BEAUTIFIO.white
    ctx.font = font(WEIGHT.regular, subSize, FONT)
    drawLines(ctx, subLines, PAD_X, y, subSize * 1.3, 'left')
  }

  // Handle — bottom-right, slate gray, 20px.
  if (handle) {
    ctx.fillStyle = BEAUTIFIO.muted
    ctx.font = font(WEIGHT.regular, 20, FONT)
    ctx.textAlign = 'right'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(handle, dc.W - PAD_X, dc.H - 48)
  }
}

// BULLETS — adaptive: image size, font sizes, and vertical centering scale with bullet count.
async function renderBullets(ctx: SKRSContext2D, slide: SlideContent, dc: SlideDesignCtx) {
  ctx.fillStyle = BEAUTIFIO.primary
  ctx.fillRect(0, 0, dc.W, dc.H)

  const bullets = slide.bullets || []
  const bulletCount = bullets.length

  const imgPct = bulletCount <= 2 ? 0.40 : bulletCount <= 4 ? 0.28 : 0.18
  const imgH = Math.round(dc.H * imgPct)
  const img = await loadSlideImage(slide)
  if (img) drawImageTop(ctx, img, dc.W, imgH)

  const contentW = dc.W - PAD_X * 2

  const titleSize = bulletCount <= 2 ? 56 : bulletCount <= 4 ? 48 : 42
  const bulletSize = bulletCount <= 2 ? 34 : bulletCount <= 4 ? 30 : 26
  const lineHeightRatio = 1.45
  const bulletLH = bulletSize * lineHeightRatio

  let totalH = 0
  const titleLines: string[] = []
  if (slide.title) {
    ctx.font = font(WEIGHT.semibold, titleSize, FONT)
    titleLines.push(...wrapText(ctx, slide.title, contentW))
    totalH += titleLines.length * titleSize * lineHeightRatio + 24
  }

  for (const b of bullets) {
    ctx.font = font(WEIGHT.regular, bulletSize, FONT)
    totalH += wrapText(ctx, b, contentW - 48).length * bulletLH + 12
  }

  const margin = 60
  const availH = (dc.H - imgH) - margin * 2
  let y = imgH + margin + Math.max(0, (availH - totalH) / 2)

  if (titleLines.length) {
    ctx.fillStyle = BEAUTIFIO.accent
    ctx.font = font(WEIGHT.semibold, titleSize, FONT)
    y = drawLines(ctx, titleLines, PAD_X, y, titleSize * lineHeightRatio, 'left') + 24
  }

  for (const b of bullets) {
    ctx.font = font(WEIGHT.regular, bulletSize, FONT)
    const lines = wrapText(ctx, b, contentW - 48)
    ctx.fillStyle = BEAUTIFIO.accent
    const sq = Math.max(8, bulletSize * 0.35)
    ctx.fillRect(PAD_X, y + bulletLH * 0.5 - sq / 2, sq, sq)
    ctx.fillStyle = BEAUTIFIO.white
    drawLines(ctx, lines, PAD_X + 40, y, bulletLH, 'left')
    y += lines.length * bulletLH + 12
  }

  ctx.fillStyle = BEAUTIFIO.muted
  ctx.font = font(WEIGHT.regular, 20, FONT)
  ctx.textAlign = 'right'
  ctx.fillText('@beautifio.space', dc.W - PAD_X, dc.H - 40)
  ctx.textAlign = 'left'
}

// STAT — no image, solid peacock. Huge saffron number, deco lines, label.
function renderStat(ctx: SKRSContext2D, slide: SlideContent, dc: SlideDesignCtx) {
  ctx.fillStyle = BEAUTIFIO.primary
  ctx.fillRect(0, 0, dc.W, dc.H)

  const stats = slide.stats || []
  if (stats.length === 0) return

  const cx = dc.W / 2
  const numSize = 180
  const labelSize = 40
  const lineW = 130
  const blockGap = 80

  ctx.textAlign = 'center'
  const blocks = stats.map((s) => {
    ctx.font = font(WEIGHT.regular, labelSize, FONT)
    const labelLines = wrapText(ctx, s.label, dc.W - PAD_X * 2)
    const h = 40 + numSize * 1.1 + 40 + labelLines.length * labelSize * 1.25
    return { s, labelLines, h }
  })
  const totalH = blocks.reduce((a, b) => a + b.h, 0) + blockGap * (blocks.length - 1)
  let y = Math.max(PAD_TOP, (dc.H - totalH) / 2)

  for (const block of blocks) {
    // Decorative line above.
    ctx.strokeStyle = BEAUTIFIO.secondary
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(cx - lineW / 2, y)
    ctx.lineTo(cx + lineW / 2, y)
    ctx.stroke()
    y += 40

    // Number.
    ctx.fillStyle = BEAUTIFIO.accent
    ctx.font = font(WEIGHT.bold, numSize, FONT)
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(block.s.value, cx, y + numSize * 0.8)
    y += numSize * 1.1

    // Decorative line below.
    ctx.strokeStyle = BEAUTIFIO.secondary
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(cx - lineW / 2, y)
    ctx.lineTo(cx + lineW / 2, y)
    ctx.stroke()
    y += 40

    // Label.
    ctx.fillStyle = BEAUTIFIO.white
    ctx.font = font(WEIGHT.regular, labelSize, FONT)
    y = drawLines(ctx, block.labelLines, cx, y, labelSize * 1.25, 'center')
    y += blockGap
  }
}

// GRID4 — no image, 4 solid quadrants with alternating backgrounds.
function renderGrid4(ctx: SKRSContext2D, slide: SlideContent, dc: SlideDesignCtx) {
  const cards = (slide.cards || []).slice(0, 4)
  const halfW = dc.W / 2
  const halfH = dc.H / 2

  const quads = [
    { x: 0, y: 0, bg: BEAUTIFIO.primary },      // top-left
    { x: halfW, y: 0, bg: BEAUTIFIO.dark },     // top-right
    { x: 0, y: halfH, bg: BEAUTIFIO.dark },     // bottom-left
    { x: halfW, y: halfH, bg: BEAUTIFIO.primary }, // bottom-right
  ]
  for (const q of quads) {
    ctx.fillStyle = q.bg
    ctx.fillRect(q.x, q.y, halfW, halfH)
  }

  // Separator lines — icy sky blue, 2px.
  ctx.strokeStyle = BEAUTIFIO.secondary
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(halfW, 0)
  ctx.lineTo(halfW, dc.H)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(0, halfH)
  ctx.lineTo(dc.W, halfH)
  ctx.stroke()

  const pad = 64
  cards.forEach((card, i) => {
    const q = quads[i]
    const innerW = halfW - pad * 2
    const cellH = dc.H / 2

    // Measure actual content height
    const numH = 40
    ctx.font = font(WEIGHT.semibold, 36, FONT)
    const titleLines = wrapText(ctx, card.title || '', innerW).slice(0, 2)
    const titleH = titleLines.length * (36 * 1.15)
    ctx.font = font(WEIGHT.regular, 26, FONT)
    const maxLines = Math.max(1, Math.floor((cellH - pad * 2) / (26 * 1.3)))
    const descLines = wrapText(ctx, card.desc || '', innerW).slice(0, maxLines)
    const descH = descLines.length * (26 * 1.3)
    const totalH = numH + 26 + titleH + 12 + descH
    let cy = q.y + (cellH - totalH) / 2

    // Number — saffron SemiBold 40px.
    ctx.fillStyle = BEAUTIFIO.accent
    ctx.font = font(WEIGHT.semibold, 40, FONT)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(card.num || '', q.x + pad, cy + 40)
    cy += 40 + 26

    // Title — white SemiBold 36px.
    ctx.fillStyle = BEAUTIFIO.white
    ctx.font = font(WEIGHT.semibold, 36, FONT)
    cy = drawLines(ctx, titleLines, q.x + pad, cy, 36 * 1.15, 'left') + 12

    // Description — icy sky blue Regular 26px.
    ctx.fillStyle = BEAUTIFIO.secondary
    ctx.font = font(WEIGHT.regular, 26, FONT)
    drawLines(ctx, descLines, q.x + pad, cy, 26 * 1.3, 'left')
  })
}

// QUOTE — no full image, solid deep-slate. Optional small circular portrait.
async function renderQuote(ctx: SKRSContext2D, slide: SlideContent, dc: SlideDesignCtx) {
  ctx.fillStyle = BEAUTIFIO.dark
  ctx.fillRect(0, 0, dc.W, dc.H)

  const cx = dc.W / 2
  const maxW = dc.W - PAD_X * 2

  // Small portrait (from AI, if any): circle, 200px, top center.
  let topOffset = PAD_TOP
  const img = await loadSlideImage(slide)
  if (img) {
    const d = 200
    const py = 130
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, py + d / 2, d / 2, 0, Math.PI * 2)
    ctx.clip()
    const scale = Math.max(d / img.width, d / img.height)
    const dw = img.width * scale
    const dh = img.height * scale
    ctx.drawImage(img, cx - dw / 2, py + d / 2 - dh / 2, dw, dh)
    ctx.restore()
    topOffset = py + d + 40
  }

  // Quote text — auto-fit 44 → 34.
  const fitted = fitText(ctx, slide.quote || '', {
    weight: WEIGHT.medium,
    startSize: 44,
    minSize: 34,
    maxWidth: maxW,
    maxHeight: dc.H * 0.5,
    lineHeightRatio: 1.25,
    family: FONT,
  })

  let sourceLines: string[] = []
  if (slide.source) {
    ctx.font = font(WEIGHT.regular, 28, FONT)
    sourceLines = wrapText(ctx, slide.source, maxW)
  }

  const glyphSize = 80
  const glyphH = glyphSize * 0.5
  const quoteH = fitted.lines.length * fitted.lineHeight
  const sourceH = sourceLines.length ? sourceLines.length * 28 * 1.3 + 44 : 0
  const totalH = glyphH + 24 + quoteH + sourceH
  let y = topOffset + Math.max(0, (dc.H - topOffset - totalH) / 2)

  // Large quote mark — saffron 160px.
  ctx.fillStyle = BEAUTIFIO.accent
  ctx.font = font(WEIGHT.bold, glyphSize, FONT)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('\u201C', cx, y + glyphSize * 0.72)
  y += glyphH + 24

  // Quote — white.
  ctx.fillStyle = BEAUTIFIO.white
  ctx.font = font(WEIGHT.medium, fitted.size, FONT)
  y = drawLines(ctx, fitted.lines, cx, y, fitted.lineHeight, 'center')

  // Source — icy sky blue 28px.
  if (sourceLines.length) {
    y += 44
    ctx.fillStyle = BEAUTIFIO.secondary
    ctx.font = font(WEIGHT.regular, 28, FONT)
    drawLines(ctx, sourceLines, cx, y, 28 * 1.3, 'center')
  }
}

// CTA — no image, solid peacock. Saffron headline + follow handle.
function renderCta(ctx: SKRSContext2D, slide: SlideContent, dc: SlideDesignCtx, handle: string) {
  ctx.fillStyle = BEAUTIFIO.primary
  ctx.fillRect(0, 0, dc.W, dc.H)

  const cx = dc.W / 2
  const contentW = dc.W - PAD_X * 2

  const fitted = fitText(ctx, slide.text || '', {
    weight: WEIGHT.bold,
    startSize: 56,
    minSize: 40,
    maxWidth: contentW,
    maxHeight: dc.H * 0.42,
    lineHeightRatio: 1.2,
    family: FONT,
  })

  const handleSize = 28
  const handleH = handleSize * 1.3
  const lineGap = 52
  const textH = fitted.lines.length * fitted.lineHeight
  const totalH = 4 + lineGap + textH + 56 + handleH
  let y = Math.max(PAD_TOP, (dc.H - totalH) / 2)

  // Thin decorative line above the text — saffron.
  ctx.strokeStyle = BEAUTIFIO.accent
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(cx - 70, y)
  ctx.lineTo(cx + 70, y)
  ctx.stroke()
  y += lineGap

  // CTA headline.
  ctx.fillStyle = BEAUTIFIO.accent
  ctx.font = font(WEIGHT.bold, fitted.size, FONT)
  y = drawLines(ctx, fitted.lines, cx, y, fitted.lineHeight, 'center')
  y += 56

  // Follow @handle.
  ctx.fillStyle = BEAUTIFIO.white
  ctx.font = font(WEIGHT.semibold, handleSize, FONT)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(`Follow ${handle || ''}`.trim(), cx, y + handleSize * 0.85)
}

async function renderFlexible(
  ctx: SKRSContext2D, slide: any, dc: SlideDesignCtx, handle?: string
) {
  const imgPos = (slide as any).imagePosition || 'top'
  const imgPct = ((slide as any).imagePercent || 50) / 100
  const textPos = (slide as any).textPosition || 'bottom'

  // Solid background
  ctx.fillStyle = BEAUTIFIO.primary
  ctx.fillRect(0, 0, dc.W, dc.H)

  // Image area
  const img = await loadSlideImage(slide)
  if (img && imgPos !== 'none') {
    if (imgPos === 'top') {
      const imgH = Math.round(dc.H * imgPct)
      drawImageTop(ctx, img, dc.W, imgH)
    } else if (imgPos === 'full') {
      drawImageFull(ctx, img, dc.W, dc.H)
      ctx.fillStyle = 'rgba(8, 68, 99, 0.55)'
      ctx.fillRect(0, 0, dc.W, dc.H)
    } else if (imgPos === 'left') {
      const imgW = Math.round(dc.W * imgPct)
      drawImageLeft(ctx, img, imgW, dc.H)
    } else if (imgPos === 'right') {
      const imgW = Math.round(dc.W * imgPct)
      drawImageRight(ctx, img, imgW, dc.H)
    }
  }

  // Text area — position based on textPosition
  const contentW = dc.W - PAD_X * 2
  let y

  if (imgPos === 'top') {
    const imgH = Math.round(dc.H * imgPct)
    y = imgH + 56
  } else if (imgPos === 'left' || imgPos === 'right') {
    y = PAD_TOP
  } else if (imgPos === 'full') {
    // Text centered on dark overlay
    y = Math.round(dc.H * 0.3)
  } else {
    y = PAD_TOP
  }

  // Title
  if (slide.title) {
    const fitted = fitText(ctx, slide.title, {
      weight: WEIGHT.semibold, startSize: 52, minSize: 36,
      maxWidth: contentW, maxHeight: 260, lineHeightRatio: 1.2, family: FONT,
    })
    ctx.fillStyle = BEAUTIFIO.accent
    ctx.font = font(WEIGHT.semibold, fitted.size, FONT)
    y = drawLines(ctx, fitted.lines, PAD_X, y, fitted.lineHeight, 'left') + 36
  }

  // Subtitle
  if (slide.subtitle) {
    ctx.fillStyle = BEAUTIFIO.white
    ctx.font = font(WEIGHT.regular, 30, FONT)
    const subLines = wrapText(ctx, slide.subtitle, contentW)
    y = drawLines(ctx, subLines, PAD_X, y, 30 * 1.25, 'left') + 32
  }

  // Bullets
  if (slide.bullets?.length) {
    const bottom = dc.H - 80
    const textX = PAD_X + 40
    let bulletSize = 28
    ctx.font = font(WEIGHT.regular, bulletSize, FONT)
    while (bulletSize > 22) {
      let total = 0
      for (const b of slide.bullets) {
        const lines = wrapText(ctx, b, contentW - 40)
        total += lines.length * bulletSize * 1.3 + bulletSize * 0.5
      }
      if (y + total <= bottom) break
      bulletSize -= 2
      ctx.font = font(WEIGHT.regular, bulletSize, FONT)
    }
    const lh = bulletSize * 1.3
    for (const b of slide.bullets) {
      ctx.fillStyle = BEAUTIFIO.accent
      const sq = Math.max(8, bulletSize * 0.4)
      ctx.fillRect(PAD_X, y + lh * 0.5 - sq / 2, sq, sq)
      ctx.fillStyle = BEAUTIFIO.white
      ctx.font = font(WEIGHT.regular, bulletSize, FONT)
      const lines = wrapText(ctx, b, contentW - 40)
      y = drawLines(ctx, lines, textX, y, lh, 'left')
      y += bulletSize * 0.5
    }
  }

  // Text-only (quote, cta style)
  if (slide.text && !slide.bullets?.length) {
    const fitted = fitText(ctx, slide.text, {
      weight: WEIGHT.bold, startSize: 56, minSize: 40,
      maxWidth: contentW, maxHeight: dc.H * 0.5, lineHeightRatio: 1.25, family: FONT,
    })
    ctx.fillStyle = BEAUTIFIO.accent
    ctx.font = font(WEIGHT.bold, fitted.size, FONT)
    const textH = fitted.lines.length * fitted.lineHeight
    const textY = Math.max(y, (dc.H - textH) / 2)
    drawLines(ctx, fitted.lines, dc.W / 2, textY, fitted.lineHeight, 'center')
  }

  // Footer handle
  if (handle) {
    ctx.fillStyle = BEAUTIFIO.muted
    ctx.font = font(WEIGHT.regular, 20, FONT)
    ctx.textAlign = 'right'
    ctx.fillText(handle, dc.W - PAD_X, dc.H - 36)
  }
}

// PROFILE — image top 45%, solid peacock block below. One slide per person/item.
async function renderProfile(ctx: SKRSContext2D, slide: SlideContent, dc: SlideDesignCtx) {
  ctx.fillStyle = BEAUTIFIO.primary
  ctx.fillRect(0, 0, dc.W, dc.H)
  const imgH = Math.round(dc.H * 0.45)
  const img = await loadSlideImage(slide)
  if (img) drawImageTop(ctx, img, dc.W, imgH)
  const contentW = dc.W - PAD_X * 2
  const bullets = slide.bullets || []
  let totalH = 0
  const titleSize = 56
  ctx.font = font(WEIGHT.bold, titleSize, FONT)
  const titleLines = wrapText(ctx, slide.title || '', contentW)
  totalH += titleLines.length * (titleSize * 1.2) + 24
  const bulletSize = bullets.length <= 2 ? 30 : 28
  const bulletLH = bulletSize * 1.45
  for (const b of bullets) { ctx.font = font(WEIGHT.regular, bulletSize, FONT); totalH += wrapText(ctx, b, contentW - 48).length * bulletLH + 12 }
  const margin = 60; const availH = (dc.H - imgH) - margin * 2
  let y = imgH + margin + Math.max(0, (availH - totalH) / 2)
  ctx.fillStyle = BEAUTIFIO.accent; ctx.font = font(WEIGHT.bold, titleSize, FONT)
  y = drawLines(ctx, titleLines, PAD_X, y, titleSize * 1.2, 'left') + 24
  for (const b of bullets) {
    ctx.font = font(WEIGHT.regular, bulletSize, FONT); const lines = wrapText(ctx, b, contentW - 48)
    ctx.fillStyle = BEAUTIFIO.accent; ctx.fillRect(PAD_X, y + bulletLH * 0.5 - 5, 10, 10)
    ctx.fillStyle = BEAUTIFIO.white; drawLines(ctx, lines, PAD_X + 40, y, bulletLH, 'left')
    y += lines.length * bulletLH + 12
  }
  ctx.fillStyle = BEAUTIFIO.muted; ctx.font = font(WEIGHT.regular, 20, FONT); ctx.textAlign = 'right'
  ctx.fillText('@beautifio.space', dc.W - PAD_X, dc.H - 40); ctx.textAlign = 'left'
}

function renderFallback(ctx: SKRSContext2D, slide: SlideContent, dc: SlideDesignCtx) {
  ctx.fillStyle = BEAUTIFIO.primary
  ctx.fillRect(0, 0, dc.W, dc.H)
  const text = slide.title || slide.text || slide.tag || ''
  const fitted = fitText(ctx, text, {
    weight: WEIGHT.bold,
    startSize: 56,
    minSize: 32,
    maxWidth: dc.W - PAD_X * 2,
    maxHeight: dc.H - PAD_TOP * 2,
    lineHeightRatio: 1.2,
    family: FONT,
  })
  const blockH = fitted.lines.length * fitted.lineHeight
  const y = Math.max(PAD_TOP, (dc.H - blockH) / 2)
  ctx.fillStyle = BEAUTIFIO.accent
  ctx.font = font(WEIGHT.bold, fitted.size, FONT)
  drawLines(ctx, fitted.lines, dc.W / 2, y, fitted.lineHeight, 'center')
}

// ─── Public entrypoint ──────────────────────────────────────────────────────

export async function renderSlide(
  slide: SlideContent,
  opts: {
    index: number; total: number; handle: string
    design?: {
      headingFont?: string; bodyFont?: string
      bgColor?: string; accentColor?: string; accent2Color?: string
      textColor?: string; mutedColor?: string
      width?: number; height?: number
      logoUrl?: string; logoPosition?: string
    }
  },
): Promise<string> {
  registerFonts()

  const dW = opts.design?.width ?? W
  const dH = opts.design?.height ?? H
  // Colors are HARD LOCKED to the brand — design color overrides are ignored.
  const dc: SlideDesignCtx = {
    W: dW,
    H: dH,
    colors: COLORS,
    headingFont: FONT,
    bodyFont: FONT,
    logoUrl: opts.design?.logoUrl,
    logoPosition: opts.design?.logoPosition,
  }

  const canvas = createCanvas(dW, dH)
  const ctx2d = canvas.getContext('2d') as unknown as SKRSContext2D

  // 1. Solid cloud-white base. Renderers paint their own solid blocks on top.
  drawBackground(ctx2d, dc)

  // 2. Body per slide type — flexible render for reference-driven slides
  if ((slide as any).layout && (slide as any).imagePosition) {
    await renderFlexible(ctx2d, slide, dc, opts.handle)
  } else switch (slide.type) {
    case 'cover':
      await renderCover(ctx2d, slide, dc, opts.handle)
      break
    case 'profile':
      await renderProfile(ctx2d, slide, dc)
      break
    case 'bullets':
      await renderBullets(ctx2d, slide, dc)
      break
    case 'stat':
      renderStat(ctx2d, slide, dc)
      break
    case 'grid4':
      renderGrid4(ctx2d, slide, dc)
      break
    case 'quote':
      await renderQuote(ctx2d, slide, dc)
      break
    case 'cta':
      renderCta(ctx2d, slide, dc, opts.handle)
      break
    default:
      renderFallback(ctx2d, slide, dc)
      break
  }

  // 3. Logo watermark.
  await drawLogo(ctx2d, dc)

  // 4. Encode and write.
  const outputPath = path.join(TMP, `slide-${uuid()}.png`)
  const png = canvas.toBuffer('image/png')
  fs.writeFileSync(outputPath, png)
  return outputPath
}

// Transparent overlay (short caption at top) to burn onto the video carousel
// slide with ffmpeg. Text sits over a soft peacock top scrim; rest transparent.
export async function renderVideoOverlay(
  text: string,
  opts: { handle?: string } = {},
): Promise<string> {
  void opts
  registerFonts()
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d') as unknown as SKRSContext2D

  const topEnd = H * 0.36
  const g = ctx.createLinearGradient(0, 0, 0, topEnd)
  g.addColorStop(0, 'rgba(8,68,99,0.9)')
  g.addColorStop(0.7, 'rgba(8,68,99,0.5)')
  g.addColorStop(1, 'rgba(8,68,99,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, topEnd)

  const fitted = fitText(ctx, text || '', {
    weight: WEIGHT.bold,
    startSize: 48,
    minSize: 28,
    maxWidth: W - PAD_X * 2,
    maxHeight: 280,
    lineHeightRatio: 1.2,
    family: FONT,
  })
  ctx.fillStyle = BEAUTIFIO.accent
  ctx.font = font(WEIGHT.bold, fitted.size, FONT)
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

  ctx.fillStyle = BEAUTIFIO.primary
  ctx.fillRect(0, 0, W, H)

  const top = 110
  let textBottom = top
  if (text) {
    const fitted = fitText(ctx, text, {
      weight: WEIGHT.semibold,
      startSize: 44,
      minSize: 26,
      maxWidth: W - PAD_X * 2,
      maxHeight: 240,
      lineHeightRatio: 1.2,
      family: FONT,
    })
    ctx.fillStyle = BEAUTIFIO.accent
    ctx.font = font(WEIGHT.semibold, fitted.size, FONT)
    textBottom = drawLines(ctx, fitted.lines, PAD_X, top, fitted.lineHeight, 'left')
  }

  const cardTop = textBottom + 56
  const cardBottom = H - 110
  const boxX = PAD_X
  const boxW = W - PAD_X * 2
  const boxH = Math.max(200, cardBottom - cardTop)

  try {
    const img = await loadImage(imagePath)
    const s = Math.min(boxW / img.width, boxH / img.height)
    const dw = img.width * s
    const dh = img.height * s
    const dx = boxX + (boxW - dw) / 2
    const dy = cardTop + (boxH - dh) / 2

    ctx.fillStyle = BEAUTIFIO.dark
    roundRectPath(ctx, dx - 16, dy - 16, dw + 32, dh + 32, 12)
    ctx.fill()

    ctx.save()
    roundRectPath(ctx, dx, dy, dw, dh, 8)
    ctx.clip()
    ctx.drawImage(img, dx, dy, dw, dh)
    ctx.restore()

    ctx.strokeStyle = BEAUTIFIO.accent
    ctx.lineWidth = 4
    roundRectPath(ctx, dx, dy, dw, dh, 8)
    ctx.stroke()
  } catch {
    /* if the upload can't be read, just leave the peacock slide with the text */
  }

  const outputPath = path.join(TMP, `slide-${uuid()}.png`)
  fs.writeFileSync(outputPath, canvas.toBuffer('image/png'))
  return outputPath
}
