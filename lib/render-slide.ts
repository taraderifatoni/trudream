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

const PAD_X = 72
const PAD_TOP = 56

// ─── Brand palette (HARD LOCK) ───────────────────────────────────────────────

const BEAUTIFIO = {
  primary:     '#084463',  // peacock — bg foto mode
  secondary:   '#6BB9D4',  // icy sky — desc / deco
  accent:      '#FFC64F',  // saffron — heading foto mode, keywords, dots, hashtag
  accent2:     '#6BB9D4',
  accent2Light:'#8CC5D0',
  bg:          '#F8FAFC',  // cloud white — bg teks mode
  white:       '#FFFFFF',  // body foto mode
  dark:        '#1E2938',  // deep slate — body teks mode
  muted:       '#647488',  // slate gray — handle
  deepSlate:   '#1E2938',
}

const COLORS = {
  bg: BEAUTIFIO.primary,
  accent: BEAUTIFIO.accent,
  accent2: BEAUTIFIO.secondary,
  white: BEAUTIFIO.white,
  muted: BEAUTIFIO.muted,
  dim: BEAUTIFIO.secondary,
}

// ─── Slide design context ────────────────────────────────────────────────────

interface SlideDesignCtx {
  W: number; H: number
  colors: typeof COLORS
  headingFont: string
  bodyFont: string
  logoUrl?: string
  logoPosition?: string
}

// ─── Fonts ────────────────────────────────────────────────────────────────────

const FONT = 'Poppins'
const WEIGHT = { regular: '400', medium: '500', semibold: '600', bold: '700' } as const

let fontsRegistered = false

function registerFonts() {
  if (fontsRegistered) return
  fontsRegistered = true
  for (const [file, family] of [
    ['Poppins-Bold.ttf', 'Poppins'],
    ['Poppins-SemiBold.ttf', 'Poppins'],
    ['Poppins-Medium.ttf', 'Poppins'],
    ['Poppins-Regular.ttf', 'Poppins'],
  ] as [string, string][]) {
    try {
      const p = path.join(process.cwd(), 'fonts', file)
      if (fs.existsSync(p)) GlobalFonts.registerFromPath(p, family)
    } catch {}
  }
}

// ─── Text utilities ──────────────────────────────────────────────────────────

function font(weight: string, size: number, family: string = FONT): string {
  return `${weight} ${Math.round(size)}px "${family}"`
}

function hardBreakWord(ctx: SKRSContext2D, word: string, maxWidth: number): string[] {
  const chunks: string[] = []
  let cur = ''
  for (const ch of word) {
    const cand = cur + ch
    if (ctx.measureText(cand).width > maxWidth && cur) { chunks.push(cur); cur = ch }
    else cur = cand
  }
  if (cur) chunks.push(cur)
  return chunks
}

function wrapText(ctx: SKRSContext2D, text: string, maxWidth: number): string[] {
  const words = String(text ?? '').split(/\s+/).filter(Boolean)
  if (!words.length) return ['']
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    if (ctx.measureText(word).width > maxWidth) {
      if (current) { lines.push(current); current = '' }
      const pieces = hardBreakWord(ctx, word, maxWidth)
      for (let i = 0; i < pieces.length - 1; i++) lines.push(pieces[i])
      current = pieces[pieces.length - 1] || ''
      continue
    }
    const candidate = current ? `${current} ${word}` : word
    if (ctx.measureText(candidate).width <= maxWidth || !current) current = candidate
    else { lines.push(current); current = word }
  }
  if (current) lines.push(current)
  return lines
}

function fitText(
  ctx: SKRSContext2D,
  text: string,
  opts: { weight: string; startSize: number; minSize: number; maxWidth: number; maxHeight: number; lineHeightRatio: number; family?: string },
): { size: number; lines: string[]; lineHeight: number } {
  const family = opts.family ?? FONT
  let size = opts.startSize
  while (size > opts.minSize) {
    ctx.font = font(opts.weight, size, family)
    const lines = wrapText(ctx, text, opts.maxWidth)
    if (lines.length * size * opts.lineHeightRatio <= opts.maxHeight) return { size, lines, lineHeight: size * opts.lineHeightRatio }
    size -= 2
  }
  ctx.font = font(opts.weight, opts.minSize, family)
  return { size: opts.minSize, lines: wrapText(ctx, text, opts.maxWidth), lineHeight: opts.minSize * opts.lineHeightRatio }
}

function drawLines(ctx: SKRSContext2D, lines: string[], x: number, yTop: number, lineHeight: number, align: CanvasTextAlign = 'left'): number {
  ctx.textAlign = align
  ctx.textBaseline = 'alphabetic'
  let y = yTop + lineHeight * 0.8
  for (const line of lines) { ctx.fillText(line, x, y); y += lineHeight }
  return yTop + lines.length * lineHeight
}

// ─── Mixed-weight title (parse **bold** markers) ──────────────────────────────

interface Seg { text: string; bold: boolean }

function parseMixedTitle(title: string): Seg[] {
  return title.split(/\*\*(.*?)\*\*/g)
    .map((t, i) => ({ text: t, bold: i % 2 === 1 }))
    .filter(s => s.text.length > 0)
}

