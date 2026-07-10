'use client'

import { useState, useEffect, FormEvent, Suspense } from 'react'
import Link from 'next/link'

const L = '#CDF22B'
const B = '#1E45FB'
const G = '#888888'
const W = '#e8e8ec'
const D = '#111118'
const S = '#1a1a26'

function getUserFromCookie() {
  if (typeof document === 'undefined') return null
  try {
    const c = document.cookie.split('; ').find(r => r.startsWith('sb-user='))
    return c ? JSON.parse(decodeURIComponent(c.split('=')[1])) : null
  } catch { return null }
}

function signOutCookie() {
  document.cookie = 'sb-access-token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/'
  document.cookie = 'sb-refresh-token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/'
  document.cookie = 'sb-user=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/'
  window.location.href = '/'
}

const TABS = [
  { id: 'keys', label: 'AI KEYS' },
  { id: 'content', label: 'CONTENT' },
  { id: 'image', label: 'IMAGE STYLE' },
  { id: 'slides', label: 'SLIDES' },
  { id: 'admin', label: 'ADMIN' },
] as const

type TabId = typeof TABS[number]['id']

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 11, color: W, fontWeight: 600 }}>{label}</span>
      {hint ? <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>{hint}</span> : null}
      {children}
    </label>
  )
}

function AdminForm() {
  const [user, setUser] = useState<{email: string} | null>(null)
  const [tab, setTab] = useState<TabId>('keys')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const [geminiKey, setGeminiKey] = useState('')
  const [geminiKey2, setGeminiKey2] = useState('')
  const [geminiKey3, setGeminiKey3] = useState('')
  const [openaiKey, setOpenaiKey] = useState('')
  const [adminEmails, setAdminEmails] = useState('')
  const [contentPrompt, setContentPrompt] = useState('')
  const [imageStyle, setImageStyle] = useState('')
  const [imageStyleVivid, setImageStyleVivid] = useState('')
  const [slideCover, setSlideCover] = useState('')
  const [slideBullets, setSlideBullets] = useState('')
  const [slideStat, setSlideStat] = useState('')
  const [slideGrid4, setSlideGrid4] = useState('')
  const [slideQuote, setSlideQuote] = useState('')
  const [slideCta, setSlideCta] = useState('')
  const [brandLogoUrl, setBrandLogoUrl] = useState('')

  useEffect(() => {
    const u = getUserFromCookie()
    if (!u) { window.location.href = '/auth'; return }
    setUser(u)
    fetch('/api/admin', { credentials: 'include' }).then(async r => {
      if (r.status === 403) { window.location.href = '/playground'; return }
      const d = await r.json()
      if (d && !d.error) {
        setGeminiKey(d.gemini_key || '')
        setGeminiKey2(d.gemini_key_2 || '')
        setGeminiKey3(d.gemini_key_3 || '')
        setOpenaiKey(d.openai_key || '')
        setAdminEmails(d.admin_emails || '')
        setContentPrompt(d.content_prompt || '')
        setImageStyle(d.image_style || '')
        setImageStyleVivid(d.image_style_vivid || '')
        setSlideCover(d.slide_cover_prompt || '')
        setSlideBullets(d.slide_bullets_prompt || '')
        setSlideStat(d.slide_stat_prompt || '')
        setSlideGrid4(d.slide_grid4_prompt || '')
        setSlideQuote(d.slide_quote_prompt || '')
        setSlideCta(d.slide_cta_prompt || '')
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  useEffect(() => { fetch('/api/brand').then(r=>r.json()).then(d=>setBrandLogoUrl(d.logo_url||'')).catch(()=>{}) }, [])

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMsg('')
    try {
      const r = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          gemini_key: geminiKey,
          gemini_key_2: geminiKey2,
          gemini_key_3: geminiKey3,
          openai_key: openaiKey,
          admin_emails: adminEmails,
          content_prompt: contentPrompt,
          image_style: imageStyle,
          image_style_vivid: imageStyleVivid,
          slide_cover_prompt: slideCover,
          slide_bullets_prompt: slideBullets,
          slide_stat_prompt: slideStat,
          slide_grid4_prompt: slideGrid4,
          slide_quote_prompt: slideQuote,
          slide_cta_prompt: slideCta,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Save failed')
      setMsg('✓ Settings saved')
    } catch (e: any) {
      setMsg(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={{minHeight:'100vh',background:D}} />

  return (
    <div style={{ background: D, minHeight: '100vh', color: W, fontFamily: "'IBM Plex Mono','Courier New',monospace", position:'relative', zIndex:2 }}>
      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.2} }
        .pixel { font-family: 'Press Start 2P', monospace; letter-spacing:0; line-height:1.6; }
        .blink { animation: blink 1.2s steps(1) infinite; }
        .abtn { transition: transform .06s ease, box-shadow .06s ease; }
        .abtn:hover:not(:disabled) { transform: translate(-1px,-2px); box-shadow: 4px 4px 0 rgba(205,242,43,0.5); }
        .abtn:active:not(:disabled) { transform: translate(2px,2px); box-shadow: 0px 0px 0 #000; }
        input,textarea { background:#111118; border:1px solid rgba(255,255,255,0.12); color:#e8e8ec; padding:12px 14px; border-radius:10px; font-size:14px; outline:none; font-family:'IBM Plex Mono',monospace; width:100%; box-sizing:border-box; }
        input:focus,textarea:focus { border-color:${L}; }
        textarea { resize:vertical; min-height:100px; }
      `}</style>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 16px', position: 'relative', zIndex: 2 }}>
        <header style={{
          position: 'sticky', top: 0, zIndex: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 0',
          background: 'rgba(250,250,248,0.94)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(0,0,0,0.08)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="blink" style={{ width: 6, height: 6, background: L, display: 'inline-block' }} />
            {brandLogoUrl ? <img src={brandLogoUrl} style={{height:24}} /> : <span className="pixel" style={{ fontSize: 10, color: L }}>publisio</span>}
            <span style={{ fontSize: 9, color: G, marginLeft: 6 }}>TOKYO-01</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 9, color: G, fontFamily: "'IBM Plex Mono',monospace" }}>60 FPS</span>
            <span className="pixel" style={{ fontSize: 7, color: G, border: `1px solid ${G}`, padding: '3px 7px' }}>v1.0</span>
            {user ? (
              <>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', fontFamily: "'IBM Plex Mono',monospace", maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.email}
                </span>
                <Link href="/playground" className="pixel" style={{ fontSize: 7, color: L, textDecoration: 'none', border: `1px solid ${L}`, padding: '3px 7px' }}>BACK</Link>
                <button onClick={signOutCookie} className="pixel" style={{ fontSize: 7, color: 'rgba(255,255,255,0.8)', background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', padding: '3px 7px', cursor: 'pointer' }}>OUT</button>
              </>
            ) : (
              <span className="pixel" style={{ fontSize: 7, color: 'rgba(255,255,255,0.8)', border: '1px solid rgba(255,255,255,0.3)', padding: '3px 7px' }}>user</span>
            )}
          </div>
        </header>

        <main style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingTop: 40, paddingBottom: 60 }}>
          <div>
            <h1 className="pixel" style={{ fontSize: 28, color: B, margin: 0, textShadow: '3px 3px 0 rgba(30,69,251,0.25)' }}>
              DASHBOARD
            </h1>
            <p style={{ fontSize: 13, color: G, marginTop: 8, lineHeight: 1.6 }}>
              Manage API keys, prompts, and brand settings.
            </p>
          </div>

          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ background: B, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 16 }}>
                {TABS.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className="pixel"
                    style={{
                      fontSize: 8,
                      color: tab === t.id ? '#111118' : G,
                      background: tab === t.id ? L : 'transparent',
                      border: `1px solid ${tab === t.id ? L : 'rgba(255,255,255,0.2)'}`,
                      borderRadius: 8,
                      padding: '7px 10px',
                      cursor: 'pointer',
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {tab === 'keys' ? (
                <>
                  <Field label="Gemini API Key" hint="Primary Google Gemini API key for content analysis.">
                    <input type="password" value={geminiKey} onChange={e => setGeminiKey(e.target.value)} placeholder="AIza..." />
                  </Field>
                  <Field label="Gemini API Key 2" hint="Backup key — auto-switches when primary hits quota (429).">
                    <input type="password" value={geminiKey2} onChange={e => setGeminiKey2(e.target.value)} placeholder="AIza..." />
                  </Field>
                  <Field label="Gemini API Key 3" hint="Second backup key.">
                    <input type="password" value={geminiKey3} onChange={e => setGeminiKey3(e.target.value)} placeholder="AIza..." />
                  </Field>
                  <Field label="OpenAI API Key" hint="OpenAI key for DALL-E / GPT-image generation.">
                    <input type="password" value={openaiKey} onChange={e => setOpenaiKey(e.target.value)} placeholder="sk-..." />
                  </Field>
                  <Field label="Admin Emails" hint="Comma-separated list of emails with admin access.">
                    <textarea value={adminEmails} onChange={e => setAdminEmails(e.target.value)} placeholder="admin@example.com, editor@example.com" />
                  </Field>
                </>
              ) : null}

              {tab === 'content' ? (
                <Field label="Content Prompt" hint="Full Gemini prompt used to analyze input and generate carousel slide data.">
                  <textarea value={contentPrompt} onChange={e => setContentPrompt(e.target.value)} placeholder="You are an expert Instagram content creator..." style={{ minHeight: 360 }} />
                </Field>
              ) : null}

              {tab === 'image' ? (
                <>
                  <Field label="Image Style" hint="Base style prompt prepended to every slide image generation.">
                    <textarea value={imageStyle} onChange={e => setImageStyle(e.target.value)} placeholder="Dark cinematic tech aesthetic..." style={{ minHeight: 160 }} />
                  </Field>
                  <Field label="Image Style (Vivid)" hint="Alternate vivid style variant for image generation.">
                    <textarea value={imageStyleVivid} onChange={e => setImageStyleVivid(e.target.value)} placeholder="Vibrant, saturated cinematic tech aesthetic..." style={{ minHeight: 160 }} />
                  </Field>
                </>
              ) : null}

              {tab === 'slides' ? (
                <>
                  <Field label="Cover Slide Prompt" hint="Prompt for the cover slide.">
                    <textarea value={slideCover} onChange={e => setSlideCover(e.target.value)} placeholder="Cover slide instructions..." />
                  </Field>
                  <Field label="Bullets Slide Prompt" hint="Prompt for the bullets slide.">
                    <textarea value={slideBullets} onChange={e => setSlideBullets(e.target.value)} placeholder="Bullets slide instructions..." />
                  </Field>
                  <Field label="Stat Slide Prompt" hint="Prompt for the stat slide.">
                    <textarea value={slideStat} onChange={e => setSlideStat(e.target.value)} placeholder="Stat slide instructions..." />
                  </Field>
                  <Field label="Grid4 Slide Prompt" hint="Prompt for the 4-card grid slide.">
                    <textarea value={slideGrid4} onChange={e => setSlideGrid4(e.target.value)} placeholder="Grid4 slide instructions..." />
                  </Field>
                  <Field label="Quote Slide Prompt" hint="Prompt for the quote slide.">
                    <textarea value={slideQuote} onChange={e => setSlideQuote(e.target.value)} placeholder="Quote slide instructions..." />
                  </Field>
                  <Field label="CTA Slide Prompt" hint="Prompt for the closing CTA slide.">
                    <textarea value={slideCta} onChange={e => setSlideCta(e.target.value)} placeholder="CTA slide instructions..." />
                  </Field>
                </>
              ) : null}

              {tab === 'admin' ? (
                <Field label="Admin Emails" hint="Comma-separated list of emails with admin access.">
                  <textarea value={adminEmails} onChange={e => setAdminEmails(e.target.value)} placeholder="admin@example.com, editor@example.com" />
                </Field>
              ) : null}
            </div>

            {msg ? (
              <div style={{ fontSize: 13, color: msg.startsWith('✓') ? L : '#f87171', padding: '8px 12px', background: S, borderRadius: 8, border: `1px solid ${L}20` }}>
                {msg}
              </div>
            ) : null}

            <button type="submit" disabled={saving} className="pixel abtn" style={{
              minHeight: 48,
              background: L,
              color: '#111118',
              border: `2px solid ${L}`,
              borderRadius: 12,
              fontSize: 11,
              cursor: saving ? 'not-allowed' : 'pointer',
              boxShadow: '4px 4px 0 rgba(205,242,43,0.3)',
              opacity: saving ? 0.6 : 1,
            }}>
              {saving ? 'SAVING...' : '▶ SAVE ALL'}
            </button>
          </form>

          {/* Export prompts as .txt */}
          <div style={{ marginTop: 0 }}>
            <button onClick={() => {
              const sections: Record<string, string> = {
                'CONTENT PROMPT (Gemini Analysis)': contentPrompt,
                'IMAGE STYLE (Standard)': imageStyle,
                'IMAGE STYLE (Vivid/Cover)': imageStyleVivid,
                'SLIDE: Cover': slideCover,
                'SLIDE: Bullets': slideBullets,
                'SLIDE: Stat': slideStat,
                'SLIDE: Grid4': slideGrid4,
                'SLIDE: Quote': slideQuote,
                'SLIDE: CTA': slideCta,
              }
              let txt = 'PUBLISIO — AI Prompt Export\n' + new Date().toISOString().split('T')[0] + '\n' + '='.repeat(50) + '\n\n'
              for (const [title, content] of Object.entries(sections)) {
                txt += '--- ' + title + ' ---\n' + (content || '(empty — using hardcoded default)') + '\n\n'
              }
              const blob = new Blob([txt], { type: 'text/plain' })
              const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
              a.download = 'publisio-prompts-' + new Date().toISOString().split('T')[0] + '.txt'
              a.click(); URL.revokeObjectURL(a.href)
            }} className="pixel" style={{
              width: '100%',
              minHeight: 44,
              background: S,
              border: `1px solid ${L}`,
              borderRadius: 12,
              color: L,
              fontSize: 9,
              cursor: 'pointer',
              boxShadow: 'none',
            }}>
              📄 DOWNLOAD PROMPTS (.txt)
            </button>
          </div>
        </main>
      </div>
    </div>
  )
}

export default function AdminPage() {
  return (
    <Suspense fallback={<div style={{minHeight:'100vh',background:'#111118'}} />}>
      <AdminForm />
    </Suspense>
  )
}
