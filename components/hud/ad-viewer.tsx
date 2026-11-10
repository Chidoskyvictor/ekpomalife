'use client'

import Image from 'next/image'
import { Link2, MessageCircle, Phone, Users, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { BodyPortal } from '@/components/ui/body-portal'
import { OPEN_AD_EVENT, drawAdPlaceholder } from '@/lib/game/billboard-ad'
import { BOARD_SPOTS, adForBoard, boardNumber } from '@/lib/game/billboard-ads'
import { logAdClick } from '@/lib/game/admin-api'
import { MAP_ZONES } from '@/lib/game/world-layout'
import styles from './ad-viewer.module.css'

/** Slides up when a billboard is tapped, or from a shared ?billboard=N link. */
export function AdViewer() {
  const [billboardId, setBillboardId] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)
  const [placeholder, setPlaceholder] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const onOpen = (event: Event) => {
      setCopied(false)
      setClosing(false)
      setBillboardId((event as CustomEvent<string>).detail)
    }
    window.addEventListener(OPEN_AD_EVENT, onOpen)
    const shared = new URLSearchParams(window.location.search).get('billboard')
    if (shared && MAP_ZONES.some((z) => z.id === `billboard-${shared}`)) setBillboardId(`billboard-${shared}`)
    return () => window.removeEventListener(OPEN_AD_EVENT, onOpen)
  }, [])

  // Slide back down, then unmount
  const close = useCallback(() => {
    setClosing(true)
    window.setTimeout(() => {
      setBillboardId(null)
      setClosing(false)
    }, 220)
  }, [])

  const n = billboardId ? boardNumber(billboardId) : 0
  const ad = n ? adForBoard(n) : null

  useEffect(() => {
    if (!billboardId) return
    if (!ad && !placeholder) setPlaceholder(drawAdPlaceholder(1200, 630, { tapHint: false }).toDataURL('image/png'))
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [billboardId, ad, placeholder, close])

  // One "open" per pop-up shown with a real ad
  useEffect(() => {
    if (billboardId && ad) logAdClick(n, ad.id, 'open')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- log once per board opened
  }, [billboardId])

  if (!billboardId) return null

  const share = async () => {
    if (ad) logAdClick(n, ad.id, 'share')
    const url = `${window.location.origin}/?billboard=${n}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      window.prompt('Copy this link', url)
    }
  }

  return (
    <BodyPortal>
      <div
        className={`${styles.overlay} ${closing ? styles.closing : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={`Billboard ${n}`}
        onClick={close}
      >
        <div className={styles.card} onClick={(e) => e.stopPropagation()}>
          <span className={styles.handle} aria-hidden="true" />
          <button type="button" className={styles.close} aria-label="Close ad" onClick={close}>
            <X size={18} aria-hidden="true" />
          </button>
          {ad ? (
            <Image
              className={styles.flyer}
              src={ad.image}
              alt={`${ad.advertiser}: ${ad.tagline}`}
              width={864}
              height={1080}
              sizes="(max-width: 480px) 100vw, 420px"
              loading="lazy"
              style={{ height: 'auto' }}
            />
          ) : placeholder ? (
            <img className={styles.ad} src={placeholder} alt="Your ad here — advertise on Ekpoma Life" />
          ) : null}
          <div className={styles.copy}>
            <p className={styles.meta}>
              Billboard {n}
              {BOARD_SPOTS[n] ? ` · ${BOARD_SPOTS[n]}` : ''}
            </p>
            {ad ? (
              <>
                <p className={styles.title}>{ad.advertiser}</p>
                <p className={styles.text}>{ad.tagline}</p>
                <div className={styles.ctas}>
                  {ad.whatsapp ? (
                    <a className={styles.whatsapp} href={ad.whatsapp} onClick={() => logAdClick(n, ad.id, 'whatsapp')} target="_blank" rel="noopener noreferrer">
                      <MessageCircle size={16} aria-hidden="true" /> WhatsApp
                    </a>
                  ) : null}
                  {ad.phone ? (
                    <a className={styles.call} href={`tel:${ad.phone}`} onClick={() => logAdClick(n, ad.id, 'call')}>
                      <Phone size={15} aria-hidden="true" /> {ad.phone}
                    </a>
                  ) : null}
                </div>
                {ad.group ? (
                  <a className={styles.group} href={ad.group} onClick={() => logAdClick(n, ad.id, 'group')} target="_blank" rel="noopener noreferrer">
                    <Users size={16} aria-hidden="true" /> Join our WhatsApp group
                  </a>
                ) : null}
              </>
            ) : (
              <>
                <p className={styles.title}>This billboard is open for ads</p>
                <p className={styles.text}>Brands and student businesses will be able to put their ads here soon.</p>
              </>
            )}
            <button type="button" className={styles.share} onClick={() => void share()}>
              <Link2 size={14} aria-hidden="true" /> {copied ? 'Link copied' : 'Share this billboard'}
            </button>
          </div>
        </div>
      </div>
    </BodyPortal>
  )
}