/** Draw a title that may contain **bold** markers. Bold segments → saffron bold. */
function drawMixedTitle(
  ctx: SKRSContext2D,
  title: string,
  x: number,
  startY: number,
  maxW: number,
  size: number,
  hasImage: boolean,
  align: 'left' | 'center' = 'left',
): number {
  const segs = parseMixedTitle(title)
  const baseColor = hasImage ? BEAUTIFIO.white : BEAUTIFIO.primary
  const lh = size * 1.2

  // Build word-list with segment membership
  interface Word { text: string; bold: boolean; spaceAfter: boolean }
  const words: Word[] = []
  for (const seg of segs) {
    const ws = seg.text.split(/(\s+)/)
    for (let i = 0; i < ws.length; i++) {
      const t = ws[i]
      if (!t) continue
      if (/^\s+$/.test(t)) { if (words.length) words[words.length - 1].spaceAfter = true }
      else words.push({ text: t, bold: seg.bold, spaceAfter: false })
    }
  }

  // Wrap into lines
  const lines: Word[][] = []
  let curLine: Word[] = []
  let curW = 0
  for (const w of words) {
    ctx.font = font(w.bold ? WEIGHT.bold : WEIGHT.regular, size, FONT)
    const wW = ctx.measureText(w.text + (w.spaceAfter ? ' ' : '')).width
    if (curW + wW > maxW && curLine.length) { lines.push(curLine); curLine = []; curW = 0 }
    curLine.push(w); curW += wW
  }
  if (curLine.length) lines.push(curLine)

  ctx.textBaseline = 'alphabetic'
  let y = startY + lh * 0.8
  for (const line of lines) {
    // Measure line total width for centering
    let lineW = 0
    for (const w of line) {
      ctx.font = font(w.bold ? WEIGHT.bold : WEIGHT.regular, size, FONT)
      lineW += ctx.measureText(w.text + (w.spaceAfter ? ' ' : '')).width
    }
    let drawX = align === 'center' ? x - lineW / 2 : x
    for (const w of line) {
      ctx.font = font(w.bold ? WEIGHT.bold : WEIGHT.regular, size, FONT)
      ctx.fillStyle = w.bold ? BEAUTIFIO.accent : baseColor
      const t = w.text + (w.spaceAfter ? ' ' : '')
      ctx.textAlign = 'left'
      ctx.fillText(t, drawX, y)
      drawX += ctx.measureText(t).width
    }
    y += lh
  }
  return startY + lines.length * lh
}

// ─── Background helpers ──────────────────────────────────────────────────────

