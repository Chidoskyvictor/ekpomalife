'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiPost } from '@/lib/api/client'
import type { FigurePose } from '@/components/look/character-figure'

/*
 * Live crowd in a club (backend/src/game/club-live.ts): the other players in your crowd
 * group, where they stand and what they're doing, plus money sprays raining on the group.
 */

export type PeerState = { x: number; y: number; z: number; h: number; pose: FigurePose; moving: boolean }

export type Peer = {
  userId: string
  username: string
  displayName: string
  appearance: unknown
  vip: boolean
  /** Latest position from the server; the scene glides toward it. */
  state: PeerState | null
}

export type SprayNote = { note: number; value: number }

export type Spray = {
  id: string
  by: string
  byUsername: string
  amount: number
  notes: SprayNote[]
  endsAt: number
  /** Notes already gone (picked by anyone, or missed). */
  gone: Set<number>
  mine: boolean
}

type Incoming =
  | { t: 'snapshot'; group: number; players: Peer[] }
  | { t: 'join'; player: Peer }
  | { t: 'leave'; userId: string }
  | ({ t: 'state'; userId: string } & PeerState)
  | ({ t: 'spray' } & Omit<Spray, 'gone' | 'mine'>)
  | { t: 'picked'; sprayId: string; note: number; by: string }
  | { t: 'got'; sprayId: string; note: number; value: number; cash: number }
  | { t: 'missed'; sprayId: string; note: number }
  | { t: 'error'; error: string }

/** ws(s)://<api>/ws/club. A local API address is swapped for this page's host so phones on the same Wi-Fi work. */
function socketUrl(ticket: string) {
  let base = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000').replace(/\/$/, '')
  const local = /\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(base)
  if (local && !['localhost', '127.0.0.1'].includes(window.location.hostname) && !window.location.hostname.endsWith('.localhost')) {
    base = base.replace(/\/\/(127\.0\.0\.1|localhost)/, `//${window.location.hostname}`)
  }
  return `${base.replace(/^http/, 'ws')}/ws/club?ticket=${encodeURIComponent(ticket)}`
}

export function useClubLive(venueId: string, enabled: boolean, myUsername?: string | null) {
  const peers = useRef(new Map<string, Peer>())
  /** Bumps when someone joins or leaves (positions change without re-rendering). */
  const [roster, setRoster] = useState(0)
  const [sprays, setSprays] = useState<Spray[]>([])
  const [lastGot, setLastGot] = useState<{ value: number; at: number } | null>(null)
  const [connected, setConnected] = useState(false)
  const socket = useRef<WebSocket | null>(null)
  const lastSent = useRef<{ at: number; key: string }>({ at: 0, key: '' })

  useEffect(() => {
    if (!enabled) return
    let stopped = false
    let retry = 0
    let timer: number | undefined

    const connect = async () => {
      const res = await apiPost<{ ok: true; ticket: string; group: number }>(
        `/venues/${encodeURIComponent(venueId)}/live-ticket`,
        {},
      )
      if (stopped) return
      if (!res.ok) {
        timer = window.setTimeout(connect, Math.min(15_000, 2000 * ++retry))
        return
      }
      const ws = new WebSocket(socketUrl(res.ticket))
      socket.current = ws
      ws.onopen = () => {
        retry = 0
        setConnected(true)
      }
      ws.onmessage = (event) => {
        let msg: Incoming
        try {
          msg = JSON.parse(String(event.data)) as Incoming
        } catch {
          return
        }
        if (msg.t === 'snapshot') {
          peers.current = new Map(msg.players.filter((p) => p.username !== myUsername).map((p) => [p.userId, p]))
          setRoster((n) => n + 1)
        } else if (msg.t === 'join') {
          if (msg.player.username === myUsername) return
          peers.current.set(msg.player.userId, msg.player)
          setRoster((n) => n + 1)
        } else if (msg.t === 'leave') {
          peers.current.delete(msg.userId)
          setRoster((n) => n + 1)
        } else if (msg.t === 'state') {
          const peer = peers.current.get(msg.userId)
          if (peer) peer.state = { x: msg.x, y: msg.y ?? 0, z: msg.z, h: msg.h, pose: msg.pose, moving: msg.moving }
        } else if (msg.t === 'spray') {
          const { t: _t, ...spray } = msg
          setSprays((list) =>
            list.some((s) => s.id === spray.id)
              ? list
              : [...list, { ...spray, gone: new Set(), mine: !!myUsername && spray.byUsername === myUsername }],
          )
        } else if (msg.t === 'picked' || msg.t === 'missed' || msg.t === 'got') {
          setSprays((list) =>
            list.map((s) => (s.id === msg.sprayId ? { ...s, gone: new Set(s.gone).add(msg.note) } : s)),
          )
          if (msg.t === 'got') setLastGot({ value: msg.value, at: Date.now() })
        }
      }
      ws.onclose = () => {
        setConnected(false)
        if (socket.current === ws) socket.current = null
        peers.current.clear()
        setRoster((n) => n + 1)
        if (!stopped) timer = window.setTimeout(connect, Math.min(15_000, 1500 * ++retry))
      }
    }
    void connect()
    return () => {
      stopped = true
      window.clearTimeout(timer)
      socket.current?.close()
      socket.current = null
      setConnected(false)
    }
  }, [enabled, venueId, myUsername])

  // Clear sprays once their notes stop falling
  useEffect(() => {
    if (!sprays.length) return
    const next = Math.min(...sprays.map((s) => s.endsAt)) - Date.now()
    const id = window.setTimeout(() => setSprays((list) => list.filter((s) => s.endsAt > Date.now())), Math.max(250, next + 400))
    return () => window.clearTimeout(id)
  }, [sprays])

  /** Where I am (called every frame; sent ~6 times a second, and only when something changed). */
  const sendState = useCallback((state: PeerState) => {
    const ws = socket.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    const now = performance.now()
    const key = `${state.x.toFixed(2)},${state.y.toFixed(2)},${state.z.toFixed(2)},${state.h.toFixed(2)},${state.pose},${state.moving}`
    if (key === lastSent.current.key && now - lastSent.current.at < 2000) return
    if (now - lastSent.current.at < 160) return
    lastSent.current = { at: now, key }
    ws.send(JSON.stringify({ t: 'state', ...state }))
  }, [])

  const pick = useCallback((sprayId: string, note: number) => {
    const ws = socket.current
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'pick', sprayId, note }))
  }, [])

  /** My own spray: show it raining for me too (I can't pick my own notes). */
  const addOwnSpray = useCallback((spray: Omit<Spray, 'gone' | 'mine'>) => {
    setSprays((list) => (list.some((s) => s.id === spray.id) ? list : [...list, { ...spray, gone: new Set(), mine: true }]))
  }, [])

  return { peers, roster, sprays, lastGot, connected, sendState, pick, addOwnSpray }
}
