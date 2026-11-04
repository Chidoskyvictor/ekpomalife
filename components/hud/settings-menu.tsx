'use client'

import { Settings2 } from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { SOUND_EVENT, setMusic, useMusicSettings } from '@/lib/audio/music'
import { useShowMapLabels } from '@/lib/game/map-labels'
import styles from './settings-menu.module.css'

const MUTED_KEY = 'ekpoma-life-muted'

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTED_KEY) === '1'
  } catch {
    return false
  }
}

function useMuted(): [boolean, (v: boolean) => void] {
  const muted = useSyncExternalStore(
    (fn) => {
      window.addEventListener(SOUND_EVENT, fn)
      return () => window.removeEventListener(SOUND_EVENT, fn)
    },
    readMuted,
    () => false,
  )
  const set = (v: boolean) => {
    try {
      window.localStorage.setItem(MUTED_KEY, v ? '1' : '0')
    } catch {
      /* storage blocked */
    }
    window.dispatchEvent(new Event(SOUND_EVENT))
  }
  return [muted, set]
}

function Row({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={styles.row} onClick={() => onChange(!on)}>
      <span>{label}</span>
      <span className={`${styles.switch} ${on ? styles.switchOn : ''}`} aria-hidden="true">
        <span className={styles.knob} />
      </span>
    </button>
  )
}

/** Round settings button under the top bar: Music, Sound and map labels (saved on this device). */
export function SettingsMenu() {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const music = useMusicSettings()
  const [muted, setMuted] = useMuted()
  const [showLabels, setShowLabels] = useShowMapLabels()

  // Tap anywhere outside closes it
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Taps inside never reach the map underneath
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()

  return (
    <div ref={root} className={styles.root} onPointerDown={stop} onPointerUp={stop} onClick={stop}>
      <button
        type="button"
        className={styles.trigger}
        aria-label="Settings"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
      >
        <Settings2 size={20} aria-hidden="true" />
      </button>
      {open ? (
        <div className={styles.menu} role="group" aria-label="Settings">
          <Row label="Music" on={music.on} onChange={(v) => setMusic({ on: v })} />
          <Row label="Sound" on={!muted} onChange={(v) => setMuted(!v)} />
          <Row label="Map labels" on={showLabels} onChange={setShowLabels} />
        </div>
      ) : null}
    </div>
  )
}