/** Peacock vertical gradient: lighter top → darker bottom */
function drawPeacockGradient(ctx: SKRSContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#0d5e8a')
  g.addColorStop(1, '#052e45')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

/** Two-tone horizontal split */
function drawSplitBg(ctx: SKRSContext2D, w: number, h: number, topColor: string, bottomColor: string, splitRatio = 0.55) {
  const sy = Math.round(h * splitRatio)
  ctx.fillStyle = topColor;  ctx.fillRect(0, 0, w, sy)
  ctx.fillStyle = bottomColor; ctx.fillRect(0, sy, w, h - sy)
}

/** 8px saffron vertical strip on left edge */
function drawSaffronLeftStrip(ctx: SKRSContext2D, h: number) {
  ctx.fillStyle = BEAUTIFIO.accent
  ctx.fillRect(0, 0, 8, h)
}

/** 8px saffron vertical strip on right edge */
function drawSaffronRightStrip(ctx: SKRSContext2D, w: number, h: number) {
  ctx.fillStyle = BEAUTIFIO.accent
  ctx.fillRect(w - 8, 0, 8, h)
}

/** Thin ICY SKY horizontal decorative line */
function drawIcyLine(ctx: SKRSContext2D, cx: number, y: number, len = 130) {
  ctx.strokeStyle = BEAUTIFIO.secondary
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(cx - len / 2, y)
  ctx.lineTo(cx + len / 2, y)
  ctx.stroke()
}

// ─── Image helpers ───────────────────────────────────────────────────────────

async function loadSlideImage(slide: SlideContent): Promise<Image | null> {
  if ((slide as any).imagePath && fs.existsSync((slide as any).imagePath)) {
    try { return await loadImage((slide as any).imagePath) } catch {}
  }
  return null
}

/** Draw image cover-cropped into top region [0..regionH], bias NORTH (15%). */
function drawImageTop(ctx: SKRSContext2D, img: Image, w: number, regionH: number) {
  const scale = Math.max(w / img.width, regionH / img.height)
  const dw = img.width * scale, dh = img.height * scale
  const dx = (w - dw) / 2
  const dy = (regionH - dh) * 0.15   // 15% from top — keeps faces visible
  ctx.save()
  ctx.beginPath(); ctx.rect(0, 0, w, regionH); ctx.clip()
  ctx.drawImage(img, dx, dy, dw, dh)
  ctx.restore()
}

/** Draw image cover-cropped into arbitrary region with north bias */
function drawImageInRegion(ctx: SKRSContext2D, img: Image, rx: number, ry: number, rw: number, rh: number) {
  const scale = Math.max(rw / img.width, rh / img.height)
  const dw = img.width * scale, dh = img.height * scale
  const dx = rx + (rw - dw) / 2
  const dy = ry + (rh - dh) * 0.15
  ctx.save()
  ctx.beginPath(); ctx.rect(rx, ry, rw, rh); ctx.clip()
  ctx.drawImage(img, dx, dy, dw, dh)
  ctx.restore()
}

function drawImageFull(ctx: SKRSContext2D, img: Image, w: number, h: number) {
  const scale = Math.max(w / img.width, h / img.height)
  ctx.drawImage(img, (w - img.width * scale) / 2, (h - img.height * scale) / 2, img.width * scale, img.height * scale)
}

// ─── Branding helpers ────────────────────────────────────────────────────────

/** Logo always at top-left (brief: logo top-left on every slide) */
async function drawLogoTopLeft(ctx: SKRSContext2D, dc: SlideDesignCtx) {
  if (!dc.logoUrl || dc.logoPosition === 'none') return
  try {
    const img = await loadImage(dc.logoUrl)
    const maxH = 44, maxW = 140
    const scale = Math.min(maxH / img.height, maxW / img.width)
    const lW = img.width * scale, lH = img.height * scale
    ctx.globalAlpha = 0.88
    ctx.drawImage(img, PAD_X, 36, lW, lH)
    ctx.globalAlpha = 1
  } catch {}
}

/** Handle @beautifio.space always bottom-right */
function drawHandle(ctx: SKRSContext2D, w: number, h: number, handle: string) {
  ctx.fillStyle = BEAUTIFIO.muted
  ctx.font = font(WEIGHT.regular, 20, FONT)
  ctx.textAlign = 'right'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(handle || '@beautifio.space', w - PAD_X, h - 36)
  ctx.textAlign = 'left'
}

/** "swipe →" hint for non-last slides */
function drawSwipeHint(ctx: SKRSContext2D, w: number, h: number, onDark: boolean) {
  ctx.fillStyle = onDark ? 'rgba(255,255,255,0.35)' : 'rgba(8,68,99,0.30)'
  ctx.font = font(WEIGHT.regular, 18, FONT)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('swipe →', PAD_X, h - 36)
  ctx.textAlign = 'left'
}

// ─── Layout selector ─────────────────────────────────────────────────────────

type LayoutType =
  | 'L1_COVER'
  | 'L2_CENTER_IMG'
  | 'L3_RIGHT_TEXT'
  | 'L4_TEXT_HEAVY'
  | 'L5_TEXT_ONLY'
  | 'L6_STAT'
  | 'L7_BOLD_STATEMENT'
  | 'L8_QUOTE'
  | 'L9_CTA'
  | 'L_GRID4'

function pickRotating<T>(options: T[], index: number): T {
  return options[Math.abs(index) % options.length]
}

function selectLayout(slide: SlideContent, slideIndex: number): LayoutType {
  const hasImage = !!(slide as any).imagePath
  const bulletCount = slide.bullets?.length || 0

  if (slideIndex === 0 || slide.type === 'cover') return 'L1_COVER'
  if (slide.type === 'cta') return 'L9_CTA'
  if (slide.type === 'stat') return 'L6_STAT'
  if (slide.type === 'quote') return 'L8_QUOTE'
  if (slide.type === 'grid4') return 'L_GRID4'

  if (slide.type === 'profile') {
    if (hasImage) return pickRotating(['L2_CENTER_IMG', 'L3_RIGHT_TEXT', 'L4_TEXT_HEAVY'] as LayoutType[], slideIndex)
    return pickRotating(['L5_TEXT_ONLY', 'L7_BOLD_STATEMENT'] as LayoutType[], slideIndex)
  }

  // bullets
  if (hasImage) {
    if (bulletCount <= 3) return pickRotating(['L2_CENTER_IMG', 'L3_RIGHT_TEXT'] as LayoutType[], slideIndex)
    return 'L4_TEXT_HEAVY'
  }
  return pickRotating(['L5_TEXT_ONLY', 'L7_BOLD_STATEMENT'] as LayoutType[], slideIndex)
}

// ─── Layout 1: COVER ─────────────────────────────────────────────────────────
// Peacock gradient bg · image bottom-right · title top-left · mixed weight

async function renderL1Cover(ctx: SKRSContext2D, slide: SlideContent, dc: SlideDesignCtx, handle: string, slideIndex: number, total: number) {
  const W = dc.W, H = dc.H

  // Background: peacock gradient
  drawPeacockGradient(ctx, W, H)

  // Image — bottom-right quadrant, 44% height, 60% width
  const img = await loadSlideImage(slide)
  const imgW = Math.round(W * 0.60)
  const imgH = Math.round(H * 0.44)
  if (img) {
    drawImageInRegion(ctx, img, W - imgW, H - imgH, imgW, imgH)
    // Gradient fade to blend image into bg
    const fade = ctx.createLinearGradient(W - imgW - 40, 0, W - imgW + 60, 0)
    fade.addColorStop(0, '#052e45')
    fade.addColorStop(1, 'rgba(5,46,69,0)')
    ctx.fillStyle = fade
    ctx.fillRect(W - imgW - 40, H - imgH, 100, imgH)
    // Bottom fade
    const fadeB = ctx.createLinearGradient(0, H - imgH - 20, 0, H - imgH + 80)
    fadeB.addColorStop(0, '#052e45')
    fadeB.addColorStop(1, 'rgba(5,46,69,0)')
    ctx.fillStyle = fadeB
    ctx.fillRect(W - imgW, H - imgH - 20, imgW, 100)
  }

  // Saffron accent corner bar (top-right strip 4px)
  ctx.fillStyle = BEAUTIFIO.accent
  ctx.fillRect(W - 4, 0, 4, Math.round(H * 0.3))

  // Logo top-left
  await drawLogoTopLeft(ctx, dc)

  // Title — top-left, mixed weight, large
  const titleSize = 68
  const titleMaxW = Math.round(W * 0.70)
  const titleTopY = dc.logoUrl && dc.logoPosition !== 'none' ? 116 : 72

  const titleBottom = drawMixedTitle(ctx, slide.title || '', PAD_X, titleTopY, titleMaxW, titleSize, true, 'left')

  // Subtitle
  if (slide.subtitle) {
    ctx.fillStyle = BEAUTIFIO.white
    ctx.font = font(WEIGHT.regular, 28, FONT)
    ctx.globalAlpha = 0.85
    const subLines = wrapText(ctx, slide.subtitle, titleMaxW)
    drawLines(ctx, subLines, PAD_X, titleBottom + 16, 28 * 1.3, 'left')
    ctx.globalAlpha = 1
  }

  // Handle + swipe
  drawHandle(ctx, W, H, handle)
  if (slideIndex < total - 1) drawSwipeHint(ctx, W, H, true)
}

// ─── Layout 2: CENTER IMAGE ───────────────────────────────────────────────────
// Cloud white top / peacock bottom split · image bottom center · title top center

async function renderL2CenterImg(ctx: SKRSContext2D, slide: SlideContent, dc: SlideDesignCtx, handle: string, slideIndex: number, total: number) {
  const W = dc.W, H = dc.H
  const bullets = slide.bullets || []
  const hasManyBullets = bullets.length > 3

  const splitRatio = hasManyBullets ? 0.45 : 0.50
  drawSplitBg(ctx, W, H, BEAUTIFIO.bg, BEAUTIFIO.primary, splitRatio)

  // ICY SKY divider line
  const splitY = Math.round(H * splitRatio)
  ctx.strokeStyle = BEAUTIFIO.secondary
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(PAD_X, splitY); ctx.lineTo(W - PAD_X, splitY); ctx.stroke()

  // Image — bottom half, centered
  const img = await loadSlideImage(slide)
  if (img) {
    const imgAreaH = H - splitY
    drawImageInRegion(ctx, img, 0, splitY, W, imgAreaH)
    // Top fade on image
    const fade = ctx.createLinearGradient(0, splitY, 0, splitY + 80)
    fade.addColorStop(0, BEAUTIFIO.primary)
    fade.addColorStop(1, 'rgba(8,68,99,0)')
    ctx.fillStyle = fade
    ctx.fillRect(0, splitY, W, 80)
  }

  // Logo top-left
  await drawLogoTopLeft(ctx, dc)

  const contentW = W - PAD_X * 2
  const titleTopY = dc.logoUrl && dc.logoPosition !== 'none' ? 108 : 64
  const titleSize = hasManyBullets ? 44 : 52

  // Title — centered, PEACOCK on white bg
  const titleFit = fitText(ctx, slide.title || '', {
    weight: WEIGHT.semibold, startSize: titleSize, minSize: 36,
    maxWidth: contentW, maxHeight: splitY * 0.35, lineHeightRatio: 1.2, family: FONT
  })
  ctx.fillStyle = BEAUTIFIO.primary
  ctx.font = font(WEIGHT.semibold, titleFit.size, FONT)
  let y = drawLines(ctx, titleFit.lines, W / 2, titleTopY, titleFit.lineHeight, 'center') + 20

  // Bullets (on white bg area)
  if (bullets.length) {
    const bSize = hasManyBullets ? 26 : 29
    const bLH = bSize * 1.4
    const available = splitY - y - 24
    const bFit = fitText(ctx, bullets[0], { weight: WEIGHT.regular, startSize: bSize, minSize: 22, maxWidth: contentW - 40, maxHeight: available / Math.max(1, bullets.length), lineHeightRatio: 1.4 })
    for (const b of bullets) {
      if (y + bFit.lineHeight > splitY - 20) break
      // Saffron dot
      ctx.fillStyle = BEAUTIFIO.accent
      const sq = Math.max(7, bFit.size * 0.33)
      ctx.fillRect(PAD_X, y + bFit.lineHeight * 0.45, sq, sq)
      ctx.fillStyle = BEAUTIFIO.dark
      ctx.font = font(WEIGHT.regular, bFit.size, FONT)
      const lines = wrapText(ctx, b, contentW - 40)
      y = drawLines(ctx, lines, PAD_X + 32, y, bFit.lineHeight, 'left') + 8
    }
  }

  drawHandle(ctx, W, H, handle)
  if (slideIndex < total - 1) drawSwipeHint(ctx, W, H, false)
}

// ─── Layout 3: RIGHT-ALIGNED TEXT ────────────────────────────────────────────
// Cloud white bg + saffron right edge strip · image bottom-left · title top-right

async function renderL3RightAligned(ctx: SKRSContext2D, slide: SlideContent, dc: SlideDesignCtx, handle: string, slideIndex: number, total: number) {
  const W = dc.W, H = dc.H
  const bullets = slide.bullets || []

  ctx.fillStyle = BEAUTIFIO.bg
  ctx.fillRect(0, 0, W, H)
  drawSaffronRightStrip(ctx, W, H)

  // Image — bottom-left, 45% width, 42% height
  const img = await loadSlideImage(slide)
  const imgW = Math.round(W * 0.45)
  const imgH = Math.round(H * 0.42)
  if (img) {
    drawImageInRegion(ctx, img, 0, H - imgH, imgW, imgH)
    // Right fade on image
    const fade = ctx.createLinearGradient(imgW - 60, 0, imgW + 20, 0)
    fade.addColorStop(0, 'rgba(248,250,252,0)')
    fade.addColorStop(1, BEAUTIFIO.bg)
    ctx.fillStyle = fade
    ctx.fillRect(imgW - 60, H - imgH, 80, imgH)
  }

  // Logo top-left
  await drawLogoTopLeft(ctx, dc)

  const contentW = Math.round(W * 0.62)
  const textX = W - PAD_X
  const titleTopY = dc.logoUrl && dc.logoPosition !== 'none' ? 108 : 64

  // Title — right-aligned, PEACOCK
  const titleFit = fitText(ctx, slide.title || '', {
    weight: WEIGHT.bold, startSize: 52, minSize: 36,
    maxWidth: contentW, maxHeight: 240, lineHeightRatio: 1.15, family: FONT
  })
  ctx.fillStyle = BEAUTIFIO.primary
  ctx.font = font(WEIGHT.bold, titleFit.size, FONT)
  let y = drawLines(ctx, titleFit.lines, textX, titleTopY, titleFit.lineHeight, 'right') + 24

  // Saffron accent line under title
  ctx.fillStyle = BEAUTIFIO.accent
  ctx.fillRect(W - PAD_X - 80, y, 80, 3)
  y += 20

  // Bullets — right-aligned, deep slate
  if (bullets.length) {
    const bSize = bullets.length > 3 ? 25 : 28
    const bLH = bSize * 1.45
    for (const b of bullets) {
      if (y + bLH > H - imgH - 20) break
      ctx.font = font(WEIGHT.regular, bSize, FONT)
      const lines = wrapText(ctx, b, contentW - 20)
      ctx.fillStyle = BEAUTIFIO.dark
      y = drawLines(ctx, lines, textX, y, bLH, 'right') + 10
    }
  }

  drawHandle(ctx, W, H, handle)
  if (slideIndex < total - 1) drawSwipeHint(ctx, W, H, false)
}

// ─── Layout 4: TEXT-HEAVY ─────────────────────────────────────────────────────
// Cloud white bg + icy sky top accent bar · image bottom-left (smaller) · lots of text

async function renderL4TextHeavy(ctx: SKRSContext2D, slide: SlideContent, dc: SlideDesignCtx, handle: string, slideIndex: number, total: number) {
  const W = dc.W, H = dc.H
  const bullets = slide.bullets || []

  ctx.fillStyle = BEAUTIFIO.bg
  ctx.fillRect(0, 0, W, H)

  // Icy sky top accent bar
  ctx.fillStyle = BEAUTIFIO.secondary
  ctx.fillRect(0, 0, W, 6)

  // Image — bottom-left, smaller (32% width, 35% height)
  const img = await loadSlideImage(slide)
  const imgW = Math.round(W * 0.40)
  const imgH = Math.round(H * 0.36)
  if (img) {
    drawImageInRegion(ctx, img, 0, H - imgH, imgW, imgH)
    const fade = ctx.createLinearGradient(imgW - 50, 0, imgW + 30, 0)
    fade.addColorStop(0, 'rgba(248,250,252,0)')
    fade.addColorStop(1, BEAUTIFIO.bg)
    ctx.fillStyle = fade
    ctx.fillRect(imgW - 50, H - imgH, 80, imgH)
    const fadeB = ctx.createLinearGradient(0, H - imgH - 20, 0, H - imgH + 60)
    fadeB.addColorStop(0, BEAUTIFIO.bg)
    fadeB.addColorStop(1, 'rgba(248,250,252,0)')
    ctx.fillStyle = fadeB
    ctx.fillRect(0, H - imgH - 20, imgW, 80)
  }

  // Logo top-left
  await drawLogoTopLeft(ctx, dc)

  const contentW = W - PAD_X * 2
  const titleTopY = dc.logoUrl && dc.logoPosition !== 'none' ? 106 : 64

  // Title — left, PEACOCK
  const titleFit = fitText(ctx, slide.title || '', {
    weight: WEIGHT.semibold, startSize: 50, minSize: 34,
    maxWidth: contentW, maxHeight: 200, lineHeightRatio: 1.15, family: FONT
  })
  ctx.fillStyle = BEAUTIFIO.primary
  ctx.font = font(WEIGHT.semibold, titleFit.size, FONT)
  let y = drawLines(ctx, titleFit.lines, PAD_X, titleTopY, titleFit.lineHeight, 'left') + 20

  // Bullets
  const maxY = img ? H - imgH - 16 : H - 80
  const bSize = bullets.length > 4 ? 24 : 27
  const bLH = bSize * 1.4
  for (const b of bullets) {
    if (y + bLH > maxY) break
    ctx.fillStyle = BEAUTIFIO.accent
    const sq = Math.max(7, bSize * 0.32)
    ctx.fillRect(PAD_X, y + bLH * 0.42, sq, sq)
    ctx.fillStyle = BEAUTIFIO.dark
    ctx.font = font(WEIGHT.regular, bSize, FONT)
    const lines = wrapText(ctx, b, contentW - 36)
    y = drawLines(ctx, lines, PAD_X + 30, y, bLH, 'left') + 8
  }

  drawHandle(ctx, W, H, handle)
  if (slideIndex < total - 1) drawSwipeHint(ctx, W, H, false)
}

// ─── Layout 5: TEXT-ONLY CENTER ───────────────────────────────────────────────
// Cloud white + 8px saffron left strip · no image · text centered

async function renderL5TextOnly(ctx: SKRSContext2D, slide: SlideContent, dc: SlideDesignCtx, handle: string, slideIndex: number, total: number) {
  const W = dc.W, H = dc.H
  const bullets = slide.bullets || []

  ctx.fillStyle = BEAUTIFIO.bg
  ctx.fillRect(0, 0, W, H)
  drawSaffronLeftStrip(ctx, H)

  // Subtle cloud-white → icy-sky-very-light gradient
  const grad = ctx.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0, '#F8FAFC')
  grad.addColorStop(1, '#EAF5FB')
  ctx.fillStyle = grad
  ctx.fillRect(8, 0, W - 8, H)

  // Logo top-left
  await drawLogoTopLeft(ctx, dc)

  const contentW = W - PAD_X * 2
  const titleTopY = dc.logoUrl && dc.logoPosition !== 'none' ? 108 : 70

  // Measure total content height for vertical centering
  const titleFit = fitText(ctx, slide.title || '', {
    weight: WEIGHT.bold, startSize: 58, minSize: 38,
    maxWidth: contentW, maxHeight: 300, lineHeightRatio: 1.2, family: FONT
  })

  const bSize = bullets.length > 3 ? 26 : 29
  const bLH = bSize * 1.45
  let totalBH = 0
  const bulletLines: string[][] = []
  for (const b of bullets) {
    ctx.font = font(WEIGHT.regular, bSize, FONT)
    const lines = wrapText(ctx, b, contentW - 36)
    bulletLines.push(lines)
    totalBH += lines.length * bLH + 10
  }

  const titleH = titleFit.lines.length * titleFit.lineHeight
  const gap = 32
  const totalH = titleH + gap + totalBH
  const startY = Math.max(titleTopY, (H - totalH) / 2)

  // Title — PEACOCK bold
  ctx.fillStyle = BEAUTIFIO.primary
  ctx.font = font(WEIGHT.bold, titleFit.size, FONT)
  let y = drawLines(ctx, titleFit.lines, W / 2, startY, titleFit.lineHeight, 'center') + gap

  // Bullets
  for (let i = 0; i < bulletLines.length; i++) {
    const lines = bulletLines[i]
    ctx.fillStyle = BEAUTIFIO.accent
    const sq = Math.max(7, bSize * 0.32)
    ctx.fillRect(PAD_X, y + bLH * 0.42, sq, sq)
    ctx.fillStyle = BEAUTIFIO.dark
    ctx.font = font(WEIGHT.regular, bSize, FONT)
    y = drawLines(ctx, lines, PAD_X + 32, y, bLH, 'left') + 10
  }

  drawHandle(ctx, W, H, handle)
  if (slideIndex < total - 1) drawSwipeHint(ctx, W, H, false)
}

