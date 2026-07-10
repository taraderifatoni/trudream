'use client';

import { useState, useRef, useMemo, useEffect, ChangeEvent } from 'react';
import Link from 'next/link'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase-client';

export const dynamic = 'force-dynamic';

function getUserFromCookie() {
  if (typeof document === 'undefined') return null
  try {
    const c = document.cookie.split('; ').find(r => r.startsWith('sb-user='))
    if (!c) return null
    return JSON.parse(decodeURIComponent(c.split('=')[1]))
  } catch { return null }
}

function signOutCookie() {
  document.cookie = 'sb-access-token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/'
  document.cookie = 'sb-refresh-token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/'
  document.cookie = 'sb-user=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/'
  window.location.href = '/'
}

/* ============================ Types ============================ */

type SlideType = 'cover' | 'bullets' | 'stat' | 'grid4' | 'quote' | 'cta';

interface Slide {
  type: SlideType;
  tag: string;
  title?: string;
  subtitle?: string;
  bullets?: string[];
  stats?: { value: string; label: string }[];
  cards?: { num: string; title: string; desc: string }[];
  quote?: string;
  source?: string;
  text?: string;
  imagePrompt: string;
  imagePath?: string;
  imageUrl?: string;
  assetSource?: 'original' | 'generate';
}

interface VideoSlide {
  type: 'video';
  localPath: string;
  publicUrl: string;
  durationSeconds: number;
}

interface GenResult {
  slides: Slide[];
  videoSlide: VideoSlide | null;
  caption: string;
  tag: string;
  extractedAssets?: Array<{ type: string; url: string; source: string; caption?: string }>;
}

interface HistoryEntry {
  id: string;
  createdAt: string;
  kind: 'carousel' | 'reel';
  caption: string;
  slideCount: number;
  hasVideo: boolean;
  thumbUrl?: string;
  instagram?: { ok: boolean; id?: string; permalink?: string; error?: string };
  facebook?: { ok: boolean; id?: string; error?: string };
  logs: string[];
}

interface PublishResponse {
  ok?: boolean;
  entry?: HistoryEntry;
  error?: string;
}

/* ============================ Design tokens ============================ */

const C = {
  lime: '#CDF22B',
  blue: '#1E45FB',
  black: '#1a1a1a',
  white: '#FFFFFF',
  dark: '#F5F5F0',
  gray: '#6b6b6b',
  screen: '#FFFFFF',
  // Aliases used by shared preview atoms (SlideContent, Spinner, Radio, Checkbox)
  accent: '#CDF22B',
  accentText: '#1a1a1a',
  text: '#1a1a1a',
  muted: '#6b6b6b',
  border: '#e0e0d8',
  surface: '#FFFFFF',
  surface2: '#F0F0E8',
  success: '#2D5016',
  error: '#dc2626',
}

  const VIDEO_HOSTS = [
  'youtube.com',
  'youtu.be',
  'x.com',
  'twitter.com',
  'tiktok.com',
  'instagram.com',
  'facebook.com',
  'fb.com',
  'fb.watch',
  'reddit.com',
  'vimeo.com',
  'twitch.tv',
];

const RATIOS = [
  { id: '4:5', label: '4:5', hint: 'IG Carousel' },
  { id: '1:1', label: '1:1', hint: 'Feed' },
  { id: '9:16', label: '9:16', hint: 'Story/Reel' },
  { id: '16:9', label: '16:9', hint: 'YouTube' },
] as const;

/* ============================ Helpers ============================ */

function isHttpUrl(s: string): boolean {
  const t = s.trim();
  return /^https?:\/\/\S+$/i.test(t);
}

function isVideoPlatformUrl(s: string): boolean {
  if (!isHttpUrl(s)) return false;
  const lower = s.toLowerCase();
  return VIDEO_HOSTS.some((h) => lower.includes(h));
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function fileToBase64(file: File): Promise<{ base64: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      const base64 = comma >= 0 ? result.slice(comma + 1) : result;
      resolve({ base64, mime: file.type || 'application/octet-stream' });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatHistoryTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const MAX_UPLOAD = 500 * 1024 * 1024; // 500MB

/* ============================ Slide preview renderer ============================ */

function SlideBadge({ tag }: { tag: string }) {
  return (
    <span
      style={{
        fontSize: 10,
        letterSpacing: 1,
        textTransform: 'uppercase',
        color: C.accent,
        border: `2px solid ${C.border}`,
        borderRadius: 4,
        padding: '2px 6px',
        display: 'inline-block',
      }}
    >
      {tag}
    </span>
  );
}

function SlideContent({ slide }: { slide: Slide }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {slide.tag ? <SlideBadge tag={slide.tag} /> : null}

      {slide.title ? (
        <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2, color: C.text }}>
          {slide.title}
        </div>
      ) : null}

      {slide.subtitle ? (
        <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.4 }}>{slide.subtitle}</div>
      ) : null}

      {slide.bullets && slide.bullets.length ? (
        <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 0, listStyle: 'none' }}>
          {slide.bullets.map((b, i) => (
            <li key={i} style={{ display: 'flex', gap: 8, fontSize: 14, color: C.text }}>
              <span style={{ color: C.accent }}>▸</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {slide.stats && slide.stats.length ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {slide.stats.map((s, i) => (
            <div
              key={i}
              style={{
                flex: '1 1 40%',
                background: C.surface2,
                border: `2px solid ${C.border}`,
                borderRadius: 8,
                padding: 12,
              }}
            >
              <div style={{ fontSize: 26, fontWeight: 700, color: C.accent }}>{s.value}</div>
              <div style={{ fontSize: 12, color: C.muted }}>{s.label}</div>
            </div>
          ))}
        </div>
      ) : null}

      {slide.cards && slide.cards.length ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {slide.cards.map((c, i) => (
            <div
              key={i}
              style={{
                background: C.surface2,
                border: `2px solid ${C.border}`,
                borderRadius: 8,
                padding: 12,
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 700, color: C.accent }}>{c.num}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginTop: 4 }}>{c.title}</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{c.desc}</div>
            </div>
          ))}
        </div>
      ) : null}

      {slide.quote ? (
        <div
          style={{
            borderLeft: `3px solid ${C.accent}`,
            paddingLeft: 12,
            fontSize: 18,
            fontStyle: 'italic',
            color: C.text,
            lineHeight: 1.4,
          }}
        >
          “{slide.quote}”
          {slide.source ? (
            <div style={{ fontSize: 12, color: C.muted, marginTop: 8, fontStyle: 'normal' }}>
              — {slide.source}
            </div>
          ) : null}
        </div>
      ) : null}

      {slide.text ? (
        <div style={{ fontSize: 15, color: C.text, lineHeight: 1.5 }}>{slide.text}</div>
      ) : null}
    </div>
  );
}

/* ============================ Small UI atoms ============================ */

function Spinner({ size = 16, color = C.accent }: { size?: number; color?: string }) {
  return (
    <span
      className="spin"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: `2px solid ${C.border}`,
        borderTopColor: color,
        boxSizing: 'border-box',
      }}
    />
  );
}

