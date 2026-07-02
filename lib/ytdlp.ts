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

export function downloadVideo(url: string): Promise<{ filePath: string; title: string; duration: number }> {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(TMP, `${uuid()}.mp4`)

    let infoRaw = ''
    const info = spawn('yt-dlp', ['--dump-json', '--no-playlist', url])
    info.stdout.on('data', d => infoRaw += d.toString())
    info.on('close', () => {
      let title = 'video', duration = 0
      try { const j = JSON.parse(infoRaw); title = j.title || 'video'; duration = j.duration || 0 } catch {}

      const dl = spawn('yt-dlp', [
        '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        '--merge-output-format', 'mp4',
        '--no-playlist',
        '-o', outputPath,
        url,
      ])
      let stderr = ''
      dl.stderr.on('data', d => stderr += d.toString())
      dl.on('close', code => {
        if (code !== 0 || !fs.existsSync(outputPath))
          return reject(new Error(`yt-dlp failed: ${stderr.slice(-300)}`))
        resolve({ filePath: outputPath, title, duration })
      })
    })
  })
}