// ─── Layout 6: STAT ───────────────────────────────────────────────────────────
// Peacock solid · huge saffron number · icy sky deco lines

async function renderL6Stat(ctx: SKRSContext2D, slide: SlideContent, dc: SlideDesignCtx, handle: string) {
  const W = dc.W, H = dc.H
  drawPeacockGradient(ctx, W, H)

  await drawLogoTopLeft(ctx, dc)

  const stats = slide.stats || []
  if (!stats.length) { drawHandle(ctx, W, H, handle); return }

  const cx = W / 2
  const numSize = 160
  const labelSize = 34
  const blockGap = 64

  const blocks = stats.map(s => {
    ctx.font = font(WEIGHT.regular, labelSize, FONT)
    const labelLines = wrapText(ctx, s.label, W - PAD_X * 2)
    const h = 36 + numSize * 1.05 + 36 + labelLines.length * labelSize * 1.3
    return { s, labelLines, h }
  })

  const totalH = blocks.reduce((a, b) => a + b.h, 0) + blockGap * (blocks.length - 1)
  let y = Math.max(PAD_TOP + 60, (H - totalH) / 2)
  ctx.textAlign = 'center'

  for (const block of blocks) {
    drawIcyLine(ctx, cx, y)
    y += 36

    ctx.fillStyle = BEAUTIFIO.accent
    ctx.font = font(WEIGHT.bold, numSize, FONT)
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(block.s.value, cx, y + numSize * 0.82)
    y += numSize * 1.05

    drawIcyLine(ctx, cx, y)
    y += 36

    ctx.fillStyle = BEAUTIFIO.white
    ctx.font = font(WEIGHT.regular, labelSize, FONT)
    y = drawLines(ctx, block.labelLines, cx, y, labelSize * 1.3, 'center')
    y += blockGap
  }

  ctx.textAlign = 'left'
  drawHandle(ctx, W, H, handle)
}

