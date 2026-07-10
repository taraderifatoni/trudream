'use client'

import { useState, FormEvent, Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

const L = '#CDF22B'
const W = '#e8e8ec'
const D = '#111118'
const S = '#1a1a26'
const G = '#888888'

import { SUPABASE_URL as SB, SUPABASE_ANON_KEY as KEY } from '@/lib/supabase-client'

async function apiSignUp(email: string, password: string) {
  const r = await fetch(`${SB}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const d = await r.json()
  if (!r.ok) throw new Error(d.msg || d.error || 'Signup failed')
  return d
}

async function apiSignIn(email: string, password: string) {
  const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const d = await r.json()
  if (!r.ok) throw new Error(d.msg || d.error_description || 'Login failed')
  // Store token in cookie so middleware can read it
  if (d.access_token) {
    const exp = new Date(Date.now() + (d.expires_in || 3600) * 1000).toUTCString()
    document.cookie = `sb-access-token=${d.access_token}; expires=${exp}; path=/; SameSite=Lax`
    document.cookie = `sb-refresh-token=${d.refresh_token}; expires=${exp}; path=/; SameSite=Lax`
    document.cookie = `sb-user=${JSON.stringify(d.user)}; expires=${exp}; path=/; SameSite=Lax`
  }
  return d
}

function getUserFromCookie(): { email: string } | null {
  try {
    const c = document.cookie.split('; ').find(r => r.startsWith('sb-user='))
    if (!c) return null
    return JSON.parse(decodeURIComponent(c.split('=')[1]))
  } catch { return null }
}

function AuthForm() {
  const router = useRouter()
  const search = useSearchParams()
  const redirect = search.get('redirect') || '/playground'

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [brandLogoUrl, setBrandLogoUrl] = useState('')

  useEffect(() => {
    const u = getUserFromCookie()
    if (u) { router.replace(redirect); return }
    // Handle OAuth callback: token arrives in URL hash (e.g. #access_token=...)
    if (typeof window !== 'undefined' && window.location.hash) {
      const h = window.location.hash.substring(1)
      const p = new URLSearchParams(h)
      const at = p.get('access_token')
      const rt = p.get('refresh_token')
      if (at) {
        const exp = new Date(Date.now() + 3600 * 1000).toUTCString()
        document.cookie = `sb-access-token=${at}; expires=${exp}; path=/; SameSite=Lax`
        if (rt) document.cookie = `sb-refresh-token=${rt}; expires=${exp}; path=/; SameSite=Lax`
        // Fetch user info
        fetch(`${SB}/auth/v1/user`, {
          headers: { 'apikey': KEY, 'Authorization': `Bearer ${at}` }
        }).then(r => r.json()).then(u => {
          if (u.email) {
            document.cookie = `sb-user=${JSON.stringify({email: u.email})}; expires=${exp}; path=/; SameSite=Lax`
            window.location.replace(redirect)
          }
        }).catch(() => window.location.replace(redirect))
        return
      }
    }
  }, [redirect, router])

  useEffect(() => { fetch('/api/brand').then(r=>r.json()).then(d=>setBrandLogoUrl(d.logo_url||'')).catch(()=>{}) }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'register') {
        await apiSignUp(email, password)
        // Auto-login after signup
        await apiSignIn(email, password)
        router.replace(redirect)
      } else {
        await apiSignIn(email, password)
        router.replace(redirect)
      }
    } catch (e: any) {
      setError(e.message || 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ background: D, minHeight: '100vh', color: W, fontFamily: "'IBM Plex Mono','Courier New',monospace", position:'relative', zIndex:2 }}>
      <style>{`
        .pixel { font-family: 'Press Start 2P', monospace; letter-spacing:0; line-height:1.6; }
        .abtn { transition: transform .06s ease, box-shadow .06s ease; }
        .abtn:hover:not(:disabled) { transform: translate(-1px,-2px); box-shadow: 4px 4px 0 rgba(205,242,43,0.5); }
        .abtn:active:not(:disabled) { transform: translate(2px,2px); box-shadow: 0px 0px 0 #000; }
        input { background:#111118; border:1px solid rgba(255,255,255,0.12); color:#e8e8ec; padding:12px 14px; border-radius:10px; font-size:14px; outline:none; font-family:'IBM Plex Mono',monospace; width:100%; box-sizing:border-box; }
        input:focus { border-color:${L}; }
        input::placeholder { color:#666666; }
      `}</style>

      <header style={{ position:'sticky',top:0,zIndex:20,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',background:'rgba(250,250,248,0.94)',backdropFilter:'blur(12px)',borderBottom:'1px solid rgba(0,0,0,0.08)',maxWidth:760,margin:'0 auto' }}>
        <Link href="/" style={{display:'flex',alignItems:'center',gap:10,textDecoration:'none'}}>
          <span style={{width:6,height:6,background:L,display:'inline-block'}} />
          {brandLogoUrl ? <img src={brandLogoUrl} style={{height:24}} /> : <span className="pixel" style={{fontSize:10,color:L}}>publisio</span>}
        </Link>
        <span style={{fontSize:9,color:'#666666'}}>TOKYO-01</span>
      </header>

      <main style={{display:'flex',alignItems:'center',justifyContent:'center',padding:'60px 16px'}}>
        <div style={{background:S,border:'1px solid rgba(255,255,255,0.08)',borderRadius:16,padding:'32px 28px',width:'100%',maxWidth:400,display:'flex',flexDirection:'column',gap:22}}>
          <h2 className="pixel" style={{fontSize:14,color:L,textAlign:'center',margin:0}}>
            {mode === 'login' ? 'LOGIN' : 'REGISTER'}
          </h2>

          <form onSubmit={handleSubmit} style={{display:'flex',flexDirection:'column',gap:14}}>
            <input type="email" placeholder="email" value={email} onChange={e => setEmail(e.target.value)} required />
            <input type="password" placeholder="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
            <button type="submit" disabled={loading} className="pixel abtn" style={{minHeight:46,background:L,color:'#111118',border:`2px solid ${L}`,borderRadius:12,fontSize:11,cursor:loading?'not-allowed':'pointer',boxShadow:'4px 4px 0 rgba(205,242,43,0.3)',opacity:loading?0.6:1}}>
              {loading ? 'WAIT...' : mode === 'login' ? '▶ LOGIN' : '▶ REGISTER'}
            </button>
          </form>

          <div style={{display:'flex',alignItems:'center',gap:10,color:G,fontSize:10}}>
            <span style={{flex:1,height:1,background:'rgba(255,255,255,0.08)'}} />
            OR
            <span style={{flex:1,height:1,background:'rgba(255,255,255,0.08)'}} />
          </div>

          <a href={`${SB}/auth/v1/authorize?provider=google&redirect_to=https://publisio.vercel.app/playground`} className="pixel abtn" style={{display:'flex',alignItems:'center',justifyContent:'center',gap:10,minHeight:46,background:S,border:'1px solid rgba(255,255,255,0.12)',borderRadius:12,color:W,fontSize:9,textDecoration:'none',cursor:'pointer'}}>
            G · SIGN IN WITH GOOGLE
          </a>

          {error ? <div style={{fontSize:12,color:error.startsWith('✓')?L:'#f87171',textAlign:'center',padding:'8px',background:'rgba(255,255,255,0.03)',borderRadius:8}}>{error}</div> : null}

          <div style={{textAlign:'center'}}>
            <button onClick={() => { setMode(mode==='login'?'register':'login'); setError('') }} className="pixel" style={{fontSize:8,color:G,background:'none',border:'none',cursor:'pointer',textDecoration:'underline'}}>
              {mode === 'login' ? 'No account? Register' : 'Have account? Login'}
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div style={{minHeight:'100vh',background:'#111118'}} />}>
      <AuthForm />
    </Suspense>
  )
}
