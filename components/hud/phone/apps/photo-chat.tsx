'use client'

import { Camera, Eye, EyeOff, Flag, Image as ImageIcon, Plus, Smile, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { openChatPhoto, reportChatPhoto, type ChatMessage } from '@/lib/game/hostels-api'
import { apiUrl } from '@/lib/game/api'
import styles from './photo-chat.module.css'

/* View-once photos in one-to-one chats: attach sheet, preview, bubble and the hold-to-view viewer. */

export type PhotoState = 'sent' | 'opened' | 'expired'

export function parsePhoto(body: string): { w: number; h: number; state: PhotoState } {
  try {
    const v = JSON.parse(body) as { w?: number; h?: number; state?: PhotoState }
    return { w: v.w ?? 4, h: v.h ?? 3, state: v.state ?? 'sent' }
  } catch {
    return { w: 4, h: 3, state: 'sent' }
  }
}

const MAX_EDGE = 1280
const TARGET_BYTES = 200_000

export type PhotoDraft = { blob: Blob; url: string; w: number; h: number }

/** Shrink a picked or captured photo on the phone: ~1280px long edge, WebP (JPEG on older browsers), about 200KB. */
export async function shrinkPhoto(file: File): Promise<PhotoDraft | null> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()
    const toBlob = (type: string, q: number) => new Promise<Blob | null>((res) => canvas.toBlob(res, type, q))
    let type = 'image/webp'
    let blob = await toBlob(type, 0.8)
    if (!blob || blob.type !== 'image/webp') {
      type = 'image/jpeg'
      blob = await toBlob(type, 0.8)
    }
    for (const q of [0.7, 0.6, 0.5, 0.4]) {
      if (!blob || blob.size <= TARGET_BYTES) break
      blob = await toBlob(type, q)
    }
    if (!blob || blob.size > 590_000) return null
    return { blob, url: URL.createObjectURL(blob), w, h }
  } catch {
    return null
  }
}

/* —— Attach sheet (the + button) —— */

export function AttachButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`${styles.plus} ${open ? styles.plusOn : ''}`} aria-label="Attach" aria-expanded={open} onClick={onClick}>
      <Plus size={24} aria-hidden="true" />
    </button>
  )
}

export function AttachSheet({
  canPhoto,
  onClose,
  onFile,
  onStickers,
}: {
  canPhoto: boolean
  onClose: () => void
  onFile: (file: File) => void
  onStickers: () => void
}) {
  const gallery = useRef<HTMLInputElement>(null)
  const camera = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const start = useRef<number | null>(null)

  const close = useCallback(() => {
    setLeaving(true)
    window.setTimeout(onClose, 220)
  }, [onClose])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  const down = (e: ReactPointerEvent) => {
    start.current = e.clientY
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const move = (e: ReactPointerEvent) => {
    if (start.current == null) return
    setDrag(Math.max(0, e.clientY - start.current))
  }
  const up = () => {
    if (start.current == null) return
    start.current = null
    if (drag > 70) close()
    else setDrag(0)
  }
  const picked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) {
      onFile(file)
      close()
    }
  }

  return (
    <div className={`${styles.layer} ${leaving ? styles.layerOut : ''}`}>
      <button type="button" className={styles.backdrop} aria-label="Close" onClick={close} />
      <div
        className={styles.sheet}
        role="dialog"
        aria-label="Attach"
        style={drag ? { transform: `translateY(${drag}px)`, transition: 'none' } : undefined}
      >
        <div className={styles.grab} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          <span className={styles.handle} />
        </div>
        {canPhoto ? (
          <section className={styles.tile}>
            <header className={styles.tileHead}>
              <span className={`${styles.tileIcon} ${styles.iconBlue}`} aria-hidden="true">
                <Camera size={22} />
              </span>
              <span className={styles.tileText}>
                <strong>Send photo</strong>
                <span>Disappears after one look</span>
              </span>
            </header>
            <div className={styles.subRow}>
              <button type="button" className={styles.sub} onClick={() => gallery.current?.click()}>
                <ImageIcon size={18} aria-hidden="true" /> Gallery
              </button>
              <button type="button" className={styles.sub} onClick={() => camera.current?.click()}>
                <Camera size={18} aria-hidden="true" /> Camera
              </button>
            </div>
            <input ref={gallery} type="file" accept="image/*" hidden onChange={picked} />
            <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={picked} />
          </section>
        ) : null}
        <button
          type="button"
          className={`${styles.tile} ${styles.tileBtn}`}
          onClick={() => {
            onStickers()
            close()
          }}
        >
          <span className={`${styles.tileIcon} ${styles.iconAmber}`} aria-hidden="true">
            <Smile size={22} />
          </span>
          <span className={styles.tileText}>
            <strong>Avatar stickers</strong>
            <span>Send a sticker of your character</span>
          </span>
        </button>
      </div>
    </div>
  )
}