// ─── Layout 7: BOLD STATEMENT ─────────────────────────────────────────────────
// Peacock solid · big mixed-weight title · optional CTA pill button

async function renderL7BoldStatement(ctx: SKRSContext2D, slide: SlideContent, dc: SlideDesignCtx, handle: string, slideIndex: number, total: number) {
  const W = dc.W, H = dc.H
  const bullets = slide.bullets || []

  drawPeacockGradient(ctx, W, H)

  await drawLogoTopLeft(ctx, dc)

  const contentW = W - PAD_X * 2
  const titleTopY = dc.logoUrl && dc.logoPosition !== 'none' ? 108 : 70

  // Mixed-weight title — big, centered
  const titleSize = 60
  const titleBottom = drawMixedTitle(ctx, slide.title || '', W / 2, titleTopY, contentW, titleSize, true, 'center')

  let y = titleBottom + 32

  // Bullets (WHITE text, saffron dots) if any
  if (bullets.length) {
    const bSize = 28, bLH = bSize * 1.45
    for (const b of bullets) {
      ctx.fillStyle = BEAUTIFIO.accent
      const sq = Math.max(7, bSize * 0.32)
      ctx.fillRect(PAD_X, y + bLH * 0.42, sq, sq)
      ctx.fillStyle = BEAUTIFIO.white
      ctx.font = font(WEIGHT.regular, bSize, FONT)
      const lines = wrapText(ctx, b, contentW - 36)
      y = drawLines(ctx, lines, PAD_X + 32, y, bLH, 'left') + 10
    }
    y += 24
  }

  // ICY SKY pill "CTA" button
  const btnText = 'Baca selengkapnya →'
  ctx.font = font(WEIGHT.medium, 24, FONT)
  const btnW = ctx.measureText(btnText).width + 48
  const btnH = 48
  const btnX = W / 2 - btnW / 2
  const btnY = Math.max(y, H - 220)

  ctx.fillStyle = BEAUTIFIO.secondary
  ctx.beginPath()
  ctx.roundRect?.(btnX, btnY, btnW, btnH, 24) ?? (() => {
    ctx.rect(btnX, btnY, btnW, btnH)
  })()
  ctx.fill()

  ctx.fillStyle = BEAUTIFIO.dark
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(btnText, W / 2, btnY + btnH / 2)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  drawHandle(ctx, W, H, handle)
  if (slideIndex < total - 1) drawSwipeHint(ctx, W, H, true)
}

