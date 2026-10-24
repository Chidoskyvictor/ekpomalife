'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createHostel,
  fetchMyHostel,
  joinHostel,
  leaveHostel,
  searchHostels,
  type HostelSearchHit,
  type HostelSummary,
} from '@/lib/game/hostels-api'
import { refreshChatUnread } from './use-chat-unread'

/** Fired after join/leave so every mounted useMyHostel() refreshes. */
const HOSTEL_CHANGED = 'ekpoma:hostel-changed'

export type MyHostel = { hostel: HostelSummary | null; chatId: string | null }

export function useMyHostel(enabled = true) {
  const [state, setState] = useState<MyHostel & { loading: boolean }>({
    hostel: null,
    chatId: null,
    loading: true,
  })

  const refresh = useCallback(async () => {
    if (!enabled) return
    const res = await fetchMyHostel()
    if (res.ok) setState({ hostel: res.hostel, chatId: res.chatId, loading: false })
    else setState((prev) => ({ ...prev, loading: false }))
  }, [enabled])

  useEffect(() => {
    void refresh()
    const onChange = () => void refresh()
    window.addEventListener(HOSTEL_CHANGED, onChange)
    return () => window.removeEventListener(HOSTEL_CHANGED, onChange)
  }, [refresh])

  return { ...state, refresh }
}

function announceChange() {
  window.dispatchEvent(new Event(HOSTEL_CHANGED))
  void refreshChatUnread()
}

export async function joinAndAnnounce(hostelId: string) {
  const res = await joinHostel(hostelId)
  if (res.ok) announceChange()
  return res
}

/** "Add '<name>'": creates (or finds the existing match) and joins it. */
export async function addAndJoin(name: string) {
  const created = await createHostel(name)
  if (!created.ok) return created
  return joinAndAnnounce(created.hostel.id)
}

export async function leaveAndAnnounce() {
  const res = await leaveHostel()
  if (res.ok) announceChange()
  return res
}

const SEARCH_DEBOUNCE_MS = 300

/** Debounced hostel search; drops stale responses if the query changed meanwhile. */
export function useHostelSearch(query: string) {
  const [results, setResults] = useState<HostelSearchHit[]>([])
  const [exactMatch, setExactMatch] = useState(false)
  const [searching, setSearching] = useState(false)
  const latest = useRef('')

  useEffect(() => {
    const q = query.trim()
    latest.current = q
    if (q.length < 2) {
      setResults([])
      setExactMatch(false)
      setSearching(false)
      return
    }
    setSearching(true)
    const timer = window.setTimeout(async () => {
      const res = await searchHostels(q)
      if (latest.current !== q) return
      setSearching(false)
      if (res.ok) {
        setResults(res.results)
        setExactMatch(res.exactMatch)
      }
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [query])

  return { results, exactMatch, searching }
}
