'use client'

import { ChevronDown, ChevronLeft } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  createSpace,
  isJoin,
  scheduleDays,
  slotLabel,
  slotsForDay,
  whenLabel,
  type SpaceCard,
  type SpaceJoin,
  type SpaceVisibility,
} from '@/lib/game/spaces-api'
import { SpacesPlacePicker } from './spaces-place-picker'
import { placeLabel } from './spaces-ui'
import styles from './spaces.module.css'

const TITLE_MAX = 60
const VISIBILITY: { id: SpaceVisibility; label: string }[] = [
  { id: 'public', label: 'Public' },
  { id: 'link', label: 'Link only' },
  { id: 'invite', label: 'Invite-only' },
]
/* The server caps a room at 50 listeners for now; the bigger sizes show but stay locked. */
const SIZES = [
  { n: 50, open: true },
  { n: 100, open: false },
  { n: 250, open: false },
]

/** New Space as a full page inside the phone (same pattern as the venue picker: no popups outside the frame). */
export function NewSpacePage({
  presetPlaceId,
  onBack,
  onStarted,
  onScheduled,
}: {
  presetPlaceId?: string | null
  onBack: () => void
  onStarted: (join: SpaceJoin) => void
  onScheduled: (space: SpaceCard) => void
}) {
  const [title, setTitle] = useState('')
  const [placeId, setPlaceId] = useState<string | null>(presetPlaceId ?? null)
  const [picking, setPicking] = useState(false)
  const [visibility, setVisibility] = useState<SpaceVisibility>('public')
  const [later, setLater] = useState(false)
  const [day, setDay] = useState<string | null>(null)
  const [slot, setSlot] = useState<string | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [askToSpeak, setAskToSpeak] = useState(true)
  const [size, setSize] = useState(50)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const now = useMemo(() => new Date(), [])
  const days = useMemo(() => scheduleDays(now), [now])
  const activeDay = day ?? days[0]!.key
  const slots = useMemo(() => slotsForDay(activeDay, now), [activeDay, now])

  const canSubmit = title.trim().length > 0 && (!later || slot !== null) && !busy

  async function submit() {
    setBusy(true)
    setError(null)
    const res = await createSpace({
      title: title.trim(),
      placeId,
      visibility,
      scheduledAt: later ? slot : null,
      maxListeners: size,
      askToSpeak,
    })
    setBusy(false)
    if (!res.ok) return setError(res.error)
    if (isJoin(res)) onStarted(res)
    else onScheduled(res.space)
  }

  if (picking) {
    return (
      <SpacesPlacePicker
        selected={placeId}
        onBack={() => setPicking(false)}
        onPick={(id) => {
          setPlaceId(id)
          setPicking(false)
        }}
      />
    )
  }

  return (
    <div className={styles.root}>
      <div className={styles.top}>
        <button type="button" className={styles.back} aria-label="Back" onClick={onBack}>
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <h2 className={styles.title}>New Space</h2>
      </div>

      <div className={styles.screen}>
        <label className={styles.titleBox}>
          <textarea
            className={styles.titleInput}
            value={title}
            maxLength={TITLE_MAX}
            rows={2}
            placeholder="What’s it about?"
            aria-label="Title"
            onChange={(e) => setTitle(e.target.value.replace(/\n/g, ' '))}
          />
          <span className={styles.titleCount}>{TITLE_MAX - [...title].length}</span>
        </label>

        <div className={styles.field}>
          <span className={styles.label}>Where</span>
          <div className={styles.seg} role="group" aria-label="Where">
            <button
              type="button"
              className={`${styles.pill} ${!placeId ? styles.pillOn : ''}`}
              aria-pressed={!placeId}
              onClick={() => setPlaceId(null)}
            >
              Anywhere
            </button>
            <button
              type="button"
              className={`${styles.pill} ${placeId ? styles.pillOn : ''}`}
              aria-pressed={Boolean(placeId)}
              onClick={() => setPicking(true)}
            >
              At a place
            </button>
          </div>
          {placeId ? (
            <button type="button" className={styles.placeChosen} onClick={() => setPicking(true)}>
              <span>📍 {placeLabel(placeId)}</span>
              <span className={styles.change}>Change</span>
            </button>
          ) : null}
        </div>

        <div className={styles.field}>
          <span className={styles.label}>Who</span>
          <div className={styles.seg} role="group" aria-label="Who can join">
            {VISIBILITY.map((v) => (
              <button
                key={v.id}
                type="button"
                className={`${styles.pill} ${visibility === v.id ? styles.pillOn : ''}`}
                aria-pressed={visibility === v.id}
                onClick={() => setVisibility(v.id)}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.field}>
          <span className={styles.label}>When</span>
          <div className={styles.seg} role="group" aria-label="When">
            <button type="button" className={`${styles.pill} ${!later ? styles.pillOn : ''}`} aria-pressed={!later} onClick={() => setLater(false)}>
              Now
            </button>
            <button type="button" className={`${styles.pill} ${later ? styles.pillOn : ''}`} aria-pressed={later} onClick={() => setLater(true)}>
              Later
            </button>
          </div>
          {later ? (
            <>
              <div className={styles.strip} role="group" aria-label="Day">
                {days.map((d) => (
                  <button
                    key={d.key}
                    type="button"
                    className={`${styles.day} ${activeDay === d.key ? styles.pillOn : ''}`}
                    aria-pressed={activeDay === d.key}
                    onClick={() => {
                      setDay(d.key)
                      setSlot(null)
                    }}
                  >
                    {d.label}
                    <strong>{d.sub}</strong>
                  </button>
                ))}
              </div>
              <div className={styles.slots} role="group" aria-label="Time">
                {slots.map((s) => {
                  const iso = s.toISOString()
                  return (
                    <button
                      key={iso}
                      type="button"
                      className={`${styles.pill} ${slot === iso ? styles.pillOn : ''}`}
                      aria-pressed={slot === iso}
                      onClick={() => setSlot(iso)}
                    >
                      {slotLabel(s)}
                    </button>
                  )
                })}
                {slots.length === 0 ? <p className={styles.fine}>No more slots today. Pick another day.</p> : null}
              </div>
              <p className={styles.fine}>{slot ? `${whenLabel(slot)} · Lagos time` : 'Pick a time · Lagos time'}</p>
            </>
          ) : null}
        </div>

        <button type="button" className={styles.more} aria-expanded={moreOpen} onClick={() => setMoreOpen((v) => !v)}>
          More
          <ChevronDown size={18} aria-hidden="true" style={{ transform: moreOpen ? 'rotate(180deg)' : undefined }} />
        </button>
        {moreOpen ? (
          <>
            <label className={styles.toggle}>
              Listeners can ask to speak
              <input type="checkbox" checked={askToSpeak} onChange={(e) => setAskToSpeak(e.target.checked)} />
            </label>
            <div className={styles.field}>
              <span className={styles.label}>Room size</span>
              <div className={styles.seg} role="group" aria-label="Room size">
                {SIZES.map((s) => (
                  <button
                    key={s.n}
                    type="button"
                    disabled={!s.open}
                    className={`${styles.pill} ${size === s.n ? styles.pillOn : ''}`}
                    aria-pressed={size === s.n}
                    onClick={() => setSize(s.n)}
                  >
                    {s.n}
                  </button>
                ))}
              </div>
              <p className={styles.fine}>Rooms hold up to 50 listeners for now.</p>
            </div>
          </>
        ) : null}
      </div>

      <div className={styles.pinned}>
        {error ? <p className={styles.error}>{error}</p> : null}
        <button type="button" className={styles.big} disabled={!canSubmit} onClick={() => void submit()}>
          {busy ? 'Please wait…' : later ? 'Schedule' : 'Start now'}
        </button>
        <p className={styles.fine} style={{ textAlign: 'center' }}>
          Up to 60 min · you start muted
        </p>
      </div>
    </div>
  )
}
