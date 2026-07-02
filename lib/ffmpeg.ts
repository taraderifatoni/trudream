import { spawn } from 'child_process'
import path from 'path'
import { v4 as uuid } from 'uuid'

const TMP = process.env.TMP_DIR || '/tmp'

export function processVideo(inputPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(TMP, `reel-${uuid()}.mp4`)
    const args = [
      '-i', inputPath,
      '-vf', 'scale=1080:1350:force_original_aspect_ratio=decrease,pad=1080:1350:(ow-iw)/2:(oh-ih)/2:color=black',
      '-c:v', 'libx264', '-crf', '23', '-preset', 'fast',
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart',
      '-y', outputPath,
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
