'use client'

import { useCallback, useEffect, useState } from 'react'
import { useGame } from '@/hooks/use-game'
import { useClubLive } from '@/lib/game/club-live'
import { enterVenue, fetchClubPeople, fetchVenue, leaveVenue, venueHeartbeat, type ClubPerson, type VenueView } from '@/lib/game/venues-api'

/**
 * Being inside a place with other players (backend venues: every public place is one).
 * Walks you in (free places), keeps you counted with a heartbeat, joins your crowd group's live
 * room, and keeps the "everyone here" list for the place sheet fresh. `autoEnter: false` for
 * places you pay to enter (clubs), which do their own entering.
 */
export function usePlacePresence(placeId: string, { autoEnter = true, enabled = true }: { autoEnter?: boolean; enabled?: boolean } = {}) {
  const { state } = useGame()
  const [view, setView] = useState<VenueView | null>(null)
  const [everyone, setEveryone] = useState<ClubPerson[]>([])

  const load = useCallback(async () => {
    const res = await fetchVenue(placeId)
    if (res.ok) setView(res)
    return res
  }, [placeId])

  const loadEveryone = useCallback(async () => {
    const res = await fetchClubPeople(placeId, 0)
    if (res.ok) setEveryone(res.people)
  }, [placeId])

  useEffect(() => {
    if (!enabled) return
    let stop = false
    void (async () => {
      const res = await load()
      // Every place lets you in at any hour, so you always see who's there
      if (stop || !autoEnter || !res.ok || res.me.paid) return
      const entered = await enterVenue(placeId)
      if (!stop && entered.ok) void load()
    })()
    return () => {
      stop = true
    }
  }, [placeId, load, autoEnter, enabled])

  const inside = enabled && !!view?.me.paid
  const live = useClubLive(placeId, inside, state?.username)

  // Heartbeat while inside (keeps your spot in the group); leave on the way out
  useEffect(() => {
    if (!inside) return
    void loadEveryone()
    const id = window.setInterval(() => {
      void venueHeartbeat(placeId)
      void load()
      void loadEveryone()
    }, 30_000)
    return () => {
      window.clearInterval(id)
      if (autoEnter) void leaveVenue(placeId)
    }
  }, [inside, placeId, load, loadEveryone, autoEnter])

  const me = state?.username
  /** Everyone here but you (all crowd groups). */
  const others = everyone.filter((p) => p.username !== me)
  /** The real number inside, never less than you plus who you can see. */
  const insideCount = Math.max(view?.inside ?? 0, live.peers.current.size + 1)

  return { view, load, inside, live, others, insideCount }
}

export type PlacePresence = ReturnType<typeof usePlacePresence>
