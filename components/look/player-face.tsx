'use client'

import dynamic from 'next/dynamic'
import { useSyncExternalStore, type CSSProperties } from 'react'
import { pendingFaces, subscribeFaces, useFace } from '@/lib/game/face-cache'

// three.js only loads when a face actually needs drawing
const FaceRenderer = dynamic(() => import('./face-renderer').then((m) => m.FaceRenderer), { ssr: false })

/** Mount once (root layout): draws queued faces in the background. */
export function FaceHost() {
  const pending = useSyncExternalStore(subscribeFaces, pendingFaces, () => 0)
  return pending > 0 ? <FaceRenderer /> : null
}

/**
 * A player's face: their character's head and shoulders when we know their look, else the old
 * coloured circle with their initial (while it's drawn, or for NPCs / players without a look).
 */
export function PlayerFace({
  look,
  color,
  label,
  emoji,
  size = 32,
  className,
  style,
}: {
  look?: unknown
  color: string
  /** Name to take the initial from */
  label: string
  emoji?: string | null
  size?: number
  className?: string
  style?: CSSProperties
}) {
  const url = useFace(look)
  const box: CSSProperties = { width: size, height: size, borderRadius: 999, flex: 'none', ...style }
  if (url) {
    return <img className={className} src={url} alt="" draggable={false} style={{ ...box, objectFit: 'cover', background: color }} aria-hidden="true" />
  }
  const initial = (label.trim()[0] || '?').toUpperCase()
  return (
    <span
      className={className}
      style={{ ...box, display: 'inline-grid', placeItems: 'center', background: color, color: '#fff', fontWeight: 700, fontSize: size * 0.45 }}
      aria-hidden="true"
    >
      {emoji || initial}
    </span>
  )
}
