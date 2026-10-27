'use client'

import { useCallback, useEffect, useState } from 'react'
import { HudDrawer } from '@/components/hud/hud-drawer'
import { useGame } from '@/hooks/use-game'
import { fareOf, fetchTravelOptions, type TravelOption, type TravelOptions, type TripMode } from '@/lib/game/travel-api'
import { OPEN_TRAVEL_EVENT } from '@/lib/game/trip'
import { useGoTo } from './use-go'
import styles from './travel.module.css'

const MODES: { id: TripMode; emoji: string; label: string }[] = [
  { id: 'trek', emoji: '🚶', label: 'Trek' },
  { id: 'keke', emoji: '🛺', label: 'Keke' },
  { id: 'okada', emoji: '🏍️', label: 'Okada' },
]

const TYPE_EMOJI: Record<string, string> = {
  campus: '🎓',
  hostel: '🛏️',
  food: '🍲',
  shop: '🛒',
  transport: '🛺',
  leisure: '🎉',
  worship: '⛪',
  community: '🏥',
}

/**
 * "Where to?" (bottom sheet) and the trip that follows. Opened by the map's corner button or
 * the street's (OPEN_TRAVEL_EVENT). Trek is free; keke / okada fares are charged by the server.
 * The trip screen itself is TripLayer (root layout), so it survives the page change.
 */
export function TravelControl() {
  const { state } = useGame()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<TripMode>('trek')
  const [options, setOptions] = useState<TravelOptions | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener(OPEN_TRAVEL_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_TRAVEL_EVENT, onOpen)
  }, [])

  // Fresh list (and fares) every time the sheet opens
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setError(null)
    void fetchTravelOptions().then((res) => {
      if (cancelled) return
      if (res.ok) setOptions(res)
      else setError(res.error)
    })
    return () => {
      cancelled = true
    }
  }, [open])

  const { go: takeTrip } = useGoTo()
  const go = useCallback(
    (option: TravelOption, how: TripMode) => {
      if (options) return takeTrip(options, option, how, () => setOpen(false))
    },
    [options, takeTrip],
  )

  const cash = state?.cash ?? 0

  return (
    <>
      <HudDrawer
        open={open}
        onOpenChange={setOpen}
        title="Where to?"
        description={options ? `From ${options.fromLabel}` : undefined}
      >
        <div className={styles.modes} role="radiogroup" aria-label="How you go">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={mode === m.id}
              className={`${styles.mode} ${mode === m.id ? styles.modeOn : ''}`}
              onClick={() => setMode(m.id)}
            >
              <span>
                {m.emoji} {m.label}
              </span>
              <small>{m.id === 'trek' ? 'Free' : 'Fast'}</small>
            </button>
          ))}
        </div>
        {error ? <p className={styles.status}>{error}</p> : null}
        {!options && !error ? <p className={styles.status}>Finding places…</p> : null}
        {options ? (
          <ul className={styles.list}>
            {options.places.map((option) => {
              const fare = fareOf(option, mode)
              const meta =
                option.hops === 0
                  ? 'Right here'
                  : mode === 'trek' || option.near
                    ? `🚶 ${option.minutes.trek} min walk`
                    : `🛺 ${option.minutes[mode]} min ride`
              return (
                <li key={option.id}>
                  <button type="button" className={styles.place} onClick={() => void go(option, mode)}>
                    <span className={styles.placeEmoji} aria-hidden="true">
                      {option.home ? '🏠' : (TYPE_EMOJI[option.type] ?? '📍')}
                    </span>
                    <span className={styles.placeText}>
                      <span className={styles.placeName}>
                        {option.home ? `Home${state?.houseNumber ? ` · No. ${state.houseNumber}` : ''}` : option.label}
                      </span>
                      <span className={styles.placeMeta}>{meta}</span>
                    </span>
                    <span className={`${styles.fare} ${fare > cash ? styles.fareShort : ''}`}>
                      {fare ? `₦${fare.toLocaleString()}` : 'Free'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : null}
      </HudDrawer>
    </>
  )
}