// ─── Layout 8: QUOTE ──────────────────────────────────────────────────────────
// Deep slate · saffron thin top line · large quote mark · centered text

async function renderL8Quote(ctx: SKRSContext2D, slide: SlideContent, dc: SlideDesignCtx, handle: string) {
  const W = dc.W, H = dc.H

  ctx.fillStyle = BEAUTIFIO.dark
  ctx.fillRect(0, 0, W, H)

  // Saffron thin top accent line
  ctx.fillStyle = BEAUTIFIO.accent
  ctx.fillRect(PAD_X, 32, 80, 3)

  await drawLogoTopLeft(ctx, dc)

  const cx = W / 2
  const maxW = W - PAD_X * 2
  const topOffset = dc.logoUrl && dc.logoPosition !== 'none' ? 110 : 80

  // Small circular portrait if image available
  const img = await loadSlideImage(slide)
  let contentTopY = topOffset
  if (img) {
    const d = 160, py = topOffset
    ctx.save()
    ctx.beginPath(); ctx.arc(cx, py + d / 2, d / 2, 0, Math.PI * 2); ctx.clip()
    const scale = Math.max(d / img.width, d / img.height)
    ctx.drawImage(img, cx - img.width * scale / 2, py + d / 2 - img.height * scale / 2, img.width * scale, img.height * scale)
    ctx.restore()
    contentTopY = py + d + 32
  }

  // Quote text fit
  const quoteFit = fitText(ctx, slide.quote || '', {
    weight: WEIGHT.regular, startSize: 44, minSize: 30,
    maxWidth: maxW, maxHeight: H * 0.45, lineHeightRatio: 1.35, family: FONT
  })
  ctx.font = font(WEIGHT.regular, 28, FONT)
  const sourceLines = slide.source ? wrapText(ctx, slide.source, maxW) : []

  const glyphSize = 72
  const glyphH = glyphSize * 0.55
  const quoteH = quoteFit.lines.length * quoteFit.lineHeight
  const sourceH = sourceLines.length ? sourceLines.length * 28 * 1.3 + 36 : 0
  const totalH = glyphH + 20 + quoteH + sourceH
  let y = contentTopY + Math.max(0, (H - contentTopY - totalH) / 2)

  // Large quote mark
  ctx.fillStyle = BEAUTIFIO.accent
  ctx.font = font(WEIGHT.bold, glyphSize, FONT)
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
  ctx.fillText('\u201C', cx, y + glyphSize * 0.72)
  y += glyphH + 20

  // Quote
  ctx.fillStyle = BEAUTIFIO.white
  ctx.font = font(WEIGHT.regular, quoteFit.size, FONT)
  y = drawLines(ctx, quoteFit.lines, cx, y, quoteFit.lineHeight, 'center')

  // Source
  if (sourceLines.length) {
    y += 36
    ctx.fillStyle = BEAUTIFIO.secondary
    ctx.font = font(WEIGHT.regular, 28, FONT)
    drawLines(ctx, sourceLines, cx, y, 28 * 1.3, 'center')
  }

  ctx.textAlign = 'left'
  drawHandle(ctx, W, H, handle)
}

// ─── Layout 9: CTA ────────────────────────────────────────────────────────────
// Peacock gradient · centered headline · logo · #curhatinaja · tagline

