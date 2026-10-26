'use client'

import { useCallback, useEffect, useState } from 'react'
import { HudDrawer } from '@/components/hud/hud-drawer'
import { PlayerProfilePanel } from '@/components/profile/player-profile-panel'
import { openDirectChat } from '@/lib/game/hostels-api'
import { requestOpenChat } from '@/lib/game/open-chat'
import { OPEN_GAMES_EVENT } from '@/lib/game/open-games'
import { fetchClubPeople, type ClubPerson } from '@/lib/game/venues-api'
import styles from './club.module.css'

/** Everyone inside the club right now (all crowd groups), a page at a time. Tap for profile / message. */
export function ClubPeople({
  venueId,
  open,
  onOpenChange,
  initialPick = null,
}: {
  venueId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Open straight on this person's profile (tapped from the club sheet). */
  initialPick?: ClubPerson | null
}) {
  const [people, setPeople] = useState<ClubPerson[]>([])
  const [total, setTotal] = useState(0)
  const [next, setNext] = useState<number | null>(0)
  const [loading, setLoading] = useState(false)
  const [picked, setPicked] = useState<ClubPerson | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    async (offset: number) => {
      setLoading(true)
      const res = await fetchClubPeople(venueId, offset)
      setLoading(false)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setError(null)
      setTotal(res.total)
      setNext(res.next)
      setPeople((current) => (offset === 0 ? res.people : [...current, ...res.people]))
    },
    [venueId],
  )

  useEffect(() => {
    if (!open) return
    setPicked(initialPick)
    void load(0)
  }, [open, load, initialPick])

  // Profile's "Challenge" opens the phone's Games app; get out of its way
  useEffect(() => {
    if (!open) return
    const close = () => onOpenChange(false)
    window.addEventListener(OPEN_GAMES_EVENT, close)
    return () => window.removeEventListener(OPEN_GAMES_EVENT, close)
  }, [open, onOpenChange])

  const message = async (person: ClubPerson) => {
    const res = await openDirectChat(person.userId)
    if (!res.ok) {
      setError(res.error)
      return
    }
    onOpenChange(false)
    requestOpenChat(res.chat)
  }

  return (
    <HudDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={picked ? `@${picked.username}` : `${total.toLocaleString()} inside`}
      description={picked ? 'In the club now' : 'Everyone in the club right now'}
    >
      {picked ? (
        <>
          <div className={styles.profileBar}>
            <button type="button" className={styles.ghost} onClick={() => setPicked(null)}>
              Back
            </button>
            <button type="button" className={styles.primary} onClick={() => void message(picked)}>
              Message
            </button>
          </div>
          <PlayerProfilePanel playerId={picked.userId} compact />
        </>
      ) : (
        <div className={styles.list}>
          {error ? <p className={styles.error}>{error}</p> : null}
          {!people.length && !loading ? <p className={styles.note}>Nobody else is in yet. You're early!</p> : null}
          {people.map((person) => (
            <button key={person.userId} type="button" className={styles.person} onClick={() => setPicked(person)}>
              <span className={styles.avatar} aria-hidden="true">
                {person.username.slice(0, 1).toUpperCase()}
              </span>
              <span className={styles.personText}>
                <span className={styles.personName}>@{person.username}</span>
              </span>
              {person.vip ? <span className={`${styles.tag} ${styles.tagVip}`}>VIP</span> : null}
              {person.sameGroup ? <span className={styles.tag}>Near you</span> : null}
            </button>
          ))}
          {next != null && people.length ? (
            <button type="button" className={styles.more} disabled={loading} onClick={() => void load(next)}>
              {loading ? 'Loading…' : 'Load more'}
            </button>
          ) : null}
        </div>
      )}
    </HudDrawer>
  )
}
