'use client'

import { useState, useEffect, FormEvent, Suspense } from 'react'
import Link from 'next/link'

// Beautifio palette
const PEACOCK   = '#084463'
const SAFFRON   = '#FFC64F'
const ICY       = '#6BB9D4'
const WHITE     = '#F8FAFC'
const DEEP      = '#1E2938'
const SLATE     = '#647488'
const CARD      = '#0a2235'
const BORDER    = 'rgba(107,185,212,0.15)'

function getUserFromCookie() {
  if (typeof document === 'undefined') return null
  try {
    const c = document.cookie.split('; ').find(r => r.startsWith('sb-user='))
    return c ? JSON.parse(decodeURIComponent(c.split('=')[1])) : null
  } catch { return null }
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 13, color: WHITE, fontWeight: 600, fontFamily: "'Poppins',sans-serif" }}>{label}</span>
      {hint && <span style={{ fontSize: 11, color: SLATE, lineHeight: 1.5 }}>{hint}</span>}
      {children}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  background: '#071a2b',
  border: `1px solid ${BORDER}`,
  color: WHITE,
  padding: '11px 14px',
  borderRadius: 10,
  fontSize: 14,
  outline: 'none',
  fontFamily: "'IBM Plex Mono','Courier New',monospace",
  width: '100%',
  boxSizing: 'border-box',
}

