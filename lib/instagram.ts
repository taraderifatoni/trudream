const BASE = 'https://graph.facebook.com/v19.0'
const TOKEN = process.env.META_ACCESS_TOKEN
const ACCOUNT = process.env.INSTAGRAM_ACCOUNT_ID

// Poll a media container until IG finishes processing it (needed for video
// carousel items — images are ready immediately).
async function waitForContainer(id: string, tries = 30, delayMs = 4000) {
  for (let i = 0; i < tries; i++) {
    const s = await (await fetch(`${BASE}/${id}?fields=status_code&access_token=${TOKEN}`)).json()
    if (s.status_code === 'FINISHED') return
    if (s.status_code === 'ERROR') throw new Error(`Media processing error (${id})`)
    await new Promise(r => setTimeout(r, delayMs))
  }
  throw new Error(`Media ${id} not ready after processing wait`)
}

export async function postCarousel(items: { type: 'image' | 'video'; url: string }[], caption: string) {
  const ids: string[] = []
  const videoIds: string[] = []
  for (const item of items) {
    const body: any = { access_token: TOKEN, is_carousel_item: true }
    if (item.type === 'video') { body.media_type = 'VIDEO'; body.video_url = item.url }
    else { body.image_url = item.url }
    const r = await fetch(`${BASE}/${ACCOUNT}/media`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await r.json()
    if (!d.id) throw new Error(`Container failed: ${JSON.stringify(d)}`)
    ids.push(d.id)
    if (item.type === 'video') videoIds.push(d.id)
  }

  // Video containers must finish processing before the carousel can be built.
  for (const vid of videoIds) await waitForContainer(vid)

  const carousel = await (await fetch(`${BASE}/${ACCOUNT}/media`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ media_type: 'CAROUSEL', caption, children: ids.join(','), access_token: TOKEN }),
  })).json()
  if (!carousel.id) throw new Error(`Carousel failed: ${JSON.stringify(carousel)}`)

  return (await fetch(`${BASE}/${ACCOUNT}/media_publish`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: carousel.id, access_token: TOKEN }),
  })).json()
}

export async function postReel(videoUrl: string, caption: string) {
  const container = await (await fetch(`${BASE}/${ACCOUNT}/media`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ media_type: 'REELS', video_url: videoUrl, caption, access_token: TOKEN }),
  })).json()
  if (!container.id) throw new Error(`Reel container failed`)

  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 5000))
    const s = await (await fetch(`${BASE}/${container.id}?fields=status_code&access_token=${TOKEN}`)).json()
    if (s.status_code === 'FINISHED') break
    if (s.status_code === 'ERROR') throw new Error('Video processing error')
  }

  return (await fetch(`${BASE}/${ACCOUNT}/media_publish`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: container.id, access_token: TOKEN }),
  })).json()
}