async function renderL9CTA(ctx: SKRSContext2D, slide: SlideContent, dc: SlideDesignCtx, handle: string) {
  const W = dc.W, H = dc.H
  drawPeacockGradient(ctx, W, H)

  const cx = W / 2
  const contentW = W - PAD_X * 2

  const textFit = fitText(ctx, slide.text || '', {
    weight: WEIGHT.bold, startSize: 58, minSize: 40,
    maxWidth: contentW, maxHeight: H * 0.38, lineHeightRatio: 1.2, family: FONT
  })

  const handleSize = 28
  const logoH = 56
  const hashSize = 28
  const taglineSize = 22
  const lineGap = 44

  const totalH = 4 + lineGap +
    textFit.lines.length * textFit.lineHeight + 48 +
    handleSize * 1.3 + 32 + logoH + 36 +
    hashSize * 1.2 + 8 + taglineSize * 1.2 * 2

  let y = Math.max(PAD_TOP + 40, (H - totalH) / 2)

  // Saffron accent line
  ctx.strokeStyle = BEAUTIFIO.accent; ctx.lineWidth = 4
  ctx.beginPath(); ctx.moveTo(cx - 70, y); ctx.lineTo(cx + 70, y); ctx.stroke()
  y += lineGap

  // CTA headline — mixed weight
  y = drawMixedTitle(ctx, slide.text || '', cx, y, contentW, textFit.size, true, 'center')
  y += 48

  // Follow handle
  ctx.fillStyle = BEAUTIFIO.white
  ctx.font = font(WEIGHT.semibold, handleSize, FONT)
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
  ctx.fillText(`Follow ${handle || '@beautifio.space'}`, cx, y + handleSize * 0.85)
  y += handleSize * 1.3 + 32

  // Logo
  if (dc.logoUrl && dc.logoPosition !== 'none') {
    try {
      const logo = await loadImage(dc.logoUrl)
      const scale = Math.min(logoH / logo.height, 160 / logo.width)
      const lW = logo.width * scale, lH = logo.height * scale
      ctx.drawImage(logo, cx - lW / 2, y, lW, lH)
      y += lH + 32
    } catch { y += 36 }
  }

  // #curhatinaja
  ctx.fillStyle = BEAUTIFIO.accent
  ctx.font = font(WEIGHT.semibold, hashSize, FONT)
  ctx.textAlign = 'center'
  ctx.fillText('#curhatinaja', cx, y + hashSize * 0.9)
  y += hashSize * 1.2 + 10

  // Tagline
  ctx.fillStyle = BEAUTIFIO.white
  ctx.font = font(WEIGHT.regular, taglineSize, FONT)
  ctx.globalAlpha = 0.85
  ctx.fillText('di sini, kita semua didengerin.', cx, y + taglineSize * 0.9)
  y += taglineSize * 1.2
  ctx.fillText('Ruang Curhat 24/7', cx, y + taglineSize * 0.9)
  ctx.globalAlpha = 1
  ctx.textAlign = 'left'
}

// ─── Grid4 ────────────────────────────────────────────────────────────────────

async function renderGrid4(ctx: SKRSContext2D, slide: SlideContent, dc: SlideDesignCtx, handle: string) {
  const W = dc.W, H = dc.H
  const cards = (slide.cards || []).slice(0, 4)
  const halfW = W / 2, halfH = H / 2

  const quads = [
    { x: 0,     y: 0,     bg: BEAUTIFIO.primary },
    { x: halfW, y: 0,     bg: BEAUTIFIO.dark    },
    { x: 0,     y: halfH, bg: BEAUTIFIO.dark    },
    { x: halfW, y: halfH, bg: BEAUTIFIO.primary },
  ]
  for (const q of quads) { ctx.fillStyle = q.bg; ctx.fillRect(q.x, q.y, halfW, halfH) }

  // Grid lines
  ctx.strokeStyle = BEAUTIFIO.secondary; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(halfW, 0); ctx.lineTo(halfW, H); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(0, halfH); ctx.lineTo(W, halfH); ctx.stroke()

  const pad = 56
  cards.forEach((card, i) => {
    const q = quads[i]
    const innerW = halfW - pad * 2
    const cellH = H / 2

    ctx.font = font(WEIGHT.semibold, 36, FONT)
    const titleLines = wrapText(ctx, card.title || '', innerW).slice(0, 2)
    const titleH = titleLines.length * 36 * 1.15
    ctx.font = font(WEIGHT.regular, 24, FONT)
    const descLines = wrapText(ctx, card.desc || '', innerW).slice(0, 3)
    const descH = descLines.length * 24 * 1.3
    const numH = 36
    const total = numH + 20 + titleH + 12 + descH
    let cy = q.y + (cellH - total) / 2

    ctx.fillStyle = BEAUTIFIO.accent
    ctx.font = font(WEIGHT.bold, 36, FONT)
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
    ctx.fillText(card.num || '', q.x + pad, cy + 36)
    cy += numH + 20

    ctx.fillStyle = BEAUTIFIO.white
    ctx.font = font(WEIGHT.semibold, 36, FONT)
    cy = drawLines(ctx, titleLines, q.x + pad, cy, 36 * 1.15, 'left') + 12

    ctx.fillStyle = BEAUTIFIO.secondary
    ctx.font = font(WEIGHT.regular, 24, FONT)
    drawLines(ctx, descLines, q.x + pad, cy, 24 * 1.3, 'left')
  })

  await drawLogoTopLeft(ctx, dc)
  drawHandle(ctx, W, H, handle)
}

// ─── Screenshot slide (legacy, unchanged) ────────────────────────────────────

async function renderScreenshotSlide(imagePath: string, caption: string): Promise<string> {
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d') as unknown as SKRSContext2D
  registerFonts()

  ctx.fillStyle = BEAUTIFIO.dark
  ctx.fillRect(0, 0, W, H)
  try {
    const img = await loadImage(imagePath)
    const scale = Math.min(W / img.width, (H * 0.85) / img.height)
    const dw = img.width * scale, dh = img.height * scale
    ctx.drawImage(img, (W - dw) / 2, 40, dw, dh)
  } catch {}
  if (caption) {
    ctx.fillStyle = BEAUTIFIO.accent
    ctx.font = font(WEIGHT.semibold, 28, FONT)
    const lines = wrapText(ctx, caption, W - PAD_X * 2)
    drawLines(ctx, lines, PAD_X, H - 120, 28 * 1.3, 'left')
  }
  const out = path.join(TMP, `screenshot-${uuid()}.png`)
  fs.writeFileSync(out, canvas.toBuffer('image/png'))
  return out
}
export { renderScreenshotSlide }

// ─── Video overlay (legacy, unchanged) ───────────────────────────────────────

