import './globals.css'
import type { Metadata, Viewport } from 'next'
import fs from 'fs'
import path from 'path'

export const metadata: Metadata = {
  title: 'publisio',
  description: 'publisio — AI Carousel Generator',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

// One-time tmp cleanup: delete files older than 2 hours, sweep every 30 min.
function startTmpCleanup() {
  const g = globalThis as typeof globalThis & { __tmpCleanupStarted?: boolean }
  if (g.__tmpCleanupStarted) return
  g.__tmpCleanupStarted = true

  const TMP_DIR = process.env.TMP_DIR || '/tmp'
  const TWO_HOURS = 2 * 60 * 60 * 1000
  const THIRTY_MIN = 30 * 60 * 1000

  const sweep = () => {
    try {
      const now = Date.now()
      const entries = fs.readdirSync(TMP_DIR)
      for (const entry of entries) {
        try {
          const filePath = path.join(TMP_DIR, entry)
          const stat = fs.statSync(filePath)
          if (now - stat.mtimeMs > TWO_HOURS) {
            fs.rmSync(filePath, { recursive: true, force: true })
          }
        } catch {
          // ignore individual file errors
        }
      }
    } catch {
      // ignore directory-level errors
    }
  }

  setInterval(sweep, THIRTY_MIN)
}

startTmpCleanup()

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
