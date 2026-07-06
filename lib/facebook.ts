const BASE = 'https://graph.facebook.com/v19.0'
const TOKEN = process.env.META_ACCESS_TOKEN
const PAGE = process.env.FACEBOOK_PAGE_ID

// Multi-photo feed post to a Facebook Page: upload each image unpublished,
// then create one feed post that attaches all of them (FB's carousel-style
// album post). Uses the same Page access token as Instagram.
export async function postToFacebookPage(imageUrls: string[], caption: string, opts?: { token?: string; pageId?: string }) {
  const token = opts?.token ?? TOKEN
  const page = opts?.pageId ?? PAGE
  if (!page) throw new Error('FACEBOOK_PAGE_ID not set')
  if (imageUrls.length === 0) throw new Error('No images to post to Facebook')

  const fbids: string[] = []
  for (const url of imageUrls) {
    const r = await fetch(`${BASE}/${page}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, published: false, access_token: token }),
    })
    const d = await r.json()
    if (!d.id) throw new Error(`FB photo upload failed: ${JSON.stringify(d)}`)
    fbids.push(d.id)
  }

  const r = await fetch(`${BASE}/${page}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: caption,
      attached_media: fbids.map((id) => ({ media_fbid: id })),
      access_token: token,
    }),
  })
  const d = await r.json()
  if (!d.id) throw new Error(`FB feed post failed: ${JSON.stringify(d)}`)
  return d
}
