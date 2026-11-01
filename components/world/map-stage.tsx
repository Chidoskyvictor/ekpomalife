'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { CampusPoster } from './campus-poster'
import styles from './campus-poster.module.css'
import { WorldCanvasBoundary } from './world-canvas-boundary'

const WorldCanvas = dynamic(
  () => import('./world-canvas').then((mod) => ({ default: mod.WorldCanvas })),
  { ssr: false, loading: () => <div className="absolute inset-0 app-wash" aria-hidden="true" /> },
)

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

function subscribeOnline(fn: () => void) {
  window.addEventListener('online', fn)
  window.addEventListener('offline', fn)
  return () => {
    window.removeEventListener('online', fn)
    window.removeEventListener('offline', fn)
  }
}

/** navigator.onLine, live. SSR assumes online. */
export function useOnline() {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  )
}

/** Small pill shown while the network is down. Retry reloads once data is back. */
export function OfflineBanner() {
  const online = useOnline()
  if (online) return null
  return (
    <div className={styles.offline} role="status" aria-live="polite">
      <span className={styles.offlineText}>You’re offline. Check your data.</span>
      <button type="button" className={styles.button} onClick={() => window.location.reload()}>
        Retry
      </button>
    </div>
  )
}

/**
 * What sits under the HUD: the 3D map (loads straight away, with a static
 * campus picture until it has drawn), or a fallback when WebGL is missing.
 */
export function MapStage() {
  // Checked on the client only, so SSR and first paint stay the same
  const [webgl, setWebgl] = useState<boolean | null>(null)

  useEffect(() => {
    setWebgl(hasWebGL())
  }, [])

  if (webgl === null) return <div className="absolute inset-0 app-wash" aria-hidden="true" />

  if (!webgl) {
    return (
      <CampusPoster>
        <div className={styles.card} role="alert">
          <p className={styles.title}>3D map not supported here</p>
          <p className={styles.body}>
            This browser or phone can’t show 3D (WebGL is off or missing). Try Chrome, turn off battery
            saver, or update your browser. Your menus and phone still work.
          </p>
        </div>
      </CampusPoster>
    )
  }

  return (
    <WorldCanvasBoundary>
      <WorldCanvas />
    </WorldCanvasBoundary>
  )
}
