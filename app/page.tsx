'use client';

import { useState, useRef, useMemo, useEffect, ChangeEvent } from 'react';

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
  bg: '#f6f7f9',
  surface: '#ffffff',
  surface2: '#eef0f3',
  border: '#e3e6ea',
  accent: '#2563eb',
  accentText: '#ffffff',
  text: '#14161a',
  muted: '#6b7280',
  success: '#15803d',
  error: '#dc2626',
  shadow: '0 1px 3px rgba(0,0,0,0.06)',
};

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
        border: `1px solid ${C.border}`,
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
                border: `1px solid ${C.border}`,
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
                border: `1px solid ${C.border}`,
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
  // input state
  const [textValue, setTextValue] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [videoFile, setVideoFile] = useState<File | null>(null);

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

  /* -------- staged progress -------- */
  function startProgress() {
    clearTimers();
    setStep(1);
    stepTimers.current.push(setTimeout(() => setStep((s) => (s < 2 ? 2 : s)), 2500));
    stepTimers.current.push(setTimeout(() => setStep((s) => (s < 3 ? 3 : s)), 7000));
  }

  function clearTimers() {
    stepTimers.current.forEach((t) => clearTimeout(t));
    stepTimers.current = [];
  }

  /* -------- generate -------- */
  async function handleGenerate() {
    if (!canSubmit) return;
    setError('');
    setResult(null);
    setLoading(true);
    startProgress();

    try {
      const v = textValue.trim();
      const body: {
        text?: string;
        url?: string;
        imageBase64?: string;
        imageMimeType?: string;
      } = {};

      const useAsUrl = isVideoPlatformUrl(v);

      // Build text (include uploaded video filename pragmatically)
      let textPayload = useAsUrl ? '' : v;
      if (videoFile) {
        const note = `[uploaded video: ${videoFile.name}]`;
        textPayload = textPayload ? `${textPayload}\n${note}` : note;
      }

      if (useAsUrl) {
        body.url = v;
      }
      if (textPayload) {
        body.text = textPayload;
      }

      if (imageFile) {
        const { base64, mime } = await fileToBase64(imageFile);
        body.imageBase64 = base64;
        body.imageMimeType = mime;
      }

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        let msg = `Gagal generate (HTTP ${res.status})`;
        try {
          const j = await res.json();
          if (j?.error) msg = j.error;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }

      const data: GenResult = await res.json();
      clearTimers();
      setStep(4);
      setResult(data);
      setCaption(data.caption || '');
      // default publish mode
      setPublishMode('carousel');
    } catch (e) {
      clearTimers();
      setStep(0);
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

  const steps = ['Analyzing with Gemini', 'Generating images', 'Processing video', 'Done'];

  /* ============================ Render ============================ */

  return (
    <div
      style={{
        background: C.bg,
        minHeight: '100vh',
        color: C.text,
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      }}
    >
      <style>{`
        @keyframes spin { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }
        .spin { display:inline-block; animation: spin 0.7s linear infinite; }
        textarea, input, button { font-family: 'Inter', system-ui, -apple-system, sans-serif; }
        *::-webkit-scrollbar { height: 6px; width: 6px; }
        *::-webkit-scrollbar-thumb { background:#d3d7dd; border-radius: 3px; }
      `}</style>

      <div style={{ maxWidth: 480, margin: '0 auto', minHeight: '100vh', position: 'relative' }}>
        {/* ============ Section 1 — Header ============ */}
        <header
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 20,
            background: C.surface,
            borderBottom: `1px solid ${C.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            height: 46,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: C.accent,
                display: 'inline-block',
              }}
            />
            <span style={{ fontSize: 14, letterSpacing: 0.5, fontWeight: 800 }}>AI Carousel</span>
          </div>
          <span
            style={{
              fontSize: 11,
              color: C.muted,
              border: `1px solid ${C.border}`,
              borderRadius: 4,
              padding: '3px 8px',
            }}
          >
            mk_wiro
          </span>
        </header>

        <main style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* ============ Section 2 — Input ============ */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ position: 'relative' }}>
              <textarea
                ref={textareaRef}
                value={textValue}
                onChange={handleTextChange}
                rows={4}
                placeholder="Paste link, teks, atau ketik konten AI di sini..."
                style={{
                  width: '100%',
                  minHeight: 96,
                  resize: 'none',
                  background: C.surface,
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  color: C.text,
                  padding: 12,
                  fontSize: 14,
                  lineHeight: 1.5,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {inputBadge ? (
              <div>
                <span
                  style={{
                    fontSize: 12,
                    color: C.accent,
                    background: C.surface2,
                    border: `1px solid ${C.border}`,
                    borderRadius: 4,
                    padding: '4px 8px',
                    display: 'inline-block',
                    fontWeight: 600,
                  }}
                >
                  {inputBadge.label}
                </span>
              </div>
            ) : null}

            <button
              onClick={handleGenerate}
              disabled={!canSubmit}
              style={{
                minHeight: 44,
                background: canSubmit ? C.accent : C.surface2,
                color: canSubmit ? C.accentText : C.muted,
                border: 'none',
                borderRadius: 8,
                fontSize: 15,
                fontWeight: 700,
                cursor: canSubmit ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              {loading ? (
                <>
                  <Spinner color={C.muted} /> Generating…
                </>
              ) : (
                'Go'
              )}
            </button>

            {/* upload */}
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 44,
                border: `1px dashed ${C.border}`,
                borderRadius: 8,
                color: C.muted,
                fontSize: 13,
                cursor: 'pointer',
                background: C.surface,
                fontWeight: 600,
              }}
            >
              Upload gambar / video
              <input
                ref={imageInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.mp4,.mov,.webm,image/*,video/*"
                onChange={handleFile}
                style={{ display: 'none' }}
              />
            </label>

            {imageFile && imagePreview ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  background: C.surface,
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  padding: 8,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imagePreview}
                  alt="preview"
                  style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6 }}
                />
                <div style={{ flex: 1, fontSize: 12, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {imageFile.name}
                  <div style={{ color: C.muted, fontSize: 11 }}>{humanSize(imageFile.size)}</div>
                </div>
                <button
                  onClick={removeImage}
                  style={{
                    minWidth: 44,
                    minHeight: 44,
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
                  background: C.surface,
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  padding: 8,
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 6,
                    background: C.surface2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 700,
                    color: C.muted,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}
                >
                  Video
                </div>
                <div style={{ flex: 1, fontSize: 12, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {videoFile.name}
                  <div style={{ color: C.muted, fontSize: 11 }}>{humanSize(videoFile.size)}</div>
                </div>
                <button
                  onClick={removeVideo}
                  style={{
                    minWidth: 44,
                    minHeight: 44,
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
                  background: '#fef2f2',
                  border: `1px solid ${C.error}`,
                  color: C.error,
                  borderRadius: 8,
                  padding: '10px 12px',
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                {error}
              </div>
            ) : null}
          </section>

          {/* ============ Section 3 — Progress ============ */}
          {loading || (step > 0 && step < 4) ? (
            <section
              style={{
                background: C.surface,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                padding: 14,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                boxShadow: C.shadow,
              }}
            >
              <div style={{ fontSize: 12, color: C.muted }}>
                Step {Math.min(step, 4)}/4
              </div>
              {steps.map((label, i) => {
                const idx = i + 1;
                const state = step > idx ? 'done' : step === idx ? 'active' : 'pending';
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                    <span
                      style={{
                        width: 18,
                        height: 18,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flex: '0 0 auto',
                      }}
                    >
                      {state === 'done' ? (
                        <span
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: '50%',
                            background: C.accent,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <span
                            style={{
                              width: 4,
                              height: 8,
                              borderRight: `2px solid ${C.accentText}`,
                              borderBottom: `2px solid ${C.accentText}`,
                              transform: 'rotate(45deg)',
                              marginTop: -2,
                            }}
                          />
                        </span>
                      ) : state === 'active' ? (
                        <Spinner />
                      ) : (
                        <span
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: '50%',
                            border: `2px solid ${C.border}`,
                            boxSizing: 'border-box',
                          }}
                        />
                      )}
                    </span>
                    <span
                      style={{
                        color: state === 'pending' ? C.muted : C.text,
                        fontWeight: state === 'active' ? 600 : 400,
                      }}
                    >
                      {label}
                    </span>
                  </div>
                );
              })}
            </section>
          ) : null}

          {/* ============ Section 4 — Results ============ */}
          {result ? (
            <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: 13, color: C.muted }}>
                <span style={{ color: C.text, fontWeight: 700 }}>{result.slides.length}</span> slides ·{' '}
                <span style={{ color: C.accent }}>{result.tag}</span>
              </div>

              {/* thumbnail strip */}
              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  overflowX: 'auto',
                  paddingBottom: 6,
                }}
              >
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
                      borderRadius: 8,
                      border: `1px solid ${C.border}`,
                      background: s.imageUrl
                        ? `#000 center/cover no-repeat url("${s.imageUrl}")`
                        : C.surface2,
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
                          ? 'linear-gradient(to top, rgba(0,0,0,0.75), rgba(0,0,0,0.05))'
                          : 'transparent',
                      }}
                    />
                    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 6, height: '100%' }}>
                      <span style={{ fontSize: 8, color: C.accent, textTransform: 'uppercase', letterSpacing: 1 }}>
                        {s.tag || s.type}
                      </span>
                      <div style={{ marginTop: 'auto' }}>
                        <div style={{ fontSize: 10, color: C.text, lineHeight: 1.25, fontWeight: 700 }}>
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
                      borderRadius: 8,
                      border: `1px solid ${C.border}`,
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
                        borderLeft: '18px solid #ffffff',
                        marginLeft: 4,
                      }}
                    />
                    <span
                      style={{
                        position: 'absolute',
                        bottom: 6,
                        left: 8,
                        fontSize: 9,
                        color: '#cbd0d8',
                      }}
                    >
                      {result.videoSlide.durationSeconds}s video
                    </span>
                  </button>
                ) : null}
              </div>

              {/* caption editor */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: C.muted }}>Caption</span>
                  <button
                    onClick={copyCaption}
                    style={{
                      minHeight: 32,
                      padding: '4px 10px',
                      background: C.surface2,
                      border: `1px solid ${C.border}`,
                      borderRadius: 6,
                      color: copied ? C.success : C.text,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {copied ? 'Tersalin' : 'Salin'}
                  </button>
                </div>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={5}
                  style={{
                    width: '100%',
                    background: C.surface,
                    border: `1px solid ${C.border}`,
                    borderRadius: 8,
                    color: C.text,
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
                  style={{
                    flex: 1,
                    minHeight: 44,
                    background: C.surface2,
                    border: `1px solid ${C.border}`,
                    borderRadius: 8,
                    color: C.text,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: downloading ? 'not-allowed' : 'pointer',
                  }}
                >
                  {downloading ? 'Downloading…' : 'Download ZIP'}
                </button>
                <button
                  onClick={openPublish}
                  style={{
                    flex: 1,
                    minHeight: 44,
                    background: C.accent,
                    border: 'none',
                    borderRadius: 8,
                    color: C.accentText,
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Post to Instagram
                </button>
              </div>
            </section>
          ) : null}

          {/* ============ Section 5 — Riwayat (history) ============ */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4 }}>
            <button
              onClick={() => setHistoryOpen((v) => !v)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                minHeight: 44,
                padding: '0 12px',
                background: C.surface,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                color: C.text,
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: 1,
                cursor: 'pointer',
              }}
            >
              <span>
                RIWAYAT{' '}
                <span style={{ color: C.muted, fontWeight: 400 }}>
                  ({historyEntries.length})
                </span>
              </span>
              <span style={{ color: C.muted }}>{historyOpen ? '▾' : '▸'}</span>
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
                          background: C.surface,
                          border: `1px solid ${C.border}`,
                          borderRadius: 10,
                          padding: 10,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                          boxShadow: C.shadow,
                        }}
                      >
                        <div style={{ display: 'flex', gap: 10 }}>
                          {/* thumbnail */}
                          {entry.thumbUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={entry.thumbUrl}
                              alt="thumb"
                              style={{
                                width: 56,
                                height: 70,
                                objectFit: 'cover',
                                borderRadius: 6,
                                border: `1px solid ${C.border}`,
                                flex: '0 0 auto',
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width: 56,
                                height: 70,
                                borderRadius: 6,
                                background: C.surface2,
                                border: `1px solid ${C.border}`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 10,
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                letterSpacing: 0.5,
                                color: C.muted,
                                flex: '0 0 auto',
                              }}
                            >
                              {entry.hasVideo ? 'Video' : 'Gambar'}
                            </div>
                          )}

                          {/* middle */}
                          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span
                                style={{
                                  fontSize: 10,
                                  letterSpacing: 1,
                                  textTransform: 'uppercase',
                                  color: C.accent,
                                  border: `1px solid ${C.border}`,
                                  borderRadius: 4,
                                  padding: '2px 6px',
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
                                color: C.text,
                                lineHeight: 1.3,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {entry.caption || '—'}
                            </div>

                            {/* status chips */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              {entry.instagram?.ok && entry.instagram.permalink ? (
                                <a
                                  href={entry.instagram.permalink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 600,
                                    color: C.success,
                                    border: `1px solid ${C.success}`,
                                    borderRadius: 4,
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
                                    color: entry.instagram?.ok ? C.success : C.error,
                                    border: `1px solid ${entry.instagram?.ok ? C.success : C.error}`,
                                    borderRadius: 4,
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
                                    color: entry.facebook.ok ? C.success : C.error,
                                    border: `1px solid ${entry.facebook.ok ? C.success : C.error}`,
                                    borderRadius: 4,
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

                        {/* log toggle */}
                        {entry.logs && entry.logs.length ? (
                          <button
                            onClick={() => toggleLog(entry.id)}
                            style={{
                              alignSelf: 'flex-start',
                              minHeight: 28,
                              padding: '2px 8px',
                              background: 'transparent',
                              border: `1px solid ${C.border}`,
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
                              background: C.surface2,
                              border: `1px solid ${C.border}`,
                              borderRadius: 6,
                              padding: 8,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 3,
                            }}
                          >
                            {entry.logs.map((line, i) => (
                              <div
                                key={i}
                                style={{ fontSize: 11, color: C.muted, lineHeight: 1.4, wordBreak: 'break-word' }}
                              >
                                {line}
                              </div>
                            ))}
                            {entry.instagram?.error ? (
                              <div style={{ fontSize: 11, color: C.error, lineHeight: 1.4, wordBreak: 'break-word' }}>
                                IG: {entry.instagram.error}
                              </div>
                            ) : null}
                            {entry.facebook?.error ? (
                              <div style={{ fontSize: 11, color: C.error, lineHeight: 1.4, wordBreak: 'break-word' }}>
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
                background: C.surface,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
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
                  minWidth: 44,
                  minHeight: 44,
                  background: C.surface,
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  color: C.text,
                  fontSize: 18,
                  cursor: 'pointer',
                  zIndex: 2,
                  boxShadow: C.shadow,
                }}
              >
                ✕
              </button>

              {previewVideo && result.videoSlide ? (
                <div style={{ padding: 16 }}>
                  <video
                    controls
                    src={result.videoSlide.publicUrl}
                    style={{ width: '100%', borderRadius: 8, background: '#000' }}
                  />
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>
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
                  <div style={{ padding: 18 }}>
                    <SlideContent slide={result.slides[previewIndex]} />
                  </div>
                </div>
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
                background: C.surface,
                borderTop: `1px solid ${C.border}`,
                borderRadius: '14px 14px 0 0',
                padding: 18,
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700 }}>Post to Instagram</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <label
                  onClick={() => (!publishing ? setPublishMode('carousel') : null)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    minHeight: 44,
                    padding: '0 12px',
                    background: publishMode === 'carousel' ? C.surface2 : 'transparent',
                    border: `1px solid ${publishMode === 'carousel' ? C.accent : C.border}`,
                    borderRadius: 8,
                    cursor: publishing ? 'not-allowed' : 'pointer',
                    fontSize: 14,
                  }}
                >
                  <Radio selected={publishMode === 'carousel'} />
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
                    background: publishMode === 'reel' ? C.surface2 : 'transparent',
                    border: `1px solid ${publishMode === 'reel' ? C.accent : C.border}`,
                    borderRadius: 8,
                    cursor: publishing ? 'not-allowed' : 'pointer',
                    fontSize: 14,
                  }}
                >
                  <Radio selected={publishMode === 'reel'} />
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
                    background: postToFacebook ? C.surface2 : 'transparent',
                    border: `1px solid ${postToFacebook ? C.accent : C.border}`,
                    borderRadius: 8,
                    cursor: publishing ? 'not-allowed' : 'pointer',
                    fontSize: 14,
                  }}
                >
                  <Checkbox checked={postToFacebook} />
                  Facebook — posting juga
                </label>
              </div>

              {publishing && publishMode === 'reel' ? (
                <div style={{ fontSize: 12, color: C.muted }}>
                  Mengunggah… (Reel butuh ~1-2 menit)
                </div>
              ) : null}

              {publishError ? (
                <div
                  style={{
                    background: '#fef2f2',
                    border: `1px solid ${C.error}`,
                    color: C.error,
                    borderRadius: 8,
                    padding: '10px 12px',
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  {publishError}
                </div>
              ) : null}

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => setPublishOpen(false)}
                  disabled={publishing}
                  style={{
                    flex: 1,
                    minHeight: 44,
                    background: C.surface2,
                    border: `1px solid ${C.border}`,
                    borderRadius: 8,
                    color: C.text,
                    fontSize: 14,
                    cursor: publishing ? 'not-allowed' : 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handlePublish}
                  disabled={publishing}
                  style={{
                    flex: 1,
                    minHeight: 44,
                    background: C.accent,
                    border: 'none',
                    borderRadius: 8,
                    color: C.accentText,
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: publishing ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  {publishing ? (
                    <>
                      <Spinner color={C.accentText} /> Posting…
                    </>
                  ) : (
                    'Post Now'
                  )}
                </button>
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
              background: '#ffffff',
              border: `1px solid ${C.success}`,
              color: C.success,
              padding: '12px 18px',
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              zIndex: 70,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              boxSizing: 'border-box',
              boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            }}
          >
            <span>Berhasil diposting{toastFb ? ' · FB juga' : ''}</span>
            {toastLink ? (
              <a
                href={toastLink}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: C.accent, textDecoration: 'underline', fontSize: 13, fontWeight: 500 }}
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
