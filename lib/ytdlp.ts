import { spawn } from 'child_process'
import path from 'path'
import { v4 as uuid } from 'uuid'
import fs from 'fs'

const TMP = process.env.TMP_DIR || '/tmp'

export const VIDEO_PLATFORMS = [
  'youtube.com', 'youtu.be', 'x.com', 'twitter.com',
  'tiktok.com', 'instagram.com', 'facebook.com',
  'fb.com', 'fb.watch', 'reddit.com', 'vimeo.com', 'twitch.tv',
]

export function isVideoUrl(url: string) {
  return VIDEO_PLATFORMS.some(p => url.includes(p))
}

/** Download thumbnail from URL (best quality, largest size). */
async function downloadThumbnail(thumbnailUrl: string): Promise<string | undefined> {
  try {
    const res = await fetch(thumbnailUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'image/*' },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return undefined
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 2000) return undefined
    const p = path.join(TMP, `thumb-${uuid()}.jpg`)
    fs.writeFileSync(p, buf)
    return p
  } catch { return undefined }
}

export function downloadVideo(url: string): Promise<{
  filePath: string
  title: string
  duration: number
  thumbnailPath?: string
  description?: string
}> {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(TMP, `${uuid()}.mp4`)

    // Step 1: get metadata (title, duration, thumbnail)
    let infoRaw = ''
    const info = spawn('yt-dlp', ['--dump-json', '--no-playlist', url])
    info.stdout.on('data', d => (infoRaw += d.toString()))
    info.stderr.on('data', () => {}) // suppress
    info.on('close', async () => {
      let title = 'video', duration = 0, description = ''
      let thumbnailUrl = ''
      try {
        const j = JSON.parse(infoRaw)
        title       = j.title       || 'video'
        duration    = j.duration    || 0
        description = j.description || ''
        // Prefer the largest thumbnail
        const thumbs: Array<{ url: string; width?: number; height?: number }> = j.thumbnails || []
        const best = thumbs.sort((a, b) => ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0)))[0]
        thumbnailUrl = best?.url || j.thumbnail || ''
      } catch {}

      // Step 2: download video
      // Format: single-file MP4 (no ffmpeg merge needed), max 720p
      // Falls back to any best format if no direct MP4 available
      const dl = spawn('yt-dlp', [
        '-f', 'best[height<=720][ext=mp4]/best[height<=720]/best[ext=mp4]/best',
        '--no-playlist',
        '--no-part',
        '-o', outputPath,
        url,
      ])
      let stderr = ''
      dl.stderr.on('data', d => (stderr += d.toString()))
      dl.on('close', async code => {
        // Download thumbnail regardless of video download result
        const thumbnailPath = thumbnailUrl ? await downloadThumbnail(thumbnailUrl) : undefined

        if (code !== 0 || !fs.existsSync(outputPath)) {
          // Video download failed — still return thumbnail + metadata for carousel generation
          if (thumbnailPath) {
            // Return with no filePath so caller knows video failed but thumbnail succeeded
            return resolve({ filePath: '', title, duration: 0, thumbnailPath, description })
          }
          return reject(new Error(`yt-dlp failed: ${stderr.slice(-300)}`))
        }
        resolve({ filePath: outputPath, title, duration, thumbnailPath, description })
      })
    })
  })
}
