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

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 11, color: '#1a1a1a', fontWeight: 600 }}>{label}</span>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ width: 36, height: 36, padding: 2, borderRadius: 6, border: '1px solid rgba(0,0,0,0.15)', background: 'transparent', cursor: 'pointer', flexShrink: 0 }}
        />
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="light-input"
          style={{ flex: 1 }}
          placeholder="#000000"
        />
      </div>
    </label>
  )
}

function SettingsForm() {
  const [user, setUser] = useState<{email: string} | null>(null)
  const [brandLogoUrl, setBrandLogoUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  // Brand identity
  const [brandVoice, setBrandVoice] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [logoPosition, setLogoPosition] = useState('bottom-right')
  const [instagramHandle, setInstagramHandle] = useState('')
  const [headingFont, setHeadingFont] = useState('Press Start 2P')
  const [bodyFont, setBodyFont] = useState('VT323')
  const [slideBgColor, setSlideBgColor] = useState('#09090B')
  const [slideAccentColor, setSlideAccentColor] = useState('#CDF22B')
  const [slideAccent2Color, setSlideAccent2Color] = useState('#1E45FB')
  const [slideTextColor, setSlideTextColor] = useState('#FFFFFF')
  const [slideMutedColor, setSlideMutedColor] = useState('#e2e2e2')
  const [slideWidth, setSlideWidth] = useState(1080)
  const [slideHeight, setSlideHeight] = useState(1350)

  // Connections
  const [metaToken, setMetaToken] = useState('')
  const [igAccountId, setIgAccountId] = useState('')
  const [fbPageId, setFbPageId] = useState('')

  useEffect(() => {
    const u = getUserFromCookie()
    if (!u) { window.location.href = '/auth'; return }
    setUser(u)
    fetch('/api/settings', { credentials: 'include' }).then(r => r.json()).then(d => {
      if (d && !d.error) {
        setBrandVoice(d.brand_voice || '')
        setLogoUrl(d.logo_url || '')
        setLogoPosition(d.logo_position || 'bottom-right')
        setInstagramHandle(d.instagram_handle || '')
        setHeadingFont(d.heading_font || 'Press Start 2P')
        setBodyFont(d.body_font || 'VT323')
        setSlideBgColor(d.slide_bg_color || '#09090B')
        setSlideAccentColor(d.slide_accent_color || '#CDF22B')
        setSlideAccent2Color(d.slide_accent2_color || '#1E45FB')
        setSlideTextColor(d.slide_text_color || '#FFFFFF')
        setSlideMutedColor(d.slide_muted_color || '#e2e2e2')
        setSlideWidth(d.slide_width || 1080)
        setSlideHeight(d.slide_height || 1350)
        setMetaToken(d.meta_token || '')
        setIgAccountId(d.ig_account_id || '')
        setFbPageId(d.fb_page_id || '')
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
      const r = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          brand_voice: brandVoice,
          logo_url: logoUrl,
          logo_position: logoPosition,
          instagram_handle: instagramHandle,
          heading_font: headingFont,
          body_font: bodyFont,
          slide_bg_color: slideBgColor,
          slide_accent_color: slideAccentColor,
          slide_accent2_color: slideAccent2Color,
          slide_text_color: slideTextColor,
          slide_muted_color: slideMutedColor,
          slide_width: slideWidth,
          slide_height: slideHeight,
          meta_token: metaToken,
          ig_account_id: igAccountId,
          fb_page_id: fbPageId,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Save failed')
      setMsg('✓ Saved')
    } catch (e: any) {
      setMsg(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={{minHeight:'100vh',background:'#111118'}} />

  return (
    <div style={{ background: D, minHeight: '100vh', color: W, fontFamily: "'IBM Plex Mono','Courier New',monospace", position:'relative', zIndex:2 }}>
      <style>{`
        .pixel { font-family: 'Press Start 2P', monospace; letter-spacing:0; line-height:1.6; }
        .abtn { transition: transform .06s ease, box-shadow .06s ease; }
        .abtn:hover:not(:disabled) { transform: translate(-1px,-2px); box-shadow: 4px 4px 0 rgba(205,242,43,0.5); }
        .abtn:active:not(:disabled) { transform: translate(2px,2px); box-shadow: 0px 0px 0 #000; }
        input { background:#111118; border:1px solid rgba(255,255,255,0.12); color:#e8e8ec; padding:12px 14px; border-radius:10px; font-size:14px; outline:none; font-family:'IBM Plex Mono',monospace; width:100%; box-sizing:border-box; }
        input:focus { border-color:${L}; }
        .light-input { background:#F5F5F0; border:1px solid rgba(0,0,0,0.12); color:#1a1a1a; }
        .light-input:focus { border-color:${B}; }
      `}</style>

      <header style={{ position:'sticky',top:0,zIndex:20,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',background:'rgba(250,250,248,0.94)',backdropFilter:'blur(12px)',borderBottom:'1px solid rgba(0,0,0,0.08)',maxWidth:760,margin:'0 auto' }}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <Link href="/playground" style={{display:'flex',alignItems:'center',gap:10,textDecoration:'none'}}>
            <span style={{width:6,height:6,background:L,display:'inline-block'}} />
            {brandLogoUrl ? <img src={brandLogoUrl} style={{height:24}} /> : <span className="pixel" style={{fontSize:10,color:L}}>publisio</span>}
          </Link>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontSize:10,color:G}}>{user?.email}</span>
          <Link href="/playground" className="pixel" style={{fontSize:7,color:L,textDecoration:'none',border:`1px solid ${L}`,padding:'3px 7px'}}>BACK</Link>
        </div>
      </header>

      <main style={{maxWidth:760,margin:'0 auto',padding:'40px 16px',display:'flex',flexDirection:'column',gap:24}}>
        <div>
          <h1 className="pixel" style={{fontSize:16,color:B,margin:0}}>SETTINGS</h1>
          <p style={{fontSize:13,color:G,marginTop:8,lineHeight:1.6}}>
            Your brand identity and connections — applied to every carousel you generate.
          </p>
        </div>

        <form onSubmit={handleSave} style={{display:'flex',flexDirection:'column',gap:20}}>

          {/* SECTION 1: BRAND IDENTITY */}
          <div style={{background:'#FFFFFF',border:'1px solid rgba(0,0,0,0.08)',borderRadius:14,padding:'24px',display:'flex',flexDirection:'column',gap:18}}>
            <h2 className="pixel" style={{fontSize:11,color:B,margin:0}}>BRAND IDENTITY</h2>

            <label style={{display:'flex',flexDirection:'column',gap:6}}>
              <span style={{fontSize:11,color:'#1a1a1a',fontWeight:600}}>Logo</span>
              <span style={{fontSize:10,color:'rgba(0,0,0,0.5)'}}>Upload your brand logo. Shown on generated slides.</span>
              {logoUrl ? <img src={logoUrl} alt="logo" style={{maxHeight:64,alignSelf:'flex-start',borderRadius:8,border:'1px solid rgba(0,0,0,0.1)',background:'#F5F5F0',padding:6}} /> : null}
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <input type="text" value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://.../logo.png" className="light-input" style={{flex:1}} />
                <label className="pixel" style={{cursor:'pointer',background:B,color:'#FFFFFF',border:`1px solid ${B}`,borderRadius:10,padding:'10px 14px',fontSize:8,whiteSpace:'nowrap'}}>
                  UPLOAD
                  <input type="file" accept="image/*" style={{display:'none'}} onChange={async (e) => {
                    const f = e.target.files?.[0]; if (!f) return
                    const r = new FileReader(); r.onload = async () => {
                      const base64 = (r.result as string).split(',')[1]
                      const res = await fetch('/api/settings/logo', { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include', body:JSON.stringify({imageBase64:base64,imageMimeType:f.type}) })
                      const d = await res.json(); if (d.url) setLogoUrl(d.url)
                    }; r.readAsDataURL(f)
                  }} />
                </label>
              </div>
            </label>

            <label style={{display:'flex',flexDirection:'column',gap:6}}>
              <span style={{fontSize:11,color:'#1a1a1a',fontWeight:600}}>Brand Voice</span>
              <span style={{fontSize:10,color:'rgba(0,0,0,0.5)'}}>How should AI write and design for you? Applies to all carousels.</span>
              <textarea
                value={brandVoice}
                onChange={e => setBrandVoice(e.target.value)}
                rows={6}
                placeholder="Describe your brand — who are you, what's your tone, what colors do you like, what style feels like you..."
                style={{width:'100%',minHeight:120,background:'#F5F5F0',border:'1px solid rgba(0,0,0,0.12)',borderRadius:10,color:'#1a1a1a',padding:12,fontSize:13,lineHeight:1.6,resize:'vertical',outline:'none',fontFamily:"'IBM Plex Mono',monospace",boxSizing:'border-box'}}
              />
            </label>

            <label style={{display:'flex',flexDirection:'column',gap:6}}>
              <span style={{fontSize:11,color:'#1a1a1a',fontWeight:600}}>Instagram Handle</span>
              <span style={{fontSize:10,color:'rgba(0,0,0,0.5)'}}>Shown on generated slides and captions.</span>
              <input type="text" value={instagramHandle} onChange={e => setInstagramHandle(e.target.value)} placeholder="@yourhandle" className="light-input" />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <label style={{display:'flex',flexDirection:'column',gap:6}}>
                <span style={{fontSize:11,color:'#1a1a1a',fontWeight:600}}>Heading Font</span>
                <input type="text" value={headingFont} onChange={e => setHeadingFont(e.target.value)} placeholder="Press Start 2P" className="light-input" />
              </label>
              <label style={{display:'flex',flexDirection:'column',gap:6}}>
                <span style={{fontSize:11,color:'#1a1a1a',fontWeight:600}}>Body Font</span>
                <input type="text" value={bodyFont} onChange={e => setBodyFont(e.target.value)} placeholder="VT323" className="light-input" />
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <ColorField label="BACKGROUND" value={slideBgColor} onChange={setSlideBgColor} />
              <ColorField label="ACCENT" value={slideAccentColor} onChange={setSlideAccentColor} />
              <ColorField label="ACCENT 2" value={slideAccent2Color} onChange={setSlideAccent2Color} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <ColorField label="TEXT" value={slideTextColor} onChange={setSlideTextColor} />
              <ColorField label="MUTED" value={slideMutedColor} onChange={setSlideMutedColor} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <label style={{display:'flex',flexDirection:'column',gap:6}}>
                <span style={{fontSize:11,color:'#1a1a1a',fontWeight:600}}>Slide Width</span>
                <input type="number" value={slideWidth} onChange={e => setSlideWidth(Number(e.target.value) || 0)} className="light-input" />
              </label>
              <label style={{display:'flex',flexDirection:'column',gap:6}}>
                <span style={{fontSize:11,color:'#1a1a1a',fontWeight:600}}>Slide Height</span>
                <input type="number" value={slideHeight} onChange={e => setSlideHeight(Number(e.target.value) || 0)} className="light-input" />
              </label>
            </div>

            <div>
              <span style={{ fontSize: 11, color: '#1a1a1a', fontWeight: 600, display: 'block', marginBottom: 4 }}>LOGO POSITION ON SLIDES</span>
              <span style={{ fontSize: 10, color: 'rgba(0,0,0,0.5)', display: 'block', marginBottom: 10 }}>Where your logo appears on generated slides.</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {[
                  ['TOP LEFT', 'top-left'], ['TOP CTR', 'top-center'], ['TOP RIGHT', 'top-right'],
                  ['CTR LEFT', 'center-left'], ['CENTER', 'center'], ['CTR RIGHT', 'center-right'],
                  ['BTM LEFT', 'bottom-left'], ['BTM CTR', 'bottom-center'], ['BTM RIGHT', 'bottom-right'],
                ].map(([label, value]) => (
                  <div
                    key={value}
                    onClick={() => setLogoPosition(value)}
                    className="pixel"
                    style={{
                      background: logoPosition === value ? B : '#F5F5F0',
                      color: logoPosition === value ? '#FFFFFF' : '#666',
                      border: '1px solid rgba(0,0,0,0.1)',
                      borderRadius: 8,
                      padding: '8px 6px',
                      cursor: 'pointer',
                      fontSize: 7,
                      textAlign: 'center',
                      fontFamily: "'Press Start 2P', monospace",
                    }}
                  >
                    {label}
                  </div>
                ))}
              </div>
              <div
                onClick={() => setLogoPosition('none')}
                className="pixel"
                style={{
                  marginTop: 8,
                  background: logoPosition === 'none' ? B : '#F5F5F0',
                  color: logoPosition === 'none' ? '#FFFFFF' : '#666',
                  border: '1px solid rgba(0,0,0,0.1)',
                  borderRadius: 8,
                  padding: '8px 6px',
                  cursor: 'pointer',
                  fontSize: 7,
                  textAlign: 'center',
                  fontFamily: "'Press Start 2P', monospace",
                }}
              >
                NONE
              </div>
            </div>
          </div>

          {/* SECTION 2: CONNECTIONS */}
          <div style={{background:'#FFFFFF',border:'1px solid rgba(0,0,0,0.08)',borderRadius:14,padding:'24px',display:'flex',flexDirection:'column',gap:16}}>
            <h2 className="pixel" style={{fontSize:11,color:B,margin:0}}>CONNECTIONS</h2>

            <label style={{display:'flex',flexDirection:'column',gap:6}}>
              <span style={{fontSize:11,color:'#1a1a1a',fontWeight:600}}>Meta Access Token</span>
              <span style={{fontSize:10,color:'rgba(0,0,0,0.5)'}}>Long-lived page access token. Starts with EAA...</span>
              <input type="password" value={metaToken} onChange={e => setMetaToken(e.target.value)} placeholder="EAAAbc..." className="light-input" />
            </label>

            <label style={{display:'flex',flexDirection:'column',gap:6}}>
              <span style={{fontSize:11,color:'#1a1a1a',fontWeight:600}}>Instagram Account ID</span>
              <span style={{fontSize:10,color:'rgba(0,0,0,0.5)'}}>Your Instagram Business account ID.</span>
              <input value={igAccountId} onChange={e => setIgAccountId(e.target.value)} placeholder="178414..." className="light-input" />
            </label>

            <label style={{display:'flex',flexDirection:'column',gap:6}}>
              <span style={{fontSize:11,color:'#1a1a1a',fontWeight:600}}>Facebook Page ID (optional)</span>
              <span style={{fontSize:10,color:'rgba(0,0,0,0.5)'}}>Cross-post to your Facebook Page.</span>
              <input value={fbPageId} onChange={e => setFbPageId(e.target.value)} placeholder="12345..." className="light-input" />
            </label>
          </div>

          {/* SECTION 3: SAVE */}
          {msg ? <div style={{fontSize:13,color:msg.startsWith('✓')?L:'#f87171',padding:'8px 12px',background:S,borderRadius:8,border:`1px solid ${L}20`}}>{msg}</div> : null}

          <button type="submit" disabled={saving} className="pixel abtn" style={{minHeight:48,background:L,color:'#111118',border:`2px solid ${L}`,borderRadius:12,fontSize:11,cursor:saving?'not-allowed':'pointer',boxShadow:'4px 4px 0 rgba(205,242,43,0.3)',opacity:saving?0.6:1}}>
            {saving ? 'SAVING...' : '▶ SAVE ALL'}
          </button>
        </form>
      </main>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div style={{minHeight:'100vh',background:'#111118'}} />}>
      <SettingsForm />
    </Suspense>
  )
}
