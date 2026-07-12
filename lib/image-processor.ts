/**
 * Image preprocessing with sharp — Media-First pipeline.
 * Used before passing source images to the canvas renderer.
 */
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import { v4 as uuid } from 'uuid'

const TMP = process.env.TMP_DIR || '/tmp'

interface ProcessOpts {
  width?: number
  height?: number
  /** Bias-top crop so faces/heads stay visible. Uses sharp position:'north'. */
  cropNorth?: boolean
  /** Lighten dark images slightly (factor > 1 = brighter). */
  brighten?: number
}

/**
 * Preprocess a source image for slide use:
 * - Resize to slide dimensions with cover fit, position:'north' (face-safe crop)
 * - Optional brightness lift for dark photos
 * Returns path to the processed image.
 */
export async function preprocessImage(
  inputPath: string,
  opts: ProcessOpts = {},
): Promise<string> {
  const { width = 1080, height = 1350, cropNorth = true, brighten } = opts

  if (!fs.existsSync(inputPath)) return inputPath

  const outPath = path.join(TMP, `pp-${uuid()}.jpg`)

  try {
    let pipeline = sharp(inputPath)
      .resize(width, height, {
        fit: 'cover',
        position: cropNorth ? 'north' : 'centre',
      })
      .jpeg({ quality: 90 })

    if (brighten && brighten !== 1) {
      pipeline = pipeline.modulate({ brightness: brighten })
    }

    await pipeline.toFile(outPath)
    return outPath
  } catch (e) {
    console.error('[preprocessImage] sharp failed, using original:', e)
    return inputPath
  }
}

/**
 * Auto-detect if an image is dark (average luminance < threshold).
 * Returns a brightness factor to apply, or 1 if no boost needed.
 */
export async function autoBrightness(inputPath: string): Promise<number> {
  if (!fs.existsSync(inputPath)) return 1
  try {
    const { data, info } = await sharp(inputPath)
      .resize(80, 80, { fit: 'fill' })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const pixels = info.width * info.height
    const total = (data as Buffer).reduce((sum, v) => sum + v, 0)
    const avg = total / pixels // 0–255
    if (avg < 60) return 1.25   // very dark → boost 25%
    if (avg < 90) return 1.10   // dark → boost 10%
    return 1
  } catch { return 1 }
}
