import { spawn } from 'child_process'
import path from 'path'
import { v4 as uuid } from 'uuid'
import fs from 'fs'

const TMP = process.env.TMP_DIR || '/tmp'

// Font paths — Poppins must be in /fonts relative to CWD
function fontPath(variant: 'Bold' | 'SemiBold' | 'Regular') {
  return path.join(process.cwd(), 'fonts', `Poppins-${variant}.ttf`)
}

function hasFonts(): boolean {
  return fs.existsSync(fontPath('Bold'))
}

const SCALE_PAD =
  'scale=1080:1350:force_original_aspect_ratio=decrease,pad=1080:1350:(ow-iw)/2:(oh-ih)/2:color=black'

const SCALE_PAD_916 =
  'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920'

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

function run(args: string[], label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args)
    let stderr = ''
    proc.stderr.on('data', d => (stderr += d.toString()))
    proc.on('close', code =>
      code === 0 ? resolve() : reject(new Error(`FFmpeg ${label} failed: ${stderr.slice(-300)}`)),
    )
  })
}

function hasAudioStream(file: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', file])
    let out = ''
    proc.stdout.on('data', d => (out += d.toString()))
    proc.on('close', () => resolve(out.trim().length > 0))
    proc.on('error', () => resolve(false))
  })
}

const NORM_VF_IMG = 'scale=1080:1350,setsar=1,format=yuv420p,fps=30'
const NORM_VF_VID = `${SCALE_PAD},setsar=1,format=yuv420p,fps=30`

// A single image → a D-second normalized clip with silent stereo audio.
async function imageClip(img: string, sec: number): Promise<string> {
  const out = path.join(TMP, `clip-${uuid()}.mp4`)
  await run(
    [
      '-loop', '1', '-t', String(sec), '-i', img,
      '-f', 'lavfi', '-t', String(sec), '-i', 'anullsrc=r=44100:cl=stereo',
      '-vf', NORM_VF_IMG,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
      '-shortest', '-y', out,
    ],
    'imageClip',
  )
  return out
}

// A video → a normalized 1080x1350 clip that ALWAYS has an audio stream
// (original audio if present, else silence) so concat stays clean.
async function videoClip(video: string): Promise<string> {
  const out = path.join(TMP, `clip-${uuid()}.mp4`)
  const hasAud = await hasAudioStream(video)
  const args = hasAud
    ? [
        '-i', video,
        '-vf', NORM_VF_VID,
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
        '-y', out,
      ]
    : [
        '-i', video,
        '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
        '-map', '0:v', '-map', '1:a',
        '-vf', NORM_VF_VID,
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
        '-shortest', '-y', out,
      ]
  await run(args, 'videoClip')
  return out
}

// Build a Reel that stitches: cover image → video (with its ORIGINAL audio) →
// the remaining slide images. Image parts are silent; the video part keeps its
// sound. All segments are normalized then concatenated.
export async function buildReel(
  coverPath: string,
  videoPath: string,
  restImagePaths: string[],
  opts: { perSlideSec?: number } = {},
): Promise<string> {
  const per = opts.perSlideSec ?? 3
  const clips: string[] = []
  clips.push(await imageClip(coverPath, per))
  clips.push(await videoClip(videoPath))
  for (const img of restImagePaths) clips.push(await imageClip(img, per))

  const out = path.join(TMP, `reel-combined-${uuid()}.mp4`)
  const inputs = clips.flatMap((c) => ['-i', c])
  const filter =
    clips.map((_, i) => `[${i}:v][${i}:a]`).join('') + `concat=n=${clips.length}:v=1:a=1[v][a]`
  await run(
    [
      ...inputs,
      '-filter_complex', filter,
      '-map', '[v]', '-map', '[a]',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30',
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart', '-y', out,
    ],
    'buildReel',
  )
  return out
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
          // Map the composited video + keep the ORIGINAL audio (0:a?, optional).
          '-filter_complex', `[0:v]${SCALE_PAD}[bg];[bg][1:v]overlay=0:0[outv]`,
          '-map', '[outv]',
          '-map', '0:a?',
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

/**
 * Convert a source video (YouTube/TikTok download) to a branded Reels MP4.
 * Pipeline: scale to 9:16 (1080×1920) → add peacock lower-third with
 * Beautifio branding (title, subtitle, handle, hashtag).
 *
 * If Poppins fonts are not available, skips text overlay and just rescales.
 */
export async function brandedReels(
  inputPath: string,
  opts: { title?: string; subtitle?: string; handle?: string; maxSec?: number } = {},
): Promise<string> {
  const { title, subtitle, handle = '@beautifio.space', maxSec = 90 } = opts
  const outputPath = path.join(TMP, `reels-branded-${uuid()}.mp4`)
  const boldFont   = path.join(process.cwd(), 'fonts', 'Poppins-Bold.ttf').replace(/\\/g, '/')
  const semiFont   = path.join(process.cwd(), 'fonts', 'Poppins-SemiBold.ttf').replace(/\\/g, '/')
  const regFont    = path.join(process.cwd(), 'fonts', 'Poppins-Regular.ttf').replace(/\\/g, '/')
  const hasFonts   = fs.existsSync(path.join(process.cwd(), 'fonts', 'Poppins-Bold.ttf'))
  const useFonts   = hasFonts && !!(title || subtitle)

  const filters: string[] = [SCALE_PAD_916]

  if (useFonts) {
    filters.push(`drawbox=y=ih*0.68:w=iw:h=ih*0.32:color=#084463@0.75:t=fill`)
    if (title) {
      const t = title.replace(/'/g, "\\'").replace(/:/g, '\\:').slice(0, 60)
      filters.push(`drawtext=fontfile='${boldFont}':text='${t}':fontcolor=#FFC64F:fontsize=52:x=(w-text_w)/2:y=h*0.72`)
    }
    if (subtitle) {
      const s = subtitle.replace(/'/g, "\\'").replace(/:/g, '\\:').slice(0, 80)
      filters.push(`drawtext=fontfile='${regFont}':text='${s}':fontcolor=#FFFFFF:fontsize=28:x=(w-text_w)/2:y=h*0.80`)
    }
    const h = handle.replace(/'/g, "\\'")
    filters.push(`drawtext=fontfile='${regFont}':text='${h}':fontcolor=#647488:fontsize=24:x=(w-text_w)/2:y=h*0.89`)
    filters.push(`drawtext=fontfile='${semiFont}':text='#curhatinaja':fontcolor=#FFC64F:fontsize=24:x=(w-text_w)/2:y=h*0.93`)
  }

  return new Promise((resolve, reject) => {
    const args = [
      '-i', inputPath,
      '-vf', filters.join(','),
      '-t', String(maxSec),
      '-c:v', 'libx264', '-crf', '23', '-preset', 'fast',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart',
      '-y', outputPath,
    ]
    const proc = spawn('ffmpeg', args)
    let stderr = ''
    proc.stderr.on('data', d => (stderr += d.toString()))
    proc.on('close', code => {
      if (code !== 0) return reject(new Error(`brandedReels failed: ${stderr.slice(-400)}`))
      resolve(outputPath)
    })
  })
}
