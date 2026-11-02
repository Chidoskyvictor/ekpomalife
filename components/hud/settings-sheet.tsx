'use client'

import { useEffect, useState } from 'react'
import { setMusic, SOUND_EVENT, useMusicSettings } from '@/lib/audio/music'
import { ASSET_CREDITS, formatCredit } from '@/lib/game/asset-credits'
import { hapticTap } from './haptic'
import { HudDrawer } from './hud-drawer'
import styles from './life-hud.module.css'

export function SettingsSheet({
  open,
  onOpenChange,
  onLogOut,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onLogOut: () => void
}) {
  const [muted, setMuted] = useState(false)
  const music = useMusicSettings()

  useEffect(() => {
    if (!open) return
    try {
      setMuted(window.localStorage.getItem('ekpoma-life-muted') === '1')
    } catch {
      setMuted(false)
    }
  }, [open])

  const toggleMute = () => {
    hapticTap()
    setMuted((current) => {
      const next = !current
      try {
        window.localStorage.setItem('ekpoma-life-muted', next ? '1' : '0')
      } catch {
        /* ignore */
      }
      window.dispatchEvent(new Event(SOUND_EVENT))
      return next
    })
  }

  return (
    <HudDrawer fit open={open} onOpenChange={onOpenChange} title="More" description="Settings and account.">
      <div className={styles.settingsBody}>
        <button type="button" className={styles.settingsAction} onClick={toggleMute}>
          <span>Sound</span>
          <span className={styles.secondary}>{muted ? 'Off' : 'On'}</span>
        </button>
        <button
          type="button"
          className={styles.settingsAction}
          onClick={() => {
            hapticTap()
            setMusic({ on: !music.on })
          }}
        >
          <span>Music</span>
          <span className={styles.secondary}>{music.on && !muted ? 'On' : 'Off'}</span>
        </button>
        {music.on && !muted ? (
          <label className={styles.settingsHint} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span>Volume</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(music.volume * 100)}
              onChange={(event) => setMusic({ volume: Number(event.target.value) / 100 })}
              aria-label="Music volume"
              style={{ flex: 1, minHeight: 44, accentColor: '#2f7cf6' }}
            />
          </label>
        ) : null}
        <div>
          <p className={styles.settingsAction} style={{ cursor: 'default' }}>
            Help
          </p>
          <p className={styles.settingsHint}>
            Tap Up next to find a place. Swipe left to skip. Needs drop as the day runs — eat, rest, and gist.
          </p>
        </div>
        {ASSET_CREDITS.length > 0 ? (
          <div>
            <p className={styles.settingsAction} style={{ cursor: 'default' }}>
              Credits
            </p>
            {ASSET_CREDITS.map((credit) => (
              <p key={credit.file} className={styles.settingsHint}>
                {formatCredit(credit)}
              </p>
            ))}
          </div>
        ) : null}
        <button
          type="button"
          className={`${styles.settingsAction} ${styles.settingsActionDanger}`}
          onClick={() => {
            hapticTap()
            onLogOut()
            onOpenChange(false)
          }}
        >
          Log out
        </button>
      </div>
    </HudDrawer>
  )
}
