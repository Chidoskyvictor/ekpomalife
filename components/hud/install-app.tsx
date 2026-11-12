'use client'

import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { BodyPortal } from '@/components/ui/body-portal'
import { useDrive } from '@/lib/game/drive'
import styles from './launch-invite.module.css'

/** Shown again at most this often after "Not now". */
const AGAIN_MS = 3 * 24 * 60 * 60 * 1000
const KEY = 'ekpoma-install-asked-v1'
/** Let the game load and the player settle in before asking. */
const DELAY_MS = 25_000

/** Chrome / Edge / Samsung Internet hand us this event when the game can be installed. */
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

const installed = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.matchMedia('(display-mode: fullscreen)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

/** Chrome can fire its install event before the game has loaded: catch it from the start. */
let early: InstallEvent | null = null
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    early = e as InstallEvent
  })
}

/** iPhone / iPad Safari: no install event, but "Share → Add to Home Screen" works. */
function iosSafari() {
  const ua = navigator.userAgent
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)
}

function askedRecently() {
  try {
    const at = Number(window.localStorage.getItem(KEY) || 0)
    return Date.now() - at < AGAIN_MS
  } catch {
    return false
  }
}

function markAsked() {
  try {
    window.localStorage.setItem(KEY, String(Date.now()))
  } catch {
    /* storage blocked: it may ask again next visit */
  }
}

/**
 * "Install Ekpoma Life": for players who haven't installed the game yet. On Chrome (Android and
 * desktop) the Install button opens the browser's own install prompt; on iPhone Safari it shows the
 * two taps (Share, then Add to Home Screen). Never shown once installed, never while driving, at
 * most every few days after "Not now", and it waits while another card is open.
 */
export function InstallApp() {
  const reduce = useReducedMotion() ?? false
  const drive = useDrive()
  const [open, setOpen] = useState<'chrome' | 'ios' | null>(null)
  const event = useRef<InstallEvent | null>(null)

  useEffect(() => {
    if (installed() || askedRecently()) return
    event.current = early
    const onPrompt = (e: Event) => {
      e.preventDefault() // we show our own card first
      event.current = e as InstallEvent
    }
    const onInstalled = () => {
      event.current = null
      setOpen(null)
      markAsked()
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    const ios = iosSafari()
    const timer = window.setInterval(() => {
      if (!event.current && !ios) return
      // Wait while another card is up, or while driving
      if (document.querySelector('[role="dialog"]') || document.querySelector('[aria-label="Driving"]')) return
      window.clearInterval(timer)
      markAsked()
      setOpen(event.current ? 'chrome' : 'ios')
    }, DELAY_MS)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (!open || drive) return null
  const close = () => setOpen(null)
  const install = async () => {
    const e = event.current
    close()
    if (!e) return
    event.current = null
    await e.prompt().catch(() => {})
  }

  return (
    <BodyPortal>
      <div className={styles.backdrop} onClick={close}>
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="install-app-title"
          className={styles.card}
          onClick={(e) => e.stopPropagation()}
          initial={reduce ? false : { opacity: 0, y: 14, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
        >
          <span className={styles.emoji} aria-hidden="true" style={{ background: '#e8f5ee' }}>
            📲
          </span>
          <h2 id="install-app-title" className={styles.title}>
            Install Ekpoma Life
          </h2>
          {open === 'chrome' ? (
            <p className={styles.why}>Put the game on your home screen: it opens full screen, loads faster and feels like a real app.</p>
          ) : (
            <p className={styles.why}>
              Put the game on your home screen: tap <strong>Share</strong> <span aria-hidden="true">⬆️</span> at the bottom of Safari, then{' '}
              <strong>Add to Home Screen</strong>.
            </p>
          )}
          <div className={styles.actions}>
            <button type="button" className={styles.cancel} onClick={close}>
              Not now
            </button>
            {open === 'chrome' ? (
              <button type="button" className={styles.go} onClick={() => void install()}>
                Install
              </button>
            ) : (
              <button type="button" className={styles.go} onClick={close}>
                Got it
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </BodyPortal>
  )
}
