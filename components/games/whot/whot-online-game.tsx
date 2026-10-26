'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchWhotTable, whotSocketUrl, whotTicket, type WhotClientState } from '@/lib/game/whot-api'
import { WhotBoard } from './whot-board'

type Props = {
  tableId: string
  potLabel: string
  onExit: () => void
  notify: (text: string, ok?: boolean) => void
}

export function WhotOnlineGame({ tableId, potLabel, onExit, notify }: Props) {
  const [state, setState] = useState<WhotClientState | null>(null)
  const socket = useRef<WebSocket | null>(null)

  const connect = useCallback(async () => {
    const res = await whotTicket(tableId)
    if (!res.ok) {
      notify(res.error, false)
      return
    }
    const ws = new WebSocket(whotSocketUrl(res.ticket))
    socket.current = ws
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data)) as { t: string; state?: WhotClientState; error?: string }
        if (msg.t === 'state' && msg.state) setState(msg.state)
        if (msg.t === 'error' && msg.error) notify(msg.error, false)
      } catch {
        /* ignore */
      }
    }
    ws.onclose = () => {
      if (socket.current === ws) socket.current = null
    }
  }, [notify, tableId])

  useEffect(() => {
    void connect()
    return () => socket.current?.close()
  }, [connect])

  useEffect(() => {
    if (state?.phase !== 'over') return
    void fetchWhotTable(tableId)
  }, [state?.phase, tableId])

  const send = (payload: object) => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(payload))
  }

  return (
    <WhotBoard
      state={state}
      subtitle={potLabel}
      onExit={onExit}
      onPlay={(cardIndex, shape) => send({ t: 'play', cardIndex, shape })}
      onPick={() => send({ t: 'pick' })}
      disabled={!socket.current}
    />
  )
}
