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

function SettingsForm() {
  const [user, setUser] = useState<{email: string} | null>(null)
  const [metaToken, setMetaToken] = useState('')
  const [igAccountId, setIgAccountId] = useState('')
  const [fbPageId, setFbPageId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    const u = getUserFromCookie()
    if (!u) { window.location.href = '/auth'; return }
    setUser(u)
    // Load existing settings
    fetch('/api/settings', { credentials: 'include' }).then(r => r.json()).then(d => {
      if (d && !d.error) {
        setMetaToken(d.meta_token || '')
        setIgAccountId(d.ig_account_id || '')
        setFbPageId(d.fb_page_id || '')
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMsg('')
    try {
      const r = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ meta_token: metaToken, ig_account_id: igAccountId, fb_page_id: fbPageId }),
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
      `}</style>

      <header style={{ position:'sticky',top:0,zIndex:20,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',background:'rgba(13,13,20,0.92)',backdropFilter:'blur(12px)',borderBottom:'1px solid rgba(255,255,255,0.06)',maxWidth:760,margin:'0 auto' }}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <Link href="/playground" style={{display:'flex',alignItems:'center',gap:10,textDecoration:'none'}}>
            <span style={{width:6,height:6,background:L,display:'inline-block'}} />
            <span className="pixel" style={{fontSize:10,color:L}}>publisio</span>
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
            Your API keys are stored securely per account.<br/>
            <span style={{color:B}}>Gemini AI</span> is managed by the platform — no setup needed.
          </p>
        </div>

        {/* Guide box */}
        <div style={{background:'#1E45FB',border:'1px solid rgba(255,255,255,0.08)',borderRadius:14,padding:'20px',display:'flex',flexDirection:'column',gap:10,fontSize:12,color:W,lineHeight:1.7}}>
          <span className="pixel" style={{fontSize:9,color:L}}>HOW TO GET YOUR KEYS</span>
          <div style={{color:'rgba(255,255,255,0.8)'}}>
            1. Go to <a href="https://developers.facebook.com" target="_blank" style={{color:L,textDecoration:'underline'}}>developers.facebook.com</a> → My Apps → Create App<br/>
            2. Add <b>Instagram Graph API</b> product to your app<br/>
            3. Navigate to <b>Graph API Explorer</b> → select your app → get <b>Page Access Token</b><br/>
            4. Find your <b>Instagram Account ID</b> from your connected IG Business account<br/>
            5. Paste both below ↓
          </div>
        </div>

        <form onSubmit={handleSave} style={{display:'flex',flexDirection:'column',gap:20}}>
          <div style={{background:'#1a1a26',border:'1px solid rgba(255,255,255,0.08)',borderRadius:14,padding:'24px',display:'flex',flexDirection:'column',gap:16}}>
            <h2 className="pixel" style={{fontSize:10,color:L,margin:0}}>INSTAGRAM / META</h2>

            <label style={{display:'flex',flexDirection:'column',gap:6}}>
              <span style={{fontSize:11,color:W,fontWeight:600}}>Meta Access Token</span>
              <span style={{fontSize:10,color:'rgba(255,255,255,0.5)'}}>Long-lived page access token. Starts with EAA...</span>
              <input type="password" value={metaToken} onChange={e => setMetaToken(e.target.value)} placeholder="EAAAbc..." style={{background:'#111118',border:'1px solid rgba(255,255,255,0.12)',color:'#e8e8ec'}} />
            </label>

            <label style={{display:'flex',flexDirection:'column',gap:6}}>
              <span style={{fontSize:11,color:W,fontWeight:600}}>Instagram Account ID</span>
              <span style={{fontSize:10,color:'rgba(255,255,255,0.5)'}}>Your Instagram Business account ID.</span>
              <input value={igAccountId} onChange={e => setIgAccountId(e.target.value)} placeholder="178414..." style={{background:'#111118',border:'1px solid rgba(255,255,255,0.12)',color:'#e8e8ec'}} />
            </label>

            <label style={{display:'flex',flexDirection:'column',gap:6}}>
              <span style={{fontSize:11,color:W,fontWeight:600}}>Facebook Page ID (optional)</span>
              <span style={{fontSize:10,color:'rgba(255,255,255,0.5)'}}>Cross-post to your Facebook Page.</span>
              <input value={fbPageId} onChange={e => setFbPageId(e.target.value)} placeholder="12345..." style={{background:'#111118',border:'1px solid rgba(255,255,255,0.12)',color:'#e8e8ec'}} />
            </label>
          </div>

          {msg ? <div style={{fontSize:13,color:msg.startsWith('✓')?B:'#f87171',padding:'8px 12px',background:S,borderRadius:8,border:`1px solid ${B}20`}}>{msg}</div> : null}

          <button type="submit" disabled={saving} className="pixel abtn" style={{minHeight:48,background:L,color:'#111118',border:`2px solid ${L}`,borderRadius:12,fontSize:11,cursor:saving?'not-allowed':'pointer',boxShadow:'4px 4px 0 rgba(205,242,43,0.3)',opacity:saving?0.6:1}}>
            {saving ? 'SAVING...' : '▶ SAVE'}
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
