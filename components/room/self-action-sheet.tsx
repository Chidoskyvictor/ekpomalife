'use client'

import dynamic from 'next/dynamic'
import { Clock, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { BodyPortal } from '@/components/ui/body-portal'
import { hapticTap } from '@/components/hud/haptic'
import type { Appearance } from '@/lib/game/look'
import { SELF_ACTIONS, selfCooldownLeft, waitLabel, type Gain, type SelfAction } from '@/lib/game/self-actions'
import styles from './self-action-sheet.module.css'

const AvatarPortrait = dynamic(() => import('@/components/hud/avatar-portrait').then((m) => m.AvatarPortrait), { ssr: false })

const TONE: Record<string, string> = {
  Fun: styles.fun!,
  Social: styles.social!,
  Study: styles.study!,
  Energy: styles.energy!,
}

const chipClass = (g: Gain) => (g.kind === 'cost' ? styles.lose! : g.kind === 'skill' ? styles.skill! : (TONE[g.text.slice(1)] ?? styles.fun!))

/**
 * Tap your own character at home: one rounded bottom sheet (avatar + name + "What should they do?"
 * + close inside it) over a 2-column grid of action cards. Drag the handle up for more, down to close.
 */
export function SelfActionSheet({
  open,
  name,
  appearance,
  avatarColor,
  busy,
  onClose,
  onPick,
}: {
  open: boolean
  name: string
  appearance?: Appearance
  avatarColor: string
  /** Something is already running: cards wait. */
  busy: boolean
  onClose: () => void
  onPick: (action: SelfAction) => void
}) {
  const [tall, setTall] = useState(false)
  const [, tick] = useState(0)
  const drag = useRef<number | null>(null)

  useEffect(() => {
    if (!open) return
    hapticTap()
    setTall(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const id = window.setInterval(() => tick((n) => n + 1), 1000)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.clearInterval(id)
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <BodyPortal>
      <div className={styles.backdrop} onClick={onClose} role="presentation">
        <section
          className={`${styles.sheet} ${tall ? styles.tall : ''}`}
          role="dialog"
          aria-label="What should they do?"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className={styles.handle}
            aria-label={tall ? 'Show less' : 'Show more'}
            onClick={() => setTall((v) => !v)}
            onPointerDown={(e) => {
              drag.current = e.clientY
            }}
            onPointerUp={(e) => {
              const from = drag.current
              drag.current = null
              if (from === null) return
              const dy = e.clientY - from
              if (dy < -30) setTall(true)
              else if (dy > 30) (tall ? setTall(false) : onClose())
            }}
          >
            <span aria-hidden="true" />
          </button>
          <header className={styles.head}>
            <span className={styles.avatar}>
              <AvatarPortrait appearance={appearance} fallbackColor={avatarColor} initial={(name[0] ?? '?').toUpperCase()} className={styles.face} />
            </span>
            <span className={styles.titles}>
              <strong>{name}</strong>
              <span>What should they do?</span>
            </span>
            <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
              <X size={18} aria-hidden="true" />
            </button>
          </header>
          <div className={styles.grid}>
            {SELF_ACTIONS.map((a) => {
              const wait = selfCooldownLeft(a)
              return (
                <button key={a.id} type="button" className={styles.card} disabled={busy || wait > 0} onClick={() => onPick(a)}>
                  <span className={styles.top}>
                    <span className={styles.emoji} aria-hidden="true">
                      {a.emoji}
                    </span>
                    <span className={styles.time}>
                      <Clock size={12} aria-hidden="true" />
                      {a.seconds}s
                    </span>
                  </span>
                  <span className={a.earns ? styles.earns : styles.free}>{a.earns ? `Earns ₦${a.earns}` : 'Free'}</span>
                  <span className={styles.title}>{a.title}</span>
                  <span className={styles.chips}>
                    {a.gains.map((g) => (
                      <span key={g.text} className={`${styles.chip} ${chipClass(g)}`}>
                        {g.text}
                      </span>
                    ))}
                  </span>
                  {wait > 0 ? <span className={styles.wait}>Ready in {waitLabel(wait)}</span> : null}
                </button>
              )
            })}
          </div>
        </section>
      </div>
    </BodyPortal>
  )
}