/* —— Preview before sending —— */

export function PhotoPreview({
  draft,
  sending,
  error,
  onCancel,
  onSend,
}: {
  draft: PhotoDraft
  sending: boolean
  error: string | null
  onCancel: () => void
  onSend: () => void
}) {
  return (
    <div className={styles.preview} role="dialog" aria-label="Photo preview">
      <header className={styles.previewTop}>
        <button type="button" className={styles.roundBtn} onClick={onCancel} aria-label="Discard photo" disabled={sending}>
          <X size={20} aria-hidden="true" />
        </button>
        <span className={styles.badge}>
          <Eye size={14} aria-hidden="true" /> View once
        </span>
        <span className={styles.roundSpacer} />
      </header>
      <div className={styles.previewStage}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={draft.url} alt="Your photo" className={styles.previewImg} draggable={false} />
      </div>
      <footer className={styles.previewBottom}>
        <p className={styles.note}>They can look once while holding it. Hard to screenshot, but not impossible.</p>
        {error ? (
          <p className={styles.err} role="alert">
            {error}
          </p>
        ) : null}
        <button type="button" className={styles.sendBtn} onClick={onSend} disabled={sending}>
          {sending ? 'Sending…' : 'Send'}
        </button>
      </footer>
    </div>
  )
}

/* —— The bubble in the chat —— */

export function PhotoBubble({
  message,
  tick,
  onOpen,
}: {
  message: ChatMessage
  tick: 'sent' | 'delivered' | 'read' | null
  onOpen: () => void
}) {
  const { w, h, state } = parsePhoto(message.body)
  const ratio = Math.min(1.5, Math.max(0.75, w / h))
  const gone = state !== 'sent'
  const mine = message.mine
  const status = gone ? (state === 'expired' ? 'Expired' : 'Opened') : tick === 'sent' || !tick ? 'Sent' : 'Delivered'
  const label = gone ? (state === 'expired' ? 'Photo expired' : 'Photo opened') : '📷 Photo'
  const sub = gone ? 'View once' : mine ? 'View once' : 'Hold to view'
  const body = (
    <>
      {gone ? null : (
        <span className={styles.mesh} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      )}
      <span className={styles.bubbleCenter}>
        <span className={styles.bubbleGlyph} aria-hidden="true">
          {gone ? <EyeOff size={22} /> : <Camera size={22} />}
        </span>
        <strong>{label}</strong>
        <span>{sub}</span>
      </span>
      <span className={styles.once}>
        <Eye size={11} aria-hidden="true" /> Once
      </span>
    </>
  )
  const cls = `${styles.photo} ${gone ? styles.photoGone : ''} ${mine ? styles.photoMine : ''}`
  return (
    <span className={styles.photoWrap}>
      {mine || gone ? (
        <span className={cls} style={{ aspectRatio: String(ratio) }}>
          {body}
        </span>
      ) : (
        <button
          type="button"
          className={cls}
          style={{ aspectRatio: String(ratio) }}
          onClick={(e) => {
            e.stopPropagation()
            onOpen()
          }}
          onContextMenu={(e) => e.preventDefault()}
          aria-label="Photo, view once. Open to look."
        >
          {body}
        </button>
      )}
      {mine ? (
        <span className={`${styles.status} ${gone ? styles.statusOpened : ''}`} role="status">
          {status}
        </span>
      ) : null}
    </span>
  )
}

/* —— Full-screen viewer: the photo exists only while the finger is down —— */

type Phase = 'ready' | 'loading' | 'showing' | 'gone' | 'error'

