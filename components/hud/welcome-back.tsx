'use client'

import { useEffect, useState } from 'react'
import { PlayerFace } from '@/components/look/player-face'
import { SocialRow } from '@/components/seo/social-row'
import { useGame } from '@/hooks/use-game'
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
  const { isGuest, state, logOut } = useGame()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (isGuest || !state || !openedOnGame || alreadyWelcomed()) return
    markWelcomed()
    setOpen(true)
  }, [isGuest, state])

  if (!open || !state) return null
  const cal = calendarForDay(state.day)

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
            <PlayerFace look={state.appearance} color={state.avatarColor} label={state.characterName} size={52} />
            <span className={styles.who}>
              <strong>{state.characterName}</strong>
              <span>
                {cal.label} · {compactMoney(state.cash)}
              </span>
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
              Signed in as <b>@{state.username}</b>
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