function Radio({ selected }: { selected: boolean }) {
  return (
    <span
      style={{
        width: 18,
        height: 18,
        borderRadius: '50%',
        border: `2px solid ${selected ? C.accent : C.border}`,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: '0 0 auto',
        boxSizing: 'border-box',
      }}
    >
      {selected ? (
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.accent }} />
      ) : null}
    </span>
  );
}

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <span
      style={{
        width: 18,
        height: 18,
        borderRadius: 4,
        border: `2px solid ${checked ? C.accent : C.border}`,
        background: checked ? C.accent : 'transparent',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: '0 0 auto',
        boxSizing: 'border-box',
      }}
    >
      {checked ? (
        <span
          style={{
            width: 5,
            height: 9,
            borderRight: `2px solid ${C.accentText}`,
            borderBottom: `2px solid ${C.accentText}`,
            transform: 'rotate(45deg)',
            marginTop: -2,
          }}
        />
      ) : null}
    </span>
  );
}

/* ============================ Main Page ============================ */

export default function Page() {
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<{email: string} | null>(null);
  const [brandLogoUrl, setBrandLogoUrl] = useState('');
  useEffect(() => {
    setMounted(true);
    // Handle OAuth callback: Supabase returns tokens in URL hash
    if (typeof window !== 'undefined' && window.location.hash) {
      const h = window.location.hash.substring(1);
      const p = new URLSearchParams(h);
      const at = p.get('access_token');
      const rt = p.get('refresh_token');
      if (at) {
        const exp = new Date(Date.now() + 3600 * 1000).toUTCString();
        document.cookie = `sb-access-token=${at}; expires=${exp}; path=/; SameSite=Lax`
        if (rt) document.cookie = `sb-refresh-token=${rt}; expires=${exp}; path=/; SameSite=Lax`
        // Fetch user info from token using Supabase API
        const UA = navigator.userAgent || ''
        fetch(`${SUPABASE_URL}/auth/v1/user`, {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${at}`,
          }
        }).then(r => r.json()).then(u => {
          if (u.email) {
            document.cookie = `sb-user=${JSON.stringify({email: u.email})}; expires=${exp}; path=/; SameSite=Lax`
            setUser({email: u.email})
          }
        })
        // Clean URL
        window.history.replaceState(null, '', '/playground')
      }
    }
    setUser(getUserFromCookie());
  }, []);
  useEffect(() => { fetch('/api/brand').then(r=>r.json()).then(d=>setBrandLogoUrl(d.logo_url||'')).catch(()=>{}) }, []);

  useEffect(() => {
    if (!mounted || !user) return
    fetch('/api/settings', { credentials: 'include' }).then(r => r.json()).then(d => {
      if (!d.error && !d.brand_voice) setShowBrandModal(true)
      if (d.brand_voice) setBrandVoice(d.brand_voice)
    }).catch(() => {})
  }, [mounted, user])
  // input state
  const [textValue, setTextValue] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  // Reference screenshots for clone-style feature
  const [refScreenshots, setRefScreenshots] = useState<Array<{ file: File; preview: string; base64: string }>>([])
  const refInputRef = useRef<HTMLInputElement | null>(null)
  const [referenceUrl, setReferenceUrl] = useState('')

  // flow state
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0); // 0 idle, 1..4
  const [error, setError] = useState('');
  const [result, setResult] = useState<GenResult | null>(null);
  const [caption, setCaption] = useState('');

  // preview modal
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [previewVideo, setPreviewVideo] = useState(false);

  // caption copy
  const [copied, setCopied] = useState(false);

  // download / publish
  const [downloading, setDownloading] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishMode, setPublishMode] = useState<'carousel' | 'reel'>('carousel');
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');
  const [postToFacebook, setPostToFacebook] = useState(false);
  const [toast, setToast] = useState(false);
  const [toastLink, setToastLink] = useState('');
  const [toastFb, setToastFb] = useState(false);

  // history
  const [historyOpen, setHistoryOpen] = useState(true);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});

  const [showBrandModal, setShowBrandModal] = useState(false);
  const [brandVoice, setBrandVoice] = useState('');
  const [brandVoiceSaved, setBrandVoiceSaved] = useState(false);

  const [contentMode, setContentMode] = useState<'full-ai' | 'source-first'>('source-first');
  const [aspectRatio, setAspectRatio] = useState<'4:5' | '9:16' | '1:1' | '16:9'>('4:5');

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const stepTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const inputBadge = useMemo(() => {
    const v = textValue.trim();
    if (!v) return null;
    if (isVideoPlatformUrl(v)) return { label: 'Video platform' };
    if (isHttpUrl(v)) return { label: 'Link artikel' };
    return null;
  }, [textValue]);

  const hasVideo = useMemo(() => {
    const v = textValue.trim()
    if (v && VIDEO_HOSTS.some(h => v.toLowerCase().includes(h))) return true
    if (videoFile) return true
    return false
  }, [textValue, videoFile])

  const canSubmit = useMemo(() => {
    return (!!textValue.trim() || !!imageFile || !!videoFile) && !loading;
  }, [textValue, imageFile, videoFile, loading]);

  /* -------- textarea autogrow -------- */
  function handleTextChange(e: ChangeEvent<HTMLTextAreaElement>) {
    setTextValue(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, 96)}px`;
  }

  /* -------- file upload -------- */
  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    setError('');
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_UPLOAD) {
      setError(`File terlalu besar (${humanSize(f.size)}). Maksimal 500MB.`);
      e.target.value = '';
      return;
    }
    if (f.type.startsWith('image/')) {
      setImageFile(f);
      setVideoFile(null);
      const url = URL.createObjectURL(f);
      setImagePreview(url);
    } else if (f.type.startsWith('video/')) {
      setVideoFile(f);
      setImageFile(null);
      setImagePreview('');
    } else {
      setError('Format tidak didukung. Gunakan jpg, png, webp, mp4, mov, atau webm.');
    }
    e.target.value = '';
  }

  function removeImage() {
    setImageFile(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview('');
  }

  function removeVideo() {
    setVideoFile(null);
  }

  /* -------- reference screenshots -------- */
  function handleRefScreenshots(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    files.forEach(f => {
      if (!f.type.startsWith('image/')) return
      const reader = new FileReader()
      reader.onload = () => {
        const result = String(reader.result || '')
        const comma = result.indexOf(',')
        setRefScreenshots(prev => [...prev, { file: f, preview: result, base64: comma >= 0 ? result.slice(comma + 1) : result }])
      }
      reader.readAsDataURL(f)
    })
    if (e.target) e.target.value = ''
  }
  function removeRefScreenshot(index: number) {
    setRefScreenshots(prev => prev.filter((_, i) => i !== index))
  }

  /* -------- staged progress -------- */
  function startProgress() {
    clearTimers();
    setStep(1);
    const maxSteps = hasVideo ? 4 : 3
    stepTimers.current.push(setTimeout(() => setStep((s) => (s < 2 ? 2 : s)), 2500));
    stepTimers.current.push(setTimeout(() => setStep((s) => (s < maxSteps ? maxSteps : s)), 7000));
  }

  function clearTimers() {
    stepTimers.current.forEach((t) => clearTimeout(t));
    stepTimers.current = [];
  }

  /* -------- generate -------- */
  const [progressLabel, setProgressLabel] = useState('');
  const [progressPct, setProgressPct] = useState(0);
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);

  async function handleGenerate() {
    if (!canSubmit) return;
    setError('');
    setResult(null);
    setLoading(true);
    setProgressLabel('Starting...');
    setProgressPct(0);
    setProgressCurrent(0);
    setProgressTotal(0);

    try {
      const v = textValue.trim();
      const body: { text?: string; url?: string; imageBase64?: string; imageMimeType?: string; contentMode?: string; aspectRatio?: string } = {};

      const useAsUrl = isVideoPlatformUrl(v);
      let textPayload = useAsUrl ? '' : v;
      if (videoFile) {
        const note = `[uploaded video: ${videoFile.name}]`;
        textPayload = textPayload ? `${textPayload}\n${note}` : note;
      }
      if (useAsUrl) body.url = v;
      if (textPayload) body.text = textPayload;
      if (imageFile) {
        const { base64, mime } = await fileToBase64(imageFile);
        body.imageBase64 = base64;
        body.imageMimeType = mime;
      }
      body.contentMode = contentMode;
       body.aspectRatio = aspectRatio;
      if (refScreenshots.length > 0) {
        ;(body as any).refScreenshots = refScreenshots.map(r => ({ base64: r.base64, mimeType: r.file.type }))
      }
      if (referenceUrl.trim()) {
        ;(body as any).referenceUrl = referenceUrl.trim()
      }

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as any)?.error || `Gagal generate (HTTP ${res.status})`);
      }

      // Read SSE stream
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) { processLines(buffer); break; }
        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE messages (delimited by \n\n)
        let idx: number;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const msg = buffer.substring(0, idx);
          buffer = buffer.substring(idx + 2);
          processLine(msg);
        }
      }

      function processLines(remainder: string) { if (remainder) processLine(remainder); }
      function processLine(msg: string) {
        if (!msg.startsWith('data: ')) return;
        try {
          const data = JSON.parse(msg.slice(6));
          if (data.type === 'done') {
              setResult(data.result);
              setCaption(data.result.caption || '');
              setPublishMode('carousel');
              setProgressLabel('Done');
              setProgressPct(100);
            } else if (data.type === 'error') {
              throw new Error(data.error);
            } else {
              setProgressLabel(data.label || data.step || '');
              setProgressPct(data.pct || 0);
              setProgressCurrent(data.current || 0);
              setProgressTotal(data.total || 0);
              setStep(data.pct ? Math.min(Math.ceil(data.pct / 25), 4) : 1);
            }
          } catch (e: any) {
            if (e.message && !e.message.startsWith('SyntaxError')) throw e;
          }
        }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Terjadi kesalahan.');
    } finally {
      setLoading(false);
    }
  }

  /* -------- copy caption -------- */
  async function copyCaption() {
    try {
      await navigator.clipboard.writeText(caption);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Tidak bisa menyalin caption.');
    }
  }

  /* -------- download ZIP -------- */
  async function handleDownload() {
    if (!result) return;
    setDownloading(true);
    setError('');
    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slides: result.slides, videoSlide: result.videoSlide }),
      });
      if (!res.ok) throw new Error(`Gagal download (HTTP ${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'carousel.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mengunduh ZIP.');
    } finally {
      setDownloading(false);
    }
  }

  /* -------- history -------- */
  async function fetchHistory() {
    try {
      const res = await fetch('/api/history');
      if (!res.ok) return;
      const data: { entries?: HistoryEntry[] } = await res.json();
      setHistoryEntries(Array.isArray(data.entries) ? data.entries : []);
    } catch {
      /* ignore history fetch errors */
    }
  }

  useEffect(() => {
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleLog(id: string) {
    setExpandedLogs((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  /* -------- publish -------- */
  function openPublish() {
    setPublishError('');
    setPublishMode('carousel');
    setPostToFacebook(false);
    setPublishOpen(true);
  }

  async function handlePublish() {
    if (!result) return;
    setPublishing(true);
    setPublishError('');
    try {
      // Only image slides go in the slides array; carousel also sends the video
      // as a separate item via videoUrl, reel builds a slideshow server-side.
      const imageSlides = result.slides
        .filter((s) => s.imageUrl)
        .map((s) => ({ imageUrl: s.imageUrl as string }));

      const body: {
        mode: 'carousel' | 'reel';
        slides: { imageUrl: string }[];
        caption: string;
        facebook: boolean;
        videoUrl?: string;
      } = {
        mode: publishMode,
        slides: imageSlides,
        caption,
        facebook: postToFacebook,
      };

      // Send the video for both modes when present: carousel uses it as slide 2,
      // reel stitches it in (cover -> video with original audio -> rest of slides).
      if (result.videoSlide) {
        body.videoUrl = result.videoSlide.publicUrl;
      }

      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j: PublishResponse = await res.json().catch(() => ({}));

      // Fatal / bad request (no entry returned)
      if (!res.ok && !j?.entry) {
        throw new Error(j?.error || `Gagal posting (HTTP ${res.status})`);
      }

      // IG failure but entry returned (502 ok:false)
      if (j?.ok === false || (!res.ok && j?.entry)) {
        setPublishError(
          j?.entry?.instagram?.error || j?.error || 'Gagal posting ke Instagram.',
        );
        return;
      }

      // Success
      setToastLink(j?.entry?.instagram?.permalink || '');
      setToastFb(!!j?.entry?.facebook?.ok);
      setPublishOpen(false);
      setToast(true);
      setTimeout(() => setToast(false), 6000);
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : 'Gagal posting ke Instagram.');
    } finally {
      setPublishing(false);
      // Always refresh history after an attempt (success or fail).
      fetchHistory();
    }
  }

  const steps = hasVideo ? ['Analyzing with Gemini', 'Generating images', 'Processing video', 'Done'] : ['Analyzing with Gemini', 'Generating images', 'Done'];

  /* ============================ Render ============================ */

  return (
    <div
      style={{
        background: '#FAFAF8',
        minHeight: '100vh',
        color: '#1A1A1A',
        fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
        position: 'relative',
        zIndex: 2,
      }}
    >
      <style>{`
        @keyframes spin { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }
        @keyframes blink { 0%,100% { opacity: 1;} 50% { opacity: 0.2;} }
        @keyframes pulseGlow { 0%,100% { box-shadow: 0 0 20px rgba(205,242,43,0.08);} 50% { box-shadow: 0 0 40px rgba(30,69,251,0.15);} }
        .spin { display:inline-block; animation: spin 0.7s linear infinite; }
        .blink { animation: blink 1.2s steps(1) infinite; }
        .pixel { font-family: 'Press Start 2P', monospace; letter-spacing: 0; line-height: 1.6; }
        .mono { font-family: 'IBM Plex Mono', 'Courier New', monospace; }
        textarea, input, button { font-family: 'IBM Plex Mono', 'Courier New', monospace; }
        textarea::placeholder { color: #8b8b83 !important; }
        .abtn { transition: transform .06s ease, box-shadow .06s ease, background .15s ease; }
        .abtn:not(:disabled):hover { transform: translate(-1px,-2px); box-shadow: 4px 4px 0 rgba(205,242,43,0.6); }
        .abtn:not(:disabled):active { transform: translate(2px,2px); box-shadow: 0px 0px 0 rgba(0,0,0,0); }
        *::-webkit-scrollbar { height: 6px; width: 6px; }
        *::-webkit-scrollbar-track { background:${C.dark}; }
        *::-webkit-scrollbar-thumb { background:${C.gray}; border-radius: 0; }
      `}</style>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 16px', position: 'relative', zIndex: 2 }}>
        {/* ============ Header ============ */}
        <header
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 0',
            background: 'rgba(250,250,248,0.94)',
            backdropFilter: 'blur(12px)',
            borderBottom: `1px solid rgba(0,0,0,0.08)`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="blink" style={{ width: 6, height: 6, background: C.lime, display: 'inline-block' }} />
            {brandLogoUrl ? <img src={brandLogoUrl} style={{height:24}} /> : <span className="pixel" style={{ fontSize: 10, color: C.lime }}>publisio</span>}
            <span style={{ fontSize: 9, color: '#666666', marginLeft: 6 }}>
              TOKYO-01
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 9, color: '#666666', fontFamily: "'IBM Plex Mono', monospace" }}>60 FPS</span>
            <span className="pixel" style={{ fontSize: 7, color: '#666666', border: `1px solid #666666`, padding: '3px 7px' }}>
              v1.0
            </span>
            {user ? (
              <>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', fontFamily: "'IBM Plex Mono', monospace", maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.email}
                </span>
                <Link href="/settings" className="pixel" style={{ fontSize: 7, color: C.lime, textDecoration: 'none', border: `1px solid ${C.lime}`, padding: '4px 7px' }}>
                  SET
                </Link>
                <button onClick={signOutCookie} className="pixel" style={{ fontSize: 7, color: 'rgba(255,255,255,0.8)', background: 'transparent', border: `1px solid rgba(255,255,255,0.3)`, padding: '4px 7px', cursor: 'pointer' }}>
                  OUT
                </button>
              </>
            ) : (
              <span className="pixel" style={{ fontSize: 7, color: 'rgba(255,255,255,0.8)', border: `1px solid rgba(255,255,255,0.3)`, padding: '3px 7px' }}>
                user
              </span>
            )}
          </div>
        </header>

        <main style={{ display: 'flex', flexDirection: 'column', gap: 28, paddingTop: 32, paddingBottom: 60 }}>
          {/* ============ Hero ============ */}
          <section style={{ textAlign: 'center', padding: '40px 0 20px' }}>
            <h1 className="pixel" style={{
              fontSize: 28,
              color: C.white,
              textShadow: `3px 3px 0 #1E45FB`,
              lineHeight: 1.5,
              margin: 0,
              wordBreak: 'break-word',
            }}>
              PLAYLGROUND
            </h1>
            <p style={{ fontSize: 13, color: C.gray, marginTop: 18, maxWidth: 420, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
              Paste a link or type your topic — we handle the rest.
            </p>
            <div style={{ marginTop: 12 }}>
              <span style={{ fontSize: 10, color: '#666666' }}>● ONLINE</span>
              <span style={{ fontSize: 10, color: '#666666', margin: '0 8px' }}>•••</span>
              <span style={{ fontSize: 10, color: '#666666' }}>● TOKYO-01</span>
            </div>
          </section>

          {/* ============ Reference Upload (Clone Style) ============ */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="pixel" style={{ fontSize: 8, color: C.gray }}>REFERENSI FORMAT (opsional)</span>
            </div>
            <input
              type="text"
              value={referenceUrl}
              onChange={(e) => setReferenceUrl(e.target.value)}
              placeholder="Paste link IG carousel..."
              style={{
                width: '100%',
                padding: '8px 12px',
                background: '#111118',
                border: `1px solid ${C.lime}`,
                borderRadius: 8,
                color: C.white,
                fontSize: 13,
                outline: 'none',
                fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
                boxSizing: 'border-box',
              }}
            />
            <div style={{ textAlign: 'center', fontSize: 10, color: C.gray }}>atau</div>
            <label className="pixel" style={{ fontSize: 7, color: C.blue, border: `1px solid ${C.blue}`, padding: '4px 8px', borderRadius: 6, cursor: 'pointer', textAlign: 'center' }}>
              + UPLOAD CONTOH
              <input ref={refInputRef} type="file" accept="image/*" multiple onChange={handleRefScreenshots} style={{ display: 'none' }} />
            </label>
            {refScreenshots.length > 0 ? (
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                {refScreenshots.map((ref, i) => (
                  <div key={i} style={{ position: 'relative', flex: '0 0 auto', width: 80, height: 100, borderRadius: 8, overflow: 'hidden', border: `1px solid ${C.blue}` }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={ref.preview} alt={`ref ${i+1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <button onClick={() => removeRefScreenshot(i)} style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                  </div>
                ))}
              </div>
            ) : <div style={{ fontSize: 10, color: C.gray }}>Upload screenshot slide-slide Instagram sebagai referensi format</div>}
          </section>

          {/* ============ Input Card ============ */}
          <section
            style={{
              background: C.blue,
              border: `1px solid rgba(255,255,255,0.12)`,
              borderRadius: 14,
              padding: '20px 22px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            {/* Content Mode selector */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="pixel" style={{ fontSize: 8, color: C.lime }}>CONTENT MODE</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setContentMode('full-ai')}
                  className="pixel"
                  style={{
                    padding: '6px 16px',
                    borderRadius: 20,
                    fontSize: 9,
                    border: contentMode === 'full-ai' ? 'none' : `1px solid rgba(255,255,255,0.2)`,
                    background: contentMode === 'full-ai' ? '#1E45FB' : 'transparent',
                    color: contentMode === 'full-ai' ? '#FFFFFF' : '#888888',
                    cursor: 'pointer',
                  }}
                >
                  Full AI
                </button>
                <button
                  onClick={() => setContentMode('source-first')}
                  className="pixel"
                  style={{
                    padding: '6px 16px',
                    borderRadius: 20,
                    fontSize: 9,
                    border: contentMode === 'source-first' ? 'none' : `1px solid rgba(255,255,255,0.2)`,
                    background: contentMode === 'source-first' ? '#1E45FB' : 'transparent',
                    color: contentMode === 'source-first' ? '#FFFFFF' : '#888888',
                    cursor: 'pointer',
                  }}
                >
                  Source First
                </button>
              </div>
            </div>

            {/* Aspect Ratio selector */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="pixel" style={{ fontSize: 8, color: C.lime }}>RATIO</span>
              <div style={{ display: 'flex', gap: 8 }}>
                {RATIOS.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setAspectRatio(r.id)}
                    className="pixel"
                    style={{
                      padding: '6px 16px',
                      borderRadius: 20,
                      fontSize: 9,
                      border: aspectRatio === r.id ? 'none' : `1px solid rgba(255,255,255,0.2)`,
                      background: aspectRatio === r.id ? '#1E45FB' : 'transparent',
                      color: aspectRatio === r.id ? '#FFFFFF' : '#888888',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 2,
                      lineHeight: 1.3,
                    }}
                  >
                    <span>{r.label}</span>
                    <span style={{ fontSize: 7, opacity: 0.7 }}>{r.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            <textarea
              ref={textareaRef}
              value={textValue}
              onChange={handleTextChange}
              rows={4}
              placeholder="Paste link, teks, atau ketik konten di sini..."
              style={{
                width: '100%',
                minHeight: 96,
                resize: 'none',
                background: '#111118',
                border: `1px solid ${C.lime}`,
                borderRadius: 10,
                color: C.white,
                padding: 14,
                fontSize: 15,
                lineHeight: 1.5,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />

            {inputBadge ? (
              <div>
                <span
                  className="pixel"
                  style={{
                    fontSize: 8,
                    color: C.blue,
                    background: C.dark,
                    border: `1px solid ${C.blue}`,
                    borderRadius: 6,
                    padding: '5px 9px',
                    display: 'inline-block',
                  }}
                >
                  {inputBadge.label}
                </span>
              </div>
            ) : null}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleGenerate}
                disabled={!canSubmit}
                className={`pixel ${canSubmit ? 'abtn' : ''}`}
                style={{
                  flex: '1 1 auto',
                  minHeight: 46,
                   background: canSubmit ? C.lime : 'rgba(255,255,255,0.08)',
                  color: canSubmit ? C.black : 'rgba(255,255,255,0.4)',
                  border: `1px solid ${canSubmit ? C.lime : 'rgba(255,255,255,0.15)'}`,
                  borderRadius: 12,
                  fontSize: 11,
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                  boxShadow: canSubmit ? '4px 4px 0 rgba(205,242,43,0.3)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                {loading ? (
                  <>
                    <span
                      className="spin"
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: '50%',
                        border: `2px solid rgba(0,0,0,0.2)`,
                        borderTopColor: C.black,
                        boxSizing: 'border-box',
                      }}
                    />{' '}
                    LOADING…
                  </>
                ) : (
                  '▶ GO'
                )}
              </button>

              <label
                className="pixel"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 46,
                  padding: '0 16px',
                  background: 'rgba(255,255,255,0.1)',
                  border: `1px solid ${C.lime}`,
                  borderRadius: 12,
                  color: C.lime,
                  fontSize: 9,
                  cursor: 'pointer',
                  flex: '0 1 auto',
                  whiteSpace: 'nowrap',
                }}
              >
                + Upload
                <input
                  ref={imageInputRef}
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.mp4,.mov,.webm,image/*,video/*"
                  onChange={handleFile}
                  style={{ display: 'none' }}
                />
              </label>
            </div>

            {imageFile && imagePreview ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  background: C.dark,
                  border: `1px solid rgba(0,0,0,0.08)`,
                  borderRadius: 10,
                  padding: 8,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imagePreview}
                  alt="preview"
                  style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8 }}
                />
                <div style={{ flex: 1, fontSize: 12, color: C.black, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {imageFile.name}
                  <div style={{ color: C.muted, fontSize: 11 }}>{humanSize(imageFile.size)}</div>
                </div>
                <button
                  onClick={removeImage}
                  style={{
                    minWidth: 40,
                    minHeight: 40,
                    background: 'transparent',
                    border: 'none',
                    color: C.muted,
                    fontSize: 16,
                    cursor: 'pointer',
                  }}
                >
                  ✕
                </button>
              </div>
            ) : null}

            {videoFile ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  background: C.dark,
                  border: `1px solid rgba(0,0,0,0.08)`,
                  borderRadius: 10,
                  padding: 8,
                }}
              >
                <div
                  className="pixel"
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 8,
                    background: C.blue,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 7,
                    color: C.lime,
                    textTransform: 'uppercase',
                  }}
                >
                  VID
                </div>
                <div style={{ flex: 1, fontSize: 12, color: C.black, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {videoFile.name}
                  <div style={{ color: C.muted, fontSize: 11 }}>{humanSize(videoFile.size)}</div>
                </div>
                <button
                  onClick={removeVideo}
                  style={{
                    minWidth: 40,
                    minHeight: 40,
                    background: 'transparent',
                    border: 'none',
                    color: C.muted,
                    fontSize: 16,
                    cursor: 'pointer',
                  }}
                >
                  ✕
                </button>
              </div>
            ) : null}

            {error ? (
              <div
                style={{
                  background: 'rgba(248,113,113,0.1)',
                  border: `1px solid rgba(255,60,60,0.5)`,
                  color: '#f87171',
                  borderRadius: 10,
                  padding: '10px 12px',
                  fontSize: 13,
                }}
              >
                {error}
              </div>
            ) : null}
          </section>

          {/* ============ Progress ============ */}
          {loading || (step > 0 && step < 4) ? (
            <section
              style={{
                background: C.blue,
                border: `1px solid rgba(0,0,0,0.08)`,
                borderRadius: 14,
                padding: 18,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div className="pixel" style={{ fontSize: 9, color: C.lime, marginBottom: 4 }}>
                {progressLabel || 'Processing...'}
              </div>
              {/* Progress bar */}
              <div style={{ height: 8, background: 'rgba(255,255,255,0.12)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${progressPct}%`, background: C.lime, borderRadius: 4, transition: 'width 0.3s ease' }} />
              </div>
              <div style={{ fontSize: 11, color: C.white, textAlign: 'right' }}>
                {progressPct}%
                {progressTotal > 0 ? ` — ${progressCurrent}/${progressTotal}` : ''}
              </div>
            </section>
          ) : null}

          {/* ============ Results ============ */}
          {result ? (
            <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="pixel" style={{ fontSize: 9, color: C.white }}>
                <span style={{ color: C.lime }}>{result.slides.length}</span> SLIDES ·{' '}
                <span style={{ color: C.blue }}>{result.tag}</span>
              </div>

              {/* thumbnail strip */}
              <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6 }}>
                {result.slides.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setPreviewVideo(false);
                      setPreviewIndex(i);
                    }}
                    style={{
                      flex: '0 0 auto',
                      width: 120,
                      height: 150,
                      borderRadius: 10,
                      border: `1px solid rgba(255,255,255,0.08)`,
                      background: s.imageUrl
                        ? `#000 center/cover no-repeat url("${s.imageUrl}")`
                        : C.screen,
                      position: 'relative',
                      padding: 8,
                      cursor: 'pointer',
                      overflow: 'hidden',
                      textAlign: 'left',
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: s.imageUrl
                          ? 'linear-gradient(to top, rgba(0,0,0,0.8), rgba(0,0,0,0.05))'
                          : 'transparent',
                      }}
                    />
                    {result.extractedAssets && result.extractedAssets.length > 0 && (s as any).assetSource ? (
                      <span style={{ position: 'absolute', top: 4, right: 4, fontSize: 10, zIndex: 2 }}>
                        {(s as any).assetSource === 'original' ? '🖼' : '🤖'}
                      </span>
                    ) : null}
                    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 6, height: '100%' }}>
                      <span className="pixel" style={{ fontSize: 7, color: C.lime, textTransform: 'uppercase' }}>
                        {s.tag || s.type}
                      </span>
                      <div style={{ marginTop: 'auto' }}>
                        <div style={{ fontSize: 10, color: C.white, lineHeight: 1.25, fontWeight: 700 }}>
                          {s.title || s.quote || s.text || s.type}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}

                {result.videoSlide ? (
                  <button
                    onClick={() => {
                      setPreviewVideo(true);
                      setPreviewIndex(null);
                    }}
                    style={{
                      flex: '0 0 auto',
                      width: 120,
                      height: 150,
                      borderRadius: 10,
                      border: `1px solid ${C.blue}`,
                      background: '#000',
                      position: 'relative',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <span
                      style={{
                        width: 0,
                        height: 0,
                        borderTop: '11px solid transparent',
                        borderBottom: '11px solid transparent',
                        borderLeft: `18px solid ${C.lime}`,
                        marginLeft: 4,
                      }}
                    />
                    <span style={{ position: 'absolute', bottom: 6, left: 8, fontSize: 9, color: C.gray }}>
                      {result.videoSlide.durationSeconds}s video
                    </span>
                  </button>
                ) : null}
              </div>

              {/* caption editor */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="pixel" style={{ fontSize: 9, color: C.white }}>CAPTION</span>
                  <button
                    onClick={copyCaption}
                    className="pixel abtn"
                    style={{
                      minHeight: 32,
                      padding: '6px 12px',
                      background: C.screen,
                      border: `1px solid rgba(0,0,0,0.1)`,
                      borderRadius: 8,
                      color: copied ? C.blue : C.gray,
                      fontSize: 8,
                      cursor: 'pointer',
                    }}
                  >
                    {copied ? 'OK' : 'COPY'}
                  </button>
                </div>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={5}
                  style={{
                    width: '100%',
                    background: C.white,
                    border: `1px solid rgba(0,0,0,0.1)`,
                    borderRadius: 10,
                    color: C.black,
                    padding: 12,
                    fontSize: 13,
                    lineHeight: 1.5,
                    resize: 'vertical',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* action buttons */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={handleDownload}
                  disabled={downloading}
                  className={`pixel ${downloading ? '' : 'abtn'}`}
                  style={{
                    flex: 1,
                    minHeight: 46,
                    background: C.blue,
                    border: `1px solid ${C.blue}`,
                    borderRadius: 12,
                    color: C.white,
                    fontSize: 10,
                    cursor: downloading ? 'not-allowed' : 'pointer',
                  }}
                >
                  {downloading ? 'WAIT…' : '↓ ZIP'}
                </button>
                <button
                  onClick={openPublish}
                  className="pixel abtn"
                  style={{
                    flex: 1,
                    minHeight: 46,
                    background: C.lime,
                    border: `1px solid ${C.lime}`,
                    borderRadius: 12,
                    color: C.black,
                    fontSize: 10,
                    cursor: 'pointer',
                    boxShadow: '4px 4px 0 rgba(205,242,43,0.3)',
                  }}
                >
                  ▶ POST IG
                </button>
              </div>
            </section>
          ) : null}

          {/* ============ History ============ */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4, background: C.blue, border: `1px solid rgba(0,0,0,0.15)`, borderRadius: 14, padding: 16 }}>
            <button
              onClick={() => setHistoryOpen((v) => !v)}
              className="pixel abtn"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                minHeight: 46,
                padding: '0 14px',
                background: C.lime,
                border: `1px solid rgba(0,0,0,0.15)`,
                borderRadius: 12,
                color: C.black,
                fontSize: 11,
                cursor: 'pointer',
                boxShadow: '4px 4px 0 rgba(0,0,0,0.1)',
              }}
            >
              <span>
                RIWAYAT <span style={{ color: 'rgba(0,0,0,0.4)' }}>({historyEntries.length})</span>
              </span>
              <span style={{ color: 'rgba(0,0,0,0.4)' }}>{historyOpen ? '▾' : '▸'}</span>
            </button>

            {historyOpen ? (
              historyEntries.length === 0 ? (
                <div style={{ fontSize: 13, color: C.muted, padding: '4px 2px' }}>
                  Belum ada riwayat
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {historyEntries.map((entry) => {
                    const open = !!expandedLogs[entry.id];

                    return (
                      <div
                        key={entry.id}
                        style={{
                          background: 'rgba(0,0,0,0.15)',
                          border: `1px solid rgba(0,0,0,0.12)`,
                          borderRadius: 12,
                          padding: 12,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                        }}
                      >
                        <div style={{ display: 'flex', gap: 10 }}>
                          {entry.thumbUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={entry.thumbUrl}
                              alt="thumb"
                              style={{
                                width: 56,
                                height: 70,
                                objectFit: 'cover',
                                borderRadius: 8,
                                border: `1px solid rgba(0,0,0,0.08)`,
                                flex: '0 0 auto',
                              }}
                            />
                          ) : (
                            <div
                              className="pixel"
                              style={{
                                width: 56,
                                height: 70,
                                borderRadius: 8,
                                background: C.white,
                                border: `1px solid rgba(0,0,0,0.08)`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 7,
                                color: C.gray,
                                textTransform: 'uppercase',
                                flex: '0 0 auto',
                              }}
                            >
                              {entry.hasVideo ? 'VID' : 'IMG'}
                            </div>
                          )}

                          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span
                                className="pixel"
                                style={{
                                  fontSize: 7,
                                  color: C.blue,
                                  border: `1px solid rgba(30,69,251,0.4)`,
                                  borderRadius: 5,
                                  padding: '3px 6px',
                                  textTransform: 'uppercase',
                                }}
                              >
                                {entry.kind === 'reel' ? 'Reel' : 'Carousel'}
                              </span>
                              <span style={{ fontSize: 11, color: C.muted }}>
                                {formatHistoryTime(entry.createdAt)}
                              </span>
                            </div>
                            <div
                              style={{
                                fontSize: 12,
                                color: C.white,
                                lineHeight: 1.3,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {entry.caption || '—'}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              {entry.instagram?.ok && entry.instagram.permalink ? (
                                <a
                                  href={entry.instagram.permalink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 600,
                                    color: C.blue,
                                    border: `1px solid ${C.blue}`,
                                    borderRadius: 5,
                                    padding: '2px 6px',
                                    textDecoration: 'none',
                                  }}
                                >
                                  IG: Berhasil
                                </a>
                              ) : (
                                <span
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 600,
                                    color: entry.instagram?.ok ? C.blue : '#dc2626',
                                    border: `1px solid ${entry.instagram?.ok ? C.blue : '#dc2626'}`,
                                    borderRadius: 5,
                                    padding: '2px 6px',
                                  }}
                                >
                                  {entry.instagram?.ok ? 'IG: Berhasil' : 'IG: Gagal'}
                                </span>
                              )}

                              {entry.facebook ? (
                                <span
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 600,
                                    color: entry.facebook.ok ? C.blue : '#dc2626',
                                    border: `1px solid ${entry.facebook.ok ? C.blue : '#dc2626'}`,
                                    borderRadius: 5,
                                    padding: '2px 6px',
                                  }}
                                >
                                  {entry.facebook.ok ? 'FB: Berhasil' : 'FB: Gagal'}
                                </span>
                              ) : null}

                              <span style={{ fontSize: 11, color: C.muted }}>
                                {entry.slideCount} slide
                              </span>
                            </div>
                          </div>
                        </div>

                        {entry.logs && entry.logs.length ? (
                          <button
                            onClick={() => toggleLog(entry.id)}
                            style={{
                              alignSelf: 'flex-start',
                              minHeight: 28,
                              padding: '2px 8px',
                              background: 'rgba(0,0,0,0.05)',
                              border: `1px solid rgba(0,0,0,0.1)`,
                              borderRadius: 6,
                              color: C.muted,
                              fontSize: 11,
                              cursor: 'pointer',
                            }}
                          >
                            Log {open ? '▴' : '▾'}
                          </button>
                        ) : null}

                        {open ? (
                          <div
                            style={{
                              background: C.white,
                              border: `1px solid rgba(0,0,0,0.08)`,
                              borderRadius: 8,
                              padding: 8,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 3,
                            }}
                          >
                            {entry.logs.map((line, i) => (
                              <div
                                key={i}
                                style={{ fontSize: 11, color: C.gray, lineHeight: 1.4, wordBreak: 'break-word' }}
                              >
                                {line}
                              </div>
                            ))}
                            {entry.instagram?.error ? (
                              <div style={{ fontSize: 11, color: '#dc2626', lineHeight: 1.4, wordBreak: 'break-word' }}>
                                IG: {entry.instagram.error}
                              </div>
                            ) : null}
                            {entry.facebook?.error ? (
                              <div style={{ fontSize: 11, color: '#dc2626', lineHeight: 1.4, wordBreak: 'break-word' }}>
                                FB: {entry.facebook.error}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )
            ) : null}
          </section>

          {/* ============ Feature Cards ============ */}
          {!result ? (
            <section
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))',
                gap: 14,
                marginTop: 8,
              }}
            >
              {[
                { title: 'GENERATE', desc: 'Turn any link or topic into a multi-slide carousel with AI visuals.', tag: '01' },
                { title: 'ANALYZE', desc: 'Gemini reads your content and creates structured slides automatically.', tag: '02' },
                { title: 'POST', desc: 'Download as ZIP or publish directly to Instagram with one click.', tag: '03' },
              ].map((card) => (
                <div
                  key={card.tag}
                  style={{
                    background: C.blue,
                    border: `1px solid rgba(0,0,0,0.06)`,
                    borderRadius: 12,
                    padding: 18,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    transition: 'all .2s ease',
                  }}
                >
                  <span className="pixel" style={{ fontSize: 18, color: C.lime }}>{card.tag}</span>
                  <h3 className="pixel" style={{ fontSize: 10, color: C.white, margin: 0 }}>{card.title}</h3>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6, margin: 0 }}>{card.desc}</p>
                </div>
              ))}
            </section>
          ) : null}

          {/* ============ Footer ============ */}
          <footer
            style={{
              borderTop: `1px solid rgba(255,255,255,0.06)`,
              padding: '24px 0',
              marginTop: 12,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="pixel" style={{ fontSize: 8, color: '#666666' }}>publisio</span>
              <span style={{ fontSize: 8, color: '#666666' }}>•••</span>
              <span style={{ fontSize: 9, color: '#666666' }}>TOKYO-01</span>
            </div>
            <span style={{ fontSize: 8, color: '#666666' }}>© 2026</span>
          </footer>
        </main>

        {/* ============ Preview modal ============ */}
        {(previewIndex !== null || previewVideo) && result ? (
          <div
            onClick={() => {
              setPreviewIndex(null);
              setPreviewVideo(false);
            }}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.85)',
              zIndex: 50,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: 448,
                maxHeight: '86vh',
                overflowY: 'auto',
                background: C.screen,
                border: `1px solid rgba(255,255,255,0.1)`,
                borderRadius: 14,
                position: 'relative',
              }}
            >
              <button
                onClick={() => {
                  setPreviewIndex(null);
                  setPreviewVideo(false);
                }}
                style={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  minWidth: 40,
                  minHeight: 40,
                  background: C.dark,
                  border: `1px solid rgba(255,255,255,0.1)`,
                  borderRadius: 10,
                  color: C.white,
                  fontSize: 18,
                  cursor: 'pointer',
                  zIndex: 2,
                }}
              >
                ✕
              </button>

              {previewVideo && result.videoSlide ? (
                <div style={{ padding: 16 }}>
                  <video
                    controls
                    src={result.videoSlide.publicUrl}
                    style={{ width: '100%', borderRadius: 10, background: '#000' }}
                  />
                  <div style={{ fontSize: 12, color: C.gray, marginTop: 8 }}>
                    Video · {result.videoSlide.durationSeconds}s
                  </div>
                </div>
              ) : previewIndex !== null ? (
                <div>
                  {result.slides[previewIndex].imageUrl ? (
                    <div
                      style={{
                        width: '100%',
                        aspectRatio: '4 / 5',
                        background: `#000 center/cover no-repeat url("${result.slides[previewIndex].imageUrl}")`,
                        borderRadius: '12px 12px 0 0',
                      }}
                    />
                  ) : null}
                </div>
              ) : null}
                ) : null}
            </div>
          </div>
        ) : null}

        {/* ============ Publish modal ============ */}
        {publishOpen && result ? (
          <div
            onClick={() => (!publishing ? setPublishOpen(false) : null)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.85)',
              zIndex: 60,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: 480,
                background: C.screen,
                borderTop: `2px solid ${C.lime}`,
                borderRadius: '16px 16px 0 0',
                padding: 20,
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}
            >
              <div className="pixel" style={{ fontSize: 12, color: C.black }}>POST TO IG</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <label
                  onClick={() => (!publishing ? setPublishMode('carousel') : null)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    minHeight: 44,
                    padding: '0 12px',
                    background: publishMode === 'carousel' ? C.dark : 'transparent',
                    border: `1px solid ${publishMode === 'carousel' ? C.lime : 'rgba(0,0,0,0.1)'}`,
                    borderRadius: 10,
                    cursor: publishing ? 'not-allowed' : 'pointer',
                    fontSize: 13,
                    color: C.black,
                  }}
                >
                  <span
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      border: `2px solid ${publishMode === 'carousel' ? C.lime : C.gray}`,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flex: '0 0 auto',
                      boxSizing: 'border-box',
                    }}
                  >
                    {publishMode === 'carousel' ? (
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.lime }} />
                    ) : null}
                  </span>
                  Carousel {result.videoSlide ? '(gambar + video)' : '(gambar)'}
                </label>

                <label
                  onClick={() => (!publishing ? setPublishMode('reel') : null)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    minHeight: 44,
                    padding: '0 12px',
                    background: publishMode === 'reel' ? C.dark : 'transparent',
                    border: `1px solid ${publishMode === 'reel' ? C.lime : 'rgba(0,0,0,0.1)'}`,
                    borderRadius: 10,
                    cursor: publishing ? 'not-allowed' : 'pointer',
                    fontSize: 13,
                    color: C.black,
                  }}
                >
                  <span
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      border: `2px solid ${publishMode === 'reel' ? C.lime : C.gray}`,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flex: '0 0 auto',
                      boxSizing: 'border-box',
                    }}
                  >
                    {publishMode === 'reel' ? (
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.lime }} />
                    ) : null}
                  </span>
                  {result.videoSlide ? 'Reel (cover + video + slide, suara video tetap)' : 'Reel (slideshow gambar)'}
                </label>

                <label
                  onClick={() => (!publishing ? setPostToFacebook((v) => !v) : null)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    minHeight: 44,
                    padding: '0 12px',
                    background: postToFacebook ? C.dark : 'transparent',
                    border: `1px solid ${postToFacebook ? C.lime : 'rgba(0,0,0,0.1)'}`,
                    borderRadius: 10,
                    cursor: publishing ? 'not-allowed' : 'pointer',
                    fontSize: 13,
                    color: C.black,
                  }}
                >
                  <span
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 5,
                      border: `2px solid ${postToFacebook ? C.lime : C.gray}`,
                      background: postToFacebook ? C.lime : 'transparent',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flex: '0 0 auto',
                      boxSizing: 'border-box',
                      color: C.black,
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    {postToFacebook ? '✓' : ''}
                  </span>
                  Facebook — posting juga
                </label>
              </div>

              {publishing && publishMode === 'reel' ? (
                <div style={{ fontSize: 12, color: C.gray }}>
                  Mengunggah… (Reel butuh ~1-2 menit)
                </div>
              ) : null}

              {publishError ? (
                <div
                  style={{
                    background: 'rgba(255,60,60,0.1)',
                    border: `1px solid rgba(255,60,60,0.5)`,
                    color: '#dc2626',
                    borderRadius: 10,
                    padding: '10px 12px',
                    fontSize: 13,
                  }}
                >
                  {publishError}
                </div>
              ) : null}

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => setPublishOpen(false)}
                  disabled={publishing}
                  className={`pixel ${publishing ? '' : 'abtn'}`}
                  style={{
                    flex: 1,
                    minHeight: 46,
                    background: C.dark,
                    border: `1px solid rgba(0,0,0,0.1)`,
                    borderRadius: 12,
                    color: C.black,
                    fontSize: 10,
                    cursor: publishing ? 'not-allowed' : 'pointer',
                  }}
                >
                  CANCEL
                </button>
                <button
                  onClick={handlePublish}
                  disabled={publishing}
                  className={`pixel ${publishing ? '' : 'abtn'}`}
                  style={{
                    flex: 1,
                    minHeight: 46,
                    background: C.lime,
                    border: `1px solid ${C.lime}`,
                    borderRadius: 12,
                    color: C.black,
                    fontSize: 10,
                    cursor: publishing ? 'not-allowed' : 'pointer',
                    boxShadow: publishing ? 'none' : '4px 4px 0 rgba(205,242,43,0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  {publishing ? (
                    <>
                      <span
                        className="spin"
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: '50%',
                          border: `2px solid rgba(0,0,0,0.25)`,
                          borderTopColor: C.black,
                          boxSizing: 'border-box',
                        }}
                      />{' '}
                      WAIT…
                    </>
                  ) : (
                    '▶ POST'
                  )}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* ============ Brand Voice Onboarding Modal ============ */}
        {showBrandModal ? (
          <div
            onClick={() => setShowBrandModal(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.85)',
              zIndex: 65,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: 500,
                background: '#1a1a26',
                borderRadius: 14,
                padding: 28,
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              <div className="pixel" style={{ fontSize: 14, color: C.lime }}>BRAND VOICE</div>
              <p style={{ fontSize: 13, color: C.white, lineHeight: 1.6, margin: 0 }}>
                Tell us about your brand. This will be applied to all your carousels forever.
              </p>

              <textarea
                value={brandVoice}
                onChange={(e) => setBrandVoice(e.target.value)}
                placeholder="Describe your brand — who are you, what's your tone, what colors do you like, what style feels like you..."
                style={{
                  width: '100%',
                  minHeight: 120,
                  background: '#111118',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 10,
                  color: C.white,
                  padding: 12,
                  fontSize: 13,
                  lineHeight: 1.6,
                  resize: 'vertical',
                  outline: 'none',
                  fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
                  boxSizing: 'border-box',
                }}
              />

              <div style={{ fontSize: 11, color: C.gray, lineHeight: 1.7, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div>Aku brand skincare premium, target wanita 25-35, tone elegant & warm, palette nude/pink/white, font clean minimal, ratio 1:1</div>
                <div>Saya content creator tech, gaya santai & lucu, target Gen-Z, warna bold & kontras, font modern, ratio 4:5</div>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => setShowBrandModal(false)}
                  className="pixel"
                  style={{
                    flex: 1,
                    minHeight: 46,
                    background: 'transparent',
                    border: `1px solid ${C.gray}`,
                    borderRadius: 12,
                    color: C.gray,
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  SKIP
                </button>
                <button
                  onClick={async () => {
                    await fetch('/api/settings', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      credentials: 'include',
                      body: JSON.stringify({ brand_voice: brandVoice }),
                    })
                    setShowBrandModal(false)
                    setBrandVoiceSaved(true)
                  }}
                  className="pixel abtn"
                  style={{
                    flex: 1,
                    minHeight: 46,
                    background: C.lime,
                    border: `1px solid ${C.lime}`,
                    borderRadius: 12,
                    color: C.black,
                    fontSize: 11,
                    cursor: 'pointer',
                    boxShadow: '4px 4px 0 rgba(205,242,43,0.3)',
                  }}
                >
                  ▶ SAVE
                </button>
              </div>

              <div style={{ textAlign: 'center', fontSize: 11, color: C.gray }}>
                You can edit this anytime in Settings → Brand
              </div>
            </div>
          </div>
        ) : null}

        {/* ============ Success toast ============ */}
        {toast ? (
          <div
            style={{
              position: 'fixed',
              bottom: 20,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 'calc(100% - 28px)',
              maxWidth: 452,
              background: '#1a1a26',
              border: `1px solid ${C.lime}`,
              color: C.white,
              padding: '12px 18px',
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 600,
              zIndex: 70,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              boxSizing: 'border-box',
            }}
          >
            <span>Berhasil diposting{toastFb ? ' · FB juga' : ''}</span>
            {toastLink ? (
              <a
                href={toastLink}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: C.blue, textDecoration: 'underline', fontSize: 13, fontWeight: 500 }}
              >
                Lihat di Instagram
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