export function PhotoViewer({
  messageId,
  onClose,
  onOpened,
}: {
  messageId: string
  onClose: () => void
  onOpened: () => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const bitmap = useRef<ImageBitmap | null>(null)
  const claimed = useRef(false)
  const holding = useRef(false)
  const username = useRef('')
  const [phase, setPhase] = useState<Phase>('ready')
  const [message, setMessage] = useState<string | null>(null)
  const [reported, setReported] = useState(false)

  const clear = useCallback(() => {
    const c = canvas.current
    c?.getContext('2d')?.clearRect(0, 0, c.width, c.height)
  }, [])

  const draw = useCallback(() => {
    const c = canvas.current
    const bmp = bitmap.current
    if (!c || !bmp) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const cw = c.clientWidth
    const ch = c.clientHeight
    c.width = Math.round(cw * dpr)
    c.height = Math.round(ch * dpr)
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, c.width, c.height)
    const s = Math.min(c.width / bmp.width, c.height / bmp.height)
    const w = bmp.width * s
    const h = bmp.height * s
    const x = (c.width - w) / 2
    const y = (c.height - h) / 2
    ctx.drawImage(bmp, x, y, w, h)
    // Faint @username across the picture, baked into the pixels
    ctx.save()
    ctx.beginPath()
    ctx.rect(x, y, w, h)
    ctx.clip()
    ctx.translate(c.width / 2, c.height / 2)
    ctx.rotate(-Math.PI / 7)
    ctx.font = `700 ${Math.round(15 * dpr)}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(255,255,255,0.2)'
    ctx.strokeStyle = 'rgba(0,0,0,0.16)'
    ctx.lineWidth = dpr
    const label = `@${username.current}`
    const stepX = Math.round(130 * dpr)
    const stepY = Math.round(64 * dpr)
    const span = Math.max(c.width, c.height)
    for (let j = -span; j < span; j += stepY) {
      for (let i = -span; i < span; i += stepX) {
        const ox = (Math.round(j / stepY) % 2) * (stepX / 2)
        ctx.strokeText(label, i + ox, j)
        ctx.fillText(label, i + ox, j)
      }
    }
    ctx.restore()
  }, [])

  const endLook = useCallback(() => {
    holding.current = false
    clear()
    bitmap.current?.close?.()
    bitmap.current = null
    setPhase((p) => (p === 'showing' || p === 'loading' ? 'gone' : p))
  }, [clear])

  const press = async () => {
    if (phase === 'gone' || phase === 'error' || holding.current) return
    holding.current = true
    if (claimed.current) return
    claimed.current = true
    setPhase('loading')
    const opened = await openChatPhoto(messageId)
    if (!opened.ok) {
      claimed.current = false
      holding.current = false
      setMessage(opened.error)
      setPhase(opened.code === 'GONE' ? 'gone' : 'error')
      if (opened.code === 'GONE') onOpened()
      return
    }
    username.current = opened.username
    onOpened()
    try {
      const res = await fetch(`${apiUrl()}${opened.url}`, { credentials: 'include', cache: 'no-store' })
      if (!res.ok) throw new Error('gone')
      bitmap.current = await createImageBitmap(await res.blob())
    } catch {
      setMessage('Couldn’t load the photo.')
      setPhase('gone')
      return
    }
    if (!holding.current || document.hidden) {
      endLook()
      return
    }
    setPhase('showing')
    requestAnimationFrame(draw)
  }

  const release = () => {
    if (holding.current) endLook()
  }

  // Black out the moment the page or window loses focus
  useEffect(() => {
    const out = () => {
      if (holding.current || bitmap.current) endLook()
    }
    const onVis = () => document.hidden && out()
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('blur', out)
    window.addEventListener('pagehide', out)
    window.addEventListener('resize', draw)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('blur', out)
      window.removeEventListener('pagehide', out)
      window.removeEventListener('resize', draw)
      bitmap.current?.close?.()
      bitmap.current = null
    }
  }, [endLook, draw])

  const report = async () => {
    const res = await reportChatPhoto(messageId)
    if (res.ok) setReported(true)
    else setMessage(res.error)
  }

  const hint =
    phase === 'ready'
      ? 'Press and hold to look'
      : phase === 'loading'
        ? 'Opening…'
        : phase === 'gone'
          ? message ?? 'Photo gone. It can’t be opened again.'
          : message ?? 'Something went wrong'

  const node = (
    <div className={styles.viewer} role="dialog" aria-modal="true" aria-label="View once photo" onContextMenu={(e) => e.preventDefault()}>
      <header className={styles.viewerTop}>
        <button type="button" className={styles.roundBtn} onClick={onClose} aria-label="Close">
          <X size={20} aria-hidden="true" />
        </button>
        <span className={styles.badge}>
          <Eye size={14} aria-hidden="true" /> View once
        </span>
        {phase === 'gone' || phase === 'showing' ? (
          <button type="button" className={styles.reportBtn} onClick={report} disabled={reported}>
            <Flag size={14} aria-hidden="true" /> {reported ? 'Reported' : 'Report'}
          </button>
        ) : (
          <span className={styles.roundSpacer} />
        )}
      </header>
      <div
        className={styles.holdArea}
        onPointerDown={(e) => {
          e.preventDefault()
          e.currentTarget.setPointerCapture(e.pointerId)
          void press()
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onPointerLeave={release}
        onContextMenu={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
        role="button"
        tabIndex={0}
        aria-label="Press and hold to view the photo"
      >
        <canvas ref={canvas} className={styles.canvas} />
        {phase !== 'showing' ? (
          <div className={styles.holdHint}>
            <span className={`${styles.holdRing} ${phase === 'loading' ? styles.holdRingBusy : ''}`} aria-hidden="true">
              {phase === 'gone' || phase === 'error' ? <EyeOff size={30} /> : <Eye size={30} />}
            </span>
            <strong>{hint}</strong>
            {phase === 'ready' ? <span>It’s gone when you let go</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  )
  return typeof document === 'undefined' ? null : createPortal(node, document.body)
}

export type { ReactNode }
