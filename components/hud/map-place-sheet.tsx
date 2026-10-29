'use client'

import { Link2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AuthLinks } from '@/components/hud/auth-links'
import { useGoTo } from '@/components/travel/use-go'
import { useGame } from '@/hooks/use-game'
import { ACTION_LABELS } from '@/lib/game/places'
import { isComingSoon, placeFor, placeInfo, placeLink } from '@/lib/game/place-info'
import { fareOf, fetchTravelOptions, type TravelOptions, type TripMode } from '@/lib/game/travel-api'
import styles from './map-place-sheet.module.css'

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

/** Keke and okada are the only paid rides for now; big-boy jeep comes when players can own cars. */
const MODES: { id: TripMode; emoji: string; label: string }[] = [
  { id: 'trek', emoji: '🚶', label: 'Trek' },
  { id: 'keke', emoji: '🛺', label: 'Keke' },
  { id: 'okada', emoji: '🏍️', label: 'Okada' },
]

const naira = (amount: number) => `₦${amount.toLocaleString()}`

function formatHour(hour: number) {
  return `${hour % 12 || 12}${hour < 12 ? 'am' : 'pm'}`
}

/**
 * Tap a place on the map and this sheet comes up: what it is, a link to share it, what you can do
 * there and the ways to get there (trek is free, keke and okada cost). Go starts the trip.
 */
export function MapPlaceSheet({ hidden = false }: { hidden?: boolean }) {
  const { state, booting, selectedId, select, act, notifyToast } = useGame()
  const { go, travelling } = useGoTo()
  const place = placeFor(selectedId)
  const [mode, setMode] = useState<TripMode>('trek')
  const [options, setOptions] = useState<TravelOptions | null>(null)
  const [failed, setFailed] = useState(false)
  const linked = useRef(false)
  const body = useRef<HTMLDivElement>(null)

  // A shared link (?place=…) opens the map on that place, once
  useEffect(() => {
    if (booting || linked.current) return
    linked.current = true
    const url = new URL(window.location.href)
    const id = url.searchParams.get('place')
    if (!id) return
    url.searchParams.delete('place')
    window.history.replaceState(null, '', url.pathname + url.search + url.hash)
    if (placeFor(id)) select(placeFor(id)!.id)
    else if (isComingSoon(id)) select(id)
  }, [booting, select])

  const placeId = place?.id ?? null
  // Each place opens at the top of its sheet
  useEffect(() => {
    body.current?.scrollTo({ top: 0 })
  }, [placeId])
  const here = Boolean(state && placeId && state.locationId === placeId)
  const signedIn = Boolean(state)

  // Fresh fares and times whenever you pick another place
  useEffect(() => {
    setMode('trek')
    setFailed(false)
    if (!placeId || !signedIn || here) return
    let cancelled = false
    void fetchTravelOptions().then((res) => {
      if (cancelled) return
      if (res.ok) setOptions(res)
      else setFailed(true)
    })
    return () => {
      cancelled = true
    }
  }, [placeId, signedIn, here, state?.locationId])

  useEffect(() => {
    if (!placeId) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') select(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [placeId, select])

  const option = useMemo(() => options?.places.find((p) => p.id === placeId) ?? null, [options, placeId])

  if (!place || hidden) return null

  const info = placeInfo(place.id)
  const gameTime = state?.gameTime ?? 12 * 60
  const hour = Math.floor((((gameTime % 1440) + 1440) % 1440) / 60)
  const hours = place.openHours
  const open = !hours || (hours.open <= hours.close ? hour >= hours.open && hour < hours.close : hour >= hours.open || hour < hours.close)
  const fare = option ? fareOf(option, mode) : 0
  const cash = state?.cash ?? 0
  const short = fare > cash

  const share = async () => {
    const url = placeLink(window.location.origin, place.id)
    try {
      if (navigator.share) {
        await navigator.share({ title: place.label, url })
        return
      }
      await navigator.clipboard.writeText(url)
      notifyToast('Link copied', true)
    } catch {
      /* the share sheet was closed, or the browser blocked it */
    }
  }

  const minutes = (id: TripMode) => (option ? option.minutes[id] : null)

  return (
    <section className={styles.sheet} aria-label={`${place.label} details`}>
      <div className={styles.handle} aria-hidden="true" />
      <header className={styles.head}>
        <span className={styles.icon} aria-hidden="true">
          {TYPE_EMOJI[place.type] ?? '📍'}
        </span>
        <div className={styles.titles}>
          <h2>{place.label}</h2>
          <p>
            {info?.area ?? 'Ekpoma'}
            {hours ? (
              <span className={`${styles.pill} ${open ? styles.pillOpen : ''}`}>
                {open ? 'Open' : `Opens ${formatHour(hours.open)}`}
              </span>
            ) : null}
          </p>
        </div>
        <button type="button" className={styles.close} aria-label="Close" onClick={() => select(null)}>
          <X size={18} aria-hidden="true" />
        </button>
      </header>

      <div className={styles.body} ref={body}>
        {info ? <p className={styles.about}>{info.about}</p> : null}
        <button type="button" className={styles.share} onClick={() => void share()}>
          <Link2 size={16} aria-hidden="true" />
          Share a link to {place.label}
        </button>

        {here && place.actions.length > 0 ? (
          <>
            <h3 className={styles.sub}>You are here · what you can do</h3>
            <div className={styles.todo}>
              {place.actions.map((id) => {
                const meta = ACTION_LABELS[id] ?? { label: id, hint: '' }
                return (
                  <button key={id} type="button" className={styles.doBtn} onClick={() => void act(id)}>
                    <strong>{meta.label}</strong>
                    <span>{meta.hint}</span>
                  </button>
                )
              })}
            </div>
          </>
        ) : info ? (
          <>
            <h3 className={styles.sub}>What you can do here</h3>
            <ul className={styles.things}>
              {info.doing.map((line) => (
                <li key={line.text}>
                  <span aria-hidden="true">{line.emoji}</span>
                  {line.text}
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {signedIn && !here ? (
          <>
            <h3 className={styles.sub}>Ways to get there</h3>
            <div className={styles.modes} role="radiogroup" aria-label="How you go">
              {MODES.map((m) => {
                const price = option ? fareOf(option, m.id) : null
                const min = minutes(m.id)
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={mode === m.id}
                    className={`${styles.mode} ${mode === m.id ? styles.modeOn : ''}`}
                    onClick={() => setMode(m.id)}
                  >
                    <span className={styles.modeEmoji} aria-hidden="true">
                      {m.emoji}
                    </span>
                    <strong>{m.label}</strong>
                    <small>{price === null ? '…' : price ? naira(price) : 'Free'}</small>
                    {min ? <small className={styles.min}>~{min} min</small> : null}
                  </button>
                )
              })}
            </div>
            {failed ? <p className={styles.note}>Could not load fares. Close this and tap the place again.</p> : null}
          </>
        ) : null}

        {!signedIn ? (
          <div className={styles.guest}>
            <p>Sign up or log in to come to {place.label}.</p>
            <AuthLinks className="mt-3 justify-end" />
          </div>
        ) : null}
      </div>

      {signedIn && !here ? (
        <footer className={styles.foot}>
          <button
            type="button"
            className={styles.go}
            disabled={!options || !option || travelling || short}
            onClick={() => options && option && void go(options, option, mode, () => select(null))}
          >
            {short ? `Need ${naira(fare)}` : `Go · ${fare ? naira(fare) : 'Free'}`}
          </button>
        </footer>
      ) : null}
    </section>
  )
}
