'use client'

import { useEffect, useMemo, useState } from 'react'
import { fetchClubSongs, type PromotedSong } from '@/lib/game/venues-api'

/** How long each promoted song holds the LED screen. */
export const SONG_SLOT_MS = 25_000

/** https links only (the server checks too); anything else never becomes a button. */
export function safeLink(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    return u.protocol === 'https:' ? u.toString() : null
  } catch {
    return null
  }
}

/**
 * The songs admins promote, cycling on a shared clock (everyone in the club sees the same
 * song at the same time without any extra messages). A song with weight 3 holds 3 slots.
 */
export function useClubSongs(venueId: string, enabled: boolean) {
  const [songs, setSongs] = useState<PromotedSong[]>([])
  const [slot, setSlot] = useState(() => Math.floor(Date.now() / SONG_SLOT_MS))

  useEffect(() => {
    if (!enabled) return
    let stop = false
    const load = () =>
      void fetchClubSongs(venueId).then((res) => {
        if (!stop && res.ok) setSongs(res.songs)
      })
    load()
    const id = window.setInterval(load, 5 * 60_000)
    return () => {
      stop = true
      window.clearInterval(id)
    }
  }, [venueId, enabled])

  useEffect(() => {
    const tick = () => setSlot(Math.floor(Date.now() / SONG_SLOT_MS))
    const id = window.setInterval(tick, 2000)
    return () => window.clearInterval(id)
  }, [])

  const playlist = useMemo(() => songs.flatMap((s) => Array.from({ length: Math.max(1, s.weight) }, () => s)), [songs])
  const current = playlist.length ? playlist[slot % playlist.length]! : null
  return { songs, current }
}
