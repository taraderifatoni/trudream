import { spawn } from 'child_process'
import path from 'path'
import { v4 as uuid } from 'uuid'

const TMP = process.env.TMP_DIR || '/tmp'

const SCALE_PAD =
  'scale=1080:1350:force_original_aspect_ratio=decrease,pad=1080:1350:(ow-iw)/2:(oh-ih)/2:color=black'

// Scale/pad the video to 1080x1350. If overlayPath (a 1080x1350 transparent
// PNG with the caption text) is given, burn it on top.
export function processVideo(inputPath: string, overlayPath?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(TMP, `reel-${uuid()}.mp4`)
    const encode = [
      '-c:v', 'libx264', '-crf', '23', '-preset', 'fast',
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart',
      '-y', outputPath,
    ]
    const args = overlayPath
      ? [
          '-i', inputPath,
          '-i', overlayPath,
          '-filter_complex', `[0:v]${SCALE_PAD}[bg];[bg][1:v]overlay=0:0`,
          ...encode,
        ]
      : [
          '-i', inputPath,
          '-vf', SCALE_PAD,
          ...encode,
        ]
    const proc = spawn('ffmpeg', args)
    let stderr = ''
    proc.stderr.on('data', d => stderr += d.toString())
    proc.on('close', code => {
      if (code !== 0) return reject(new Error(`FFmpeg failed: ${stderr.slice(-300)}`))
      resolve(outputPath)
    })
  })
}
