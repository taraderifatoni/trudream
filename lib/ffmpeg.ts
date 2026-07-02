import { spawn } from 'child_process'
import path from 'path'
import { v4 as uuid } from 'uuid'

const TMP = process.env.TMP_DIR || '/tmp'

const SCALE_PAD =
  'scale=1080:1350:force_original_aspect_ratio=decrease,pad=1080:1350:(ow-iw)/2:(oh-ih)/2:color=black'

// Build a 1080x1350 slideshow video from slide images (each shown perSlideSec).
// Silent stereo audio track is added so IG accepts it as a Reel. Music can be
// mixed in later by swapping the anullsrc input for a real audio file.
export function buildSlideshow(
  imagePaths: string[],
  opts: { perSlideSec?: number; audioPath?: string } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (imagePaths.length === 0) return reject(new Error('No images for slideshow'))
    const per = opts.perSlideSec ?? 3
    const n = imagePaths.length
    const total = per * n
    const outputPath = path.join(TMP, `reel-slideshow-${uuid()}.mp4`)

    const inputs: string[] = []
    for (const img of imagePaths) inputs.push('-loop', '1', '-t', String(per), '-i', img)
    // Audio input (real track looped, or silence).
    if (opts.audioPath) inputs.push('-stream_loop', '-1', '-i', opts.audioPath)
    else inputs.push('-f', 'lavfi', '-t', String(total), '-i', 'anullsrc=r=44100:cl=stereo')
    const audioIdx = n

    const scale = imagePaths
      .map((_, i) => `[${i}:v]scale=1080:1350,setsar=1,format=yuv420p,fps=30[v${i}]`)
      .join(';')
    const concatIn = imagePaths.map((_, i) => `[v${i}]`).join('')
    const filter = `${scale};${concatIn}concat=n=${n}:v=1:a=0[v]`

    const args = [
      ...inputs,
      '-filter_complex', filter,
      '-map', '[v]',
      '-map', `${audioIdx}:a`,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30',
      '-c:a', 'aac', '-b:a', '128k',
      '-t', String(total),
      '-shortest',
      '-movflags', '+faststart',
      '-y', outputPath,
    ]
    const proc = spawn('ffmpeg', args)
    let stderr = ''
    proc.stderr.on('data', d => (stderr += d.toString()))
    proc.on('close', code => {
      if (code !== 0) return reject(new Error(`FFmpeg slideshow failed: ${stderr.slice(-300)}`))
      resolve(outputPath)
    })
  })
}

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
