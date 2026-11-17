'use client'

import { useLayoutEffect, useState } from 'react'
import { PlayerFace } from '@/components/look/player-face'
import { SocialRow } from '@/components/seo/social-row'
import { useGame } from '@/hooks/use-game'
import { useAuthGate } from '@/lib/auth/auth-gate-context'
import { calendarForDay, compactMoney } from '@/lib/game/needs'
import { hapticTap } from './haptic'
import styles from './welcome-back.module.css'

const KEY = 'ekpoma-welcomed'

/**
 * Where the app was first opened. Only an app opened straight onto the game (a returning, still
 * signed-in player) gets the welcome back card, not someone who just logged in or signed up.
 */
const openedOnGame =
  typeof window !== 'undefined' &&
  (window.location.pathname === '/' || window.location.pathname === '/room' || window.location.pathname.startsWith('/room/'))

function alreadyWelcomed() {
  try {
    return window.sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

function markWelcomed() {
  try {
    window.sessionStorage.setItem(KEY, '1')
  } catch {
    /* storage blocked: the card just shows once per load */
  }
}

/** "Welcome back" when you reopen the app: your character, day and money, Continue or Log out. */
export function WelcomeBack() {
  const { state, logOut } = useGame()
  const { me } = useAuthGate()
  const [open, setOpen] = useState(false)

  // Cover the screen before the first paint, as soon as we know you're signed in (the game loads
  // behind it); your face, day and cash fill in when your game arrives.
  useLayoutEffect(() => {
    if (!me || !me.setupComplete || me.support || !openedOnGame || alreadyWelcomed()) return
    markWelcomed()
    setOpen(true)
  }, [me])

  if (!open) return null
  const cal = state ? calendarForDay(state.day) : null

  return (
    <div className={styles.screen} role="dialog" aria-modal="true" aria-label="Welcome back">
      <div className={styles.brand}>
        <img src="/logo.png" alt="" width={64} height={64} />
        <strong>Ekpoma Life</strong>
        <span>Live your AAU story.</span>
      </div>

      <div className={styles.bottom}>
        <div className={styles.card}>
          <div className={styles.me}>
            {state ? (
              <PlayerFace look={state.appearance} color={state.avatarColor} label={state.characterName} size={52} />
            ) : (
              <span className={styles.facePending} aria-hidden="true" />
            )}
            <span className={styles.who}>
              <strong>{state ? state.characterName : 'Welcome back'}</strong>
              <span>{state && cal ? `${cal.label} · ${compactMoney(state.cash)}` : 'Loading your life…'}</span>
            </span>
          </div>
          <button
            type="button"
            className={styles.go}
            onClick={() => {
              hapticTap()
              setOpen(false)
            }}
          >
            Continue
          </button>
          <div className={styles.foot}>
            <span>
              Signed in{state ? <> as <b>@{state.username}</b></> : null}
            </span>
            <button
              type="button"
              className={styles.out}
              onClick={() => {
                setOpen(false)
                logOut()
              }}
            >
              Log out
            </button>
          </div>
        </div>
        <SocialRow />
      </div>
    </div>
  )
}