export async function renderVideoOverlay(text: string, opts: { handle?: string } = {}): Promise<string> {
  void opts
  registerFonts()
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d') as unknown as SKRSContext2D
  const topEnd = H * 0.36
  const g = ctx.createLinearGradient(0, 0, 0, topEnd)
  g.addColorStop(0, 'rgba(19,45,70,0.9)')
  g.addColorStop(0.7, 'rgba(19,45,70,0.5)')
  g.addColorStop(1, 'rgba(19,45,70,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, topEnd)
  const fitted = fitText(ctx, text || '', { weight: WEIGHT.bold, startSize: 48, minSize: 28, maxWidth: W - PAD_X * 2, maxHeight: 280, lineHeightRatio: 1.2, family: FONT })
  ctx.fillStyle = BEAUTIFIO.accent
  ctx.font = font(WEIGHT.bold, fitted.size, FONT)
  drawLines(ctx, fitted.lines, PAD_X, PAD_TOP + 6, fitted.lineHeight, 'left')
  const out = path.join(TMP, `overlay-${uuid()}.png`)
  fs.writeFileSync(out, canvas.toBuffer('image/png'))
  return out
}

// ─── Fallback ────────────────────────────────────────────────────────────────

async function renderFallback(ctx: SKRSContext2D, slide: SlideContent, dc: SlideDesignCtx, handle: string) {
  drawPeacockGradient(ctx, dc.W, dc.H)
  await drawLogoTopLeft(ctx, dc)
  const text = slide.title || slide.text || slide.tag || ''
  const fitted = fitText(ctx, text, { weight: WEIGHT.bold, startSize: 56, minSize: 32, maxWidth: dc.W - PAD_X * 2, maxHeight: dc.H - PAD_TOP * 2, lineHeightRatio: 1.2, family: FONT })
  const blockH = fitted.lines.length * fitted.lineHeight
  const y = Math.max(PAD_TOP, (dc.H - blockH) / 2)
  ctx.fillStyle = BEAUTIFIO.accent
  ctx.font = font(WEIGHT.bold, fitted.size, FONT)
  drawLines(ctx, fitted.lines, dc.W / 2, y, fitted.lineHeight, 'center')
  drawHandle(ctx, dc.W, dc.H, handle)
}

// ─── Flexible renderer (reference-driven slides) ─────────────────────────────

async function renderFlexible(ctx: SKRSContext2D, slide: any, dc: SlideDesignCtx, handle?: string) {
  const imgPos = slide.imagePosition || 'top'
  const imgPct = (slide.imagePercent || 50) / 100

  drawPeacockGradient(ctx, dc.W, dc.H)

  const img = await loadSlideImage(slide)
  if (img && imgPos !== 'none') {
    if (imgPos === 'top') drawImageTop(ctx, img, dc.W, Math.round(dc.H * imgPct))
    else if (imgPos === 'full') { drawImageFull(ctx, img, dc.W, dc.H); ctx.fillStyle = 'rgba(8,68,99,0.5)'; ctx.fillRect(0, 0, dc.W, dc.H) }
  }

  await drawLogoTopLeft(ctx, dc)

  const contentW = dc.W - PAD_X * 2
  let y = imgPos === 'top' ? Math.round(dc.H * imgPct) + 40 : PAD_TOP + 60

  if (slide.title) {
    y = drawMixedTitle(ctx, slide.title, PAD_X, y, contentW, 48, true, 'left') + 28
  }
  if (slide.bullets?.length) {
    const bSize = 28, bLH = bSize * 1.4
    for (const b of slide.bullets) {
      if (y + bLH > dc.H - 80) break
      ctx.fillStyle = BEAUTIFIO.accent; ctx.fillRect(PAD_X, y + bLH * 0.42, 8, 8)
      ctx.fillStyle = BEAUTIFIO.white; ctx.font = font(WEIGHT.regular, bSize, FONT)
      const lines = wrapText(ctx, b, contentW - 36)
      y = drawLines(ctx, lines, PAD_X + 28, y, bLH, 'left') + 8
    }
  }

  drawHandle(ctx, dc.W, dc.H, handle || '@beautifio.space')
}

// ─── Main entrypoint ─────────────────────────────────────────────────────────

export async function renderSlide(
  slide: SlideContent,
  opts: {
    index: number
    total: number
    handle: string
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
  const dc: SlideDesignCtx = {
    W: dW, H: dH,
    colors: COLORS,
    headingFont: FONT,
    bodyFont: FONT,
    logoUrl: opts.design?.logoUrl,
    logoPosition: opts.design?.logoPosition,
  }

  const canvas = createCanvas(dW, dH)
  const ctx = canvas.getContext('2d') as unknown as SKRSContext2D

  const layout = selectLayout(slide, opts.index)

  // Flexible renderer for reference-driven slides
  if ((slide as any).layout && (slide as any).imagePosition) {
    await renderFlexible(ctx, slide, dc, opts.handle)
  } else {
    switch (layout) {
      case 'L1_COVER':
        await renderL1Cover(ctx, slide, dc, opts.handle, opts.index, opts.total)
        break
      case 'L2_CENTER_IMG':
        await renderL2CenterImg(ctx, slide, dc, opts.handle, opts.index, opts.total)
        break
      case 'L3_RIGHT_TEXT':
        await renderL3RightAligned(ctx, slide, dc, opts.handle, opts.index, opts.total)
        break
      case 'L4_TEXT_HEAVY':
        await renderL4TextHeavy(ctx, slide, dc, opts.handle, opts.index, opts.total)
        break
      case 'L5_TEXT_ONLY':
        await renderL5TextOnly(ctx, slide, dc, opts.handle, opts.index, opts.total)
        break
      case 'L6_STAT':
        await renderL6Stat(ctx, slide, dc, opts.handle)
        break
      case 'L7_BOLD_STATEMENT':
        await renderL7BoldStatement(ctx, slide, dc, opts.handle, opts.index, opts.total)
        break
      case 'L8_QUOTE':
        await renderL8Quote(ctx, slide, dc, opts.handle)
        break
      case 'L9_CTA':
        await renderL9CTA(ctx, slide, dc, opts.handle)
        break
      case 'L_GRID4':
        await renderGrid4(ctx, slide, dc, opts.handle)
        break
      default:
        await renderFallback(ctx, slide, dc, opts.handle)
    }
  }

  const outputPath = path.join(TMP, `slide-${uuid()}.png`)
  fs.writeFileSync(outputPath, canvas.toBuffer('image/png'))
  return outputPath
}
