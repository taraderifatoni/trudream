const BASE = 'https://graph.facebook.com/v19.0'
const TOKEN = process.env.META_ACCESS_TOKEN
const ACCOUNT = process.env.INSTAGRAM_ACCOUNT_ID

// Best-effort permalink lookup for a published media id.
export async function getPermalink(mediaId: string): Promise<string | undefined> {
  try {
    const r = await fetch(`${BASE}/${mediaId}?fields=permalink&access_token=${TOKEN}`)
    const d = await r.json()
    return d.permalink
  } catch {
    return undefined
  }
}

// Poll a media container until IG finishes processing it (needed for video
// carousel items — images are ready immediately).
async function waitForContainer(id: string, tries = 30, delayMs = 4000, token = TOKEN) {
  for (let i = 0; i < tries; i++) {
    const s = await (await fetch(`${BASE}/${id}?fields=status_code&access_token=${token}`)).json()
    if (s.status_code === 'FINISHED') return
    if (s.status_code === 'ERROR') throw new Error(`Media processing error (${id})`)
    await new Promise(r => setTimeout(r, delayMs))
  }
  throw new Error(`Media ${id} not ready after processing wait`)
}

export async function postCarousel(items: { type: 'image' | 'video'; url: string }[], caption: string, opts?: { token?: string; accountId?: string }) {
  const token = opts?.token ?? TOKEN
  const account = opts?.accountId ?? ACCOUNT
  const ids: string[] = []
  const videoIds: string[] = []
  for (const item of items) {
    const body: any = { access_token: token, is_carousel_item: true }
    if (item.type === 'video') { body.media_type = 'VIDEO'; body.video_url = item.url }
    else { body.image_url = item.url }
    const r = await fetch(`${BASE}/${account}/media`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await r.json()
    if (!d.id) throw new Error(`Container failed: ${JSON.stringify(d)}`)
    ids.push(d.id)
    if (item.type === 'video') videoIds.push(d.id)
  }

  // Video containers must finish processing before the carousel can be built.
  for (const vid of videoIds) await waitForContainer(vid, undefined, undefined, token)

  const carousel = await (await fetch(`${BASE}/${account}/media`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ media_type: 'CAROUSEL', caption, children: ids.join(','), access_token: token }),
  })).json()
  if (!carousel.id) throw new Error(`Carousel failed: ${JSON.stringify(carousel)}`)

  // The carousel container itself needs to finish processing (esp. with video)
  // before it can be published. Poll it, then publish with a retry on the
  // transient "media not ready" (9007) error.
  await waitForContainer(carousel.id, undefined, undefined, token)
  return publishWithRetry(carousel.id, undefined, undefined, token, account)
}

async function publishWithRetry(creationId: string, tries = 12, delayMs = 5000, token = TOKEN, account = ACCOUNT) {
  let last: any = null
  for (let i = 0; i < tries; i++) {
    const res = await (await fetch(`${BASE}/${account}/media_publish`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: creationId, access_token: token }),
    })).json()
    if (res.id) return res
    last = res
    // 9007 = media not ready yet; keep waiting. Any other error → fail fast.
    if (res?.error?.code !== 9007) throw new Error(`Publish failed: ${JSON.stringify(res)}`)
    await new Promise(r => setTimeout(r, delayMs))
  }
  throw new Error(`Publish not ready after retries: ${JSON.stringify(last)}`)
}

export async function postReel(videoUrl: string, caption: string, opts?: { token?: string; accountId?: string }) {
  const token = opts?.token ?? TOKEN
  const account = opts?.accountId ?? ACCOUNT
  const container = await (await fetch(`${BASE}/${account}/media`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ media_type: 'REELS', video_url: videoUrl, caption, access_token: token }),
  })).json()
  if (!container.id) throw new Error(`Reel container failed`)

  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 5000))
    const s = await (await fetch(`${BASE}/${container.id}?fields=status_code&access_token=${token}`)).json()
    if (s.status_code === 'FINISHED') break
    if (s.status_code === 'ERROR') throw new Error('Video processing error')
  }

  return (await fetch(`${BASE}/${account}/media_publish`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: container.id, access_token: token }),
  })).json()
}