function SettingsForm() {
  const [user, setUser]               = useState<{ email: string } | null>(null)
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [msg, setMsg]                 = useState('')

  // Brand Identity
  const [logoUrl, setLogoUrl]                 = useState('')
  const [showLogo, setShowLogo]               = useState(true)
  const [brandVoice, setBrandVoice]           = useState('')
  const [instagramHandle, setInstagramHandle] = useState('')

  // Slide dimensions
  const [slideWidth, setSlideWidth]   = useState(1080)
  const [slideHeight, setSlideHeight] = useState(1350)

  // Connections
  const [metaToken, setMetaToken]     = useState('')
  const [igAccountId, setIgAccountId] = useState('')
  const [fbPageId, setFbPageId]       = useState('')
  const [openaiKey, setOpenaiKey]     = useState('')

  useEffect(() => {
    const u = getUserFromCookie()
    if (!u) { window.location.href = '/auth'; return }
    setUser(u)
    fetch('/api/settings', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (d && !d.error) {
          setLogoUrl(d.logo_url || '')
          setShowLogo(d.logo_position !== 'none')
          setBrandVoice(d.brand_voice || '')
          setInstagramHandle(d.instagram_handle || '')
          setSlideWidth(d.slide_width || 1080)
          setSlideHeight(d.slide_height || 1350)
          setMetaToken(d.meta_token || '')
          setIgAccountId(d.ig_account_id || '')
          setFbPageId(d.fb_page_id || '')
          setOpenaiKey(d.openai_key || '')
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
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
        body: JSON.stringify({
          logo_url: logoUrl,
          logo_position: showLogo ? 'bottom-right' : 'none',
          brand_voice: brandVoice,
          instagram_handle: instagramHandle,
          slide_width: slideWidth,
          slide_height: slideHeight,
          meta_token: metaToken,
          ig_account_id: igAccountId,
          fb_page_id: fbPageId,
          openai_key: openaiKey,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Gagal menyimpan')
      setMsg('✓ Tersimpan')
    } catch (e: any) {
      setMsg(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={{ minHeight: '100vh', background: DEEP }} />

  return (
    <div style={{ background: DEEP, minHeight: '100vh', color: WHITE, fontFamily: "'Poppins','IBM Plex Mono',sans-serif" }}>
      <style>{`
        input, textarea { transition: border-color .15s; }
        input:focus, textarea:focus { border-color: ${ICY} !important; outline: none; }
        .tog { cursor: pointer; user-select: none; }
        .tog:hover .tog-track { border-color: ${ICY}; }
      `}</style>

      {/* Header */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 20,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px',
        background: 'rgba(8,68,99,0.95)', backdropFilter: 'blur(12px)',
        borderBottom: `1px solid ${BORDER}`,
      }}>
        <Link href="/playground" style={{ textDecoration: 'none' }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: SAFFRON, letterSpacing: '-0.5px' }}>publisio</span>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: SLATE }}>{user?.email}</span>
          <Link href="/playground" style={{
            fontSize: 12, color: ICY, textDecoration: 'none',
            border: `1px solid ${ICY}`, borderRadius: 8, padding: '4px 12px',
          }}>
            ← Kembali
          </Link>
        </div>
      </header>

      <main style={{ maxWidth: 680, margin: '0 auto', padding: '40px 20px', display: 'flex', flexDirection: 'column', gap: 28 }}>

        {/* Page title */}
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: SAFFRON, margin: 0 }}>Setelan</h1>
          <p style={{ fontSize: 13, color: SLATE, marginTop: 6, lineHeight: 1.6 }}>
            Identitas brand dan koneksi akun — diterapkan ke setiap carousel yang kamu generate.
          </p>
        </div>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── IDENTITAS BRAND ── */}
          <section style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <h2 style={{ fontSize: 11, fontWeight: 700, color: ICY, margin: 0, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Identitas Brand
            </h2>

            {/* Logo */}
            <Field label="Logo" hint="Muncul di slide CTA. Upload file atau paste URL.">
              {logoUrl && (
                <img src={logoUrl} alt="logo" style={{ maxHeight: 56, alignSelf: 'flex-start', borderRadius: 8, border: `1px solid ${BORDER}`, background: PEACOCK, padding: 6, marginBottom: 4 }} />
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={logoUrl}
                  onChange={e => setLogoUrl(e.target.value)}
                  placeholder="https://.../logo.png"
                  style={{ ...inputStyle, flex: 1 }}
                />
                <label style={{
                  cursor: 'pointer', background: PEACOCK, color: SAFFRON,
                  border: `1px solid ${ICY}`, borderRadius: 10, padding: '11px 16px',
                  fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
                }}>
                  Upload
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={async (e) => {
                    const f = e.target.files?.[0]; if (!f) return
                    const r = new FileReader()
                    r.onload = async () => {
                      const base64 = (r.result as string).split(',')[1]
                      const res = await fetch('/api/settings/logo', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ imageBase64: base64, imageMimeType: f.type }),
                      })
                      const d = await res.json()
                      if (d.url) setLogoUrl(d.url)
                    }
                    r.readAsDataURL(f)
                  }} />
                </label>
              </div>

              {/* Logo toggle */}
              <div className="tog" onClick={() => setShowLogo(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                <div className="tog-track" style={{
                  width: 36, height: 20, borderRadius: 10,
                  background: showLogo ? SAFFRON : 'transparent',
                  border: `2px solid ${showLogo ? SAFFRON : SLATE}`,
                  position: 'relative', transition: 'all .15s', flexShrink: 0,
                }}>
                  <div style={{
                    position: 'absolute', top: 2,
                    left: showLogo ? 18 : 2,
                    width: 12, height: 12, borderRadius: '50%',
                    background: showLogo ? DEEP : SLATE,
                    transition: 'left .15s',
                  }} />
                </div>
                <span style={{ fontSize: 12, color: showLogo ? WHITE : SLATE }}>Tampilkan logo di slide</span>
              </div>
            </Field>

            {/* Brand Voice */}
            <Field label="Brand Voice" hint="Tone penulisan Beautifio. Dikirim ke AI sebagai konteks — bukan ditampilkan di slide.">
              <textarea
                value={brandVoice}
                onChange={e => setBrandVoice(e.target.value)}
                rows={5}
                placeholder="Contoh: Beautifio adalah ruang curhat perempuan. Tone-nya hangat, empati, tidak menghakimi. Kalimat pendek, human, jangan terlalu formal."
                style={{
                  ...inputStyle,
                  minHeight: 110, resize: 'vertical', lineHeight: 1.6,
                  fontFamily: "'Poppins',sans-serif", fontSize: 13,
                }}
              />
            </Field>

            {/* Instagram Handle */}
            <Field label="Handle Instagram" hint="Ditampilkan di pojok kanan bawah setiap slide.">
              <input
                type="text"
                value={instagramHandle}
                onChange={e => setInstagramHandle(e.target.value)}
                placeholder="@beautifio.space"
                style={inputStyle}
              />
            </Field>
          </section>

          {/* ── KONEKSI ── */}
          <section style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <h2 style={{ fontSize: 11, fontWeight: 700, color: ICY, margin: 0, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Koneksi
            </h2>

            <Field label="Meta Access Token" hint="Long-lived Page access token. Dimulai dengan EAA...">
              <input
                type="password"
                value={metaToken}
                onChange={e => setMetaToken(e.target.value)}
                placeholder="EAAAbc..."
                style={inputStyle}
                autoComplete="off"
              />
            </Field>

            <Field label="Instagram Account ID" hint="ID akun Instagram Business kamu. Wajib diisi untuk posting carousel.">
              <input
                value={igAccountId}
                onChange={e => setIgAccountId(e.target.value)}
                placeholder="17841400..."
                style={inputStyle}
              />
            </Field>

            <Field label="Facebook Page ID" hint="Opsional. Untuk cross-post ke halaman Facebook.">
              <input
                value={fbPageId}
                onChange={e => setFbPageId(e.target.value)}
                placeholder="123456789"
                style={inputStyle}
              />
            </Field>

            <Field label="OpenAI API Key" hint="Opsional. Untuk generate gambar via DALL-E jika Gemini Image tidak tersedia.">
              <input
                type="password"
                value={openaiKey}
                onChange={e => setOpenaiKey(e.target.value)}
                placeholder="sk-..."
                style={inputStyle}
                autoComplete="off"
              />
            </Field>
          </section>

          {/* ── UKURAN SLIDE ── */}
          <section style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h2 style={{ fontSize: 11, fontWeight: 700, color: ICY, margin: 0, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Ukuran Slide
            </h2>
            <p style={{ fontSize: 12, color: SLATE, margin: 0 }}>Default 1080×1350 (rasio 4:5, standar Instagram). Ubah hanya jika perlu.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="Lebar (px)">
                <input
                  type="number"
                  value={slideWidth}
                  onChange={e => setSlideWidth(Number(e.target.value) || 1080)}
                  style={inputStyle}
                />
              </Field>
              <Field label="Tinggi (px)">
                <input
                  type="number"
                  value={slideHeight}
                  onChange={e => setSlideHeight(Number(e.target.value) || 1350)}
                  style={inputStyle}
                />
              </Field>
            </div>
          </section>

          {/* Feedback message */}
          {msg && (
            <div style={{
              fontSize: 13, padding: '10px 14px', borderRadius: 10,
              color: msg.startsWith('✓') ? SAFFRON : '#ef4444',
              background: msg.startsWith('✓') ? 'rgba(255,198,79,0.08)' : 'rgba(239,68,68,0.08)',
              border: `1px solid ${msg.startsWith('✓') ? 'rgba(255,198,79,0.3)' : 'rgba(239,68,68,0.3)'}`,
            }}>
              {msg}
            </div>
          )}

          {/* Save button */}
          <button
            type="submit"
            disabled={saving}
            style={{
              minHeight: 48, background: saving ? SLATE : SAFFRON, color: DEEP,
              border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer',
              transition: 'background .15s', fontFamily: "'Poppins',sans-serif",
            }}
          >
            {saving ? 'Menyimpan...' : 'Simpan Setelan'}
          </button>
        </form>
      </main>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#1E2938' }} />}>
      <SettingsForm />
    </Suspense>
  )
}
