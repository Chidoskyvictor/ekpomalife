'use client'

import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { BodyPortal } from '@/components/ui/body-portal'
import { OPEN_AD_EVENT, drawAdPlaceholder } from '@/lib/game/billboard-ad'
import styles from './ad-viewer.module.css'

/** Opens when a billboard is tapped. Shows the placeholder ad until ad uploads exist. */
export function AdViewer() {
  const [billboardId, setBillboardId] = useState<string | null>(null)
  const [image, setImage] = useState<string | null>(null)

  useEffect(() => {
    const onOpen = (event: Event) => setBillboardId((event as CustomEvent<string>).detail)
    window.addEventListener(OPEN_AD_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_AD_EVENT, onOpen)
  }, [])

  useEffect(() => {
    if (!billboardId) return
    if (!image) setImage(drawAdPlaceholder(1200, 630, { tapHint: false }).toDataURL('image/png'))
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBillboardId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [billboardId, image])

  if (!billboardId) return null

  return (
    <BodyPortal>
      <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Billboard ad" onClick={() => setBillboardId(null)}>
        <div className={styles.card} onClick={(e) => e.stopPropagation()}>
          <button type="button" className={styles.close} aria-label="Close ad" onClick={() => setBillboardId(null)}>
            <X size={18} aria-hidden="true" />
          </button>
          {image ? <img className={styles.ad} src={image} alt="Your ad here — advertise on Ekpoma Life" /> : null}
          <div className={styles.copy}>
            <p className={styles.title}>This billboard is open for ads</p>
            <p className={styles.text}>Brands and student businesses will be able to put their ads here soon.</p>
          </div>
        </div>
      </div>
    </BodyPortal>
  )
}
