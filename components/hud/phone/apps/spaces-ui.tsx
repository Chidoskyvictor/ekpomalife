'use client'

import { useRef, useState, type ReactNode } from 'react'
import { PLACES } from '@/lib/game/places'
import { reportSpace } from '@/lib/game/spaces-api'
import styles from './spaces.module.css'

const AVATAR_COLORS = ['#7c3aed', '#0891b2', '#16a34a', '#ea580c', '#db2777', '#2563eb', '#ca8a04', '#0f766e']

export function colorFor(name: string) {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!
}

export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  return (
    <span
      className={styles.avatar}
      style={{ width: size, height: size, background: colorFor(name), fontSize: size * 0.45 }}
      aria-hidden="true"
    >
      {name.trim()[0]?.toUpperCase() ?? '?'}
    </span>
  )
}

// Two map places can share a name (e.g. "School Hostels"): number them so the picker and chips tell them apart
const PLACE_LABELS = new Map(
  PLACES.map((p) => {
    const same = PLACES.filter((q) => q.label === p.label)
    return [p.id, same.length > 1 ? `${p.label} ${same.indexOf(p) + 1}` : p.label] as const
  }),
)

/** Label for a campus place; venues/hostels the map doesn't list read as "Campus". */
export const placeLabel = (placeId: string | null) => (placeId ? (PLACE_LABELS.get(placeId) ?? 'Campus') : null)

/**
 * Bottom sheet inside the phone screen. Tap the backdrop, the handle's close, or drag the
 * handle down to dismiss. The phone overlay sits above the page drawers, so this lives in the phone.
 */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const [dy, setDy] = useState(0)
  const startY = useRef<number | null>(null)
  return (
    <>
      <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ transform: dy ? `translateY(${dy}px)` : undefined, transition: startY.current === null ? undefined : 'none' }}
      >
        <div
          className={styles.sheetGrab}
          onPointerDown={(e) => {
            startY.current = e.clientY
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            if (startY.current !== null) setDy(Math.max(0, e.clientY - startY.current))
          }}
          onPointerUp={() => {
            const far = dy > 90
            startY.current = null
            setDy(0)
            if (far) onClose()
          }}
          onPointerCancel={() => {
            startY.current = null
            setDy(0)
          }}
        >
          <span className={styles.handle} aria-hidden="true" />
        </div>
        <div className={styles.sheetHead}>
          <h3 className={styles.sheetTitle}>{title}</h3>
          <button type="button" className={styles.ghost} style={{ minHeight: 44 }} onClick={onClose}>
            Close
          </button>
        </div>
        <div className={styles.sheetBody}>{children}</div>
      </div>
    </>
  )
}

export function ReportSheet({ spaceId, onClose }: { spaceId: string; onClose: (sent?: string) => void }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send() {
    setBusy(true)
    setError(null)
    const res = await reportSpace(spaceId, reason)
    setBusy(false)
    if (!res.ok) return setError(res.error)
    onClose(res.message)
  }

  return (
    <Sheet title="Report Space" onClose={() => onClose()}>
      <label className={styles.field}>
        <span className={styles.label}>
          What&apos;s wrong?<span>{reason.length}/300</span>
        </span>
        <textarea
          className={`${styles.input} ${styles.textarea}`}
          value={reason}
          maxLength={300}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Abuse, begging, scam…"
        />
      </label>
      {error ? <p className={styles.error}>{error}</p> : null}
      <button type="button" className={styles.big} disabled={busy || !reason.trim()} onClick={() => void send()}>
        {busy ? 'Sending…' : 'Send report'}
      </button>
    </Sheet>
  )
}
