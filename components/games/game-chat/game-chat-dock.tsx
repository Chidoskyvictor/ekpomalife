'use client'

import dynamic from 'next/dynamic'
import { Flag, MessageCircle, Mic, Send, VolumeX, Volume2, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { BodyPortal } from '@/components/ui/body-portal'
import { apiSocketUrl } from '@/lib/game/games-api'
import { gameChatTicket, gameChatVoice, type GameChatLine, type GameChatTarget } from '@/lib/game/game-chat-api'
import styles from './game-chat.module.css'

const GameChatVoice = dynamic(() => import('./game-chat-voice'), { ssr: false })

const MAX = 200
const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

/**
 * A small chat bubble (and a mic when voice is set up) floating over a live game. Messages and
 * voice are only for the players seated at that match/table. Free text is filtered by the server.
 */
export function GameChatDock({ target }: { target: GameChatTarget }) {
  const { kind, id } = target
  const [open, setOpen] = useState(false)
  const [lines, setLines] = useState<GameChatLine[]>([])
  const [unread, setUnread] = useState(0)
  const [muted, setMuted] = useState<Set<number>>(() => new Set())
  const [reported, setReported] = useState<Set<number>>(() => new Set())
  const [text, setText] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [mySeat, setMySeat] = useState(-1)
  const [voiceSeat, setVoiceSeat] = useState<{ url: string; token: string } | null>(null)
  const [voiceOn, setVoiceOn] = useState(false)
  const [voiceBusy, setVoiceBusy] = useState(false)
  const socket = useRef<WebSocket | null>(null)
  const openRef = useRef(false)
  const mutedRef = useRef(muted)
  const list = useRef<HTMLDivElement>(null)
  openRef.current = open
  mutedRef.current = muted

  // Socket with a fresh ticket each time; reconnects while the dock is on screen
  useEffect(() => {
    let closed = false
    let retry: ReturnType<typeof setTimeout> | undefined
    const connect = async () => {
      const res = await gameChatTicket({ kind, id })
      if (closed) return
      if (!res.ok) {
        retry = setTimeout(connect, 8000)
        return
      }
      setMySeat(res.seat)
      // Voice only on tap (LiveKit bills every connected minute): just remember it's available here
      setVoiceOn(Boolean(res.voice))
      const ws = new WebSocket(apiSocketUrl(`/ws/game-chat?ticket=${encodeURIComponent(res.ticket)}`))
      socket.current = ws
      ws.onmessage = (event) => {
        let m: { t: string; history?: GameChatLine[]; line?: GameChatLine; error?: string; id?: number }
        try {
          m = JSON.parse(String(event.data))
        } catch {
          return
        }
        if (m.t === 'hello') setLines(m.history ?? [])
        else if (m.t === 'msg' && m.line) {
          const line = m.line
          setLines((prev) => [...prev.slice(-59), line])
          if (!openRef.current && line.seat !== res.seat && !mutedRef.current.has(line.seat)) setUnread((n) => n + 1)
        } else if (m.t === 'error' && m.error) setNote(m.error)
        else if (m.t === 'reported' && typeof m.id === 'number') {
          const reportedId = m.id
          setReported((s) => new Set(s).add(reportedId))
          setNote('Reported. Thanks.')
        }
      }
      ws.onclose = () => {
        if (socket.current === ws) socket.current = null
        if (!closed) retry = setTimeout(connect, 3000)
      }
    }
    void connect()
    return () => {
      closed = true
      if (retry) clearTimeout(retry)
      socket.current?.close()
      socket.current = null
    }
  }, [kind, id])

  useEffect(() => {
    if (open) {
      setUnread(0)
      list.current?.scrollTo({ top: list.current.scrollHeight })
    }
  }, [open, lines])

  useEffect(() => {
    if (!note) return
    const t = setTimeout(() => setNote(null), 3000)
    return () => clearTimeout(t)
  }, [note])

  const send = useCallback(() => {
    const body = text.trim()
    if (!body || socket.current?.readyState !== WebSocket.OPEN) return
    socket.current.send(JSON.stringify({ t: 'say', text: body }))
    setText('')
  }, [text])

  const toggleMute = (seat: number) =>
    setMuted((s) => {
      const next = new Set(s)
      if (next.has(seat)) next.delete(seat)
      else next.add(seat)
      return next
    })

  const shown = lines.filter((l) => l.seat === mySeat || !muted.has(l.seat))
  const others = [...new Map(lines.filter((l) => l.seat !== mySeat).map((l) => [l.seat, l.name])).entries()]

  return (
    <BodyPortal>
      <div className={styles.dock}>
        {voiceSeat ? (
          <GameChatVoice
            url={voiceSeat.url}
            token={voiceSeat.token}
            onError={setNote}
            onLeave={(text) => {
              setVoiceSeat(null)
              if (text) setNote(text)
            }}
          />
        ) : voiceOn ? (
          <button
            type="button"
            className={styles.fab}
            aria-label="Join voice"
            disabled={voiceBusy}
            onClick={async () => {
              setVoiceBusy(true)
              const v = await gameChatVoice({ kind, id })
              setVoiceBusy(false)
              if (v.ok) setVoiceSeat({ url: v.url, token: v.token })
              else setNote(v.error ?? 'Couldn’t join the voice.')
            }}
          >
            <Mic size={20} aria-hidden="true" />
          </button>
        ) : null}
        <button type="button" className={styles.fab} aria-label={open ? 'Close chat' : 'Open chat'} onClick={() => setOpen((o) => !o)}>
          <MessageCircle size={20} aria-hidden="true" />
          {unread > 0 && !open ? <span className={styles.badge}>{unread > 9 ? '9+' : unread}</span> : null}
        </button>
      </div>
      {open ? (
        <section className={styles.panel} aria-label="Game chat">
          <header className={styles.head}>
            <strong>Chat</strong>
            <span className={styles.hint}>Only players here</span>
            <button type="button" className={styles.icon} aria-label="Close chat" onClick={() => setOpen(false)}>
              <X size={18} aria-hidden="true" />
            </button>
          </header>
          {others.length ? (
            <div className={styles.mutes}>
              {others.map(([seat, name]) => (
                <button key={seat} type="button" className={`${styles.chip} ${muted.has(seat) ? styles.chipOff : ''}`} onClick={() => toggleMute(seat)} aria-pressed={muted.has(seat)}>
                  {muted.has(seat) ? <VolumeX size={14} aria-hidden="true" /> : <Volume2 size={14} aria-hidden="true" />}
                  <span>{muted.has(seat) ? `Unmute ${name}` : `Mute ${name}`}</span>
                </button>
              ))}
            </div>
          ) : null}
          <div className={styles.list} ref={list}>
            {shown.length === 0 ? <p className={styles.empty}>Say hi 👋</p> : null}
            {shown.map((l) => (
              <div key={l.id} className={`${styles.line} ${l.seat === mySeat ? styles.mine : ''}`}>
                <div className={styles.meta}>
                  <span className={styles.name}>{l.seat === mySeat ? 'You' : l.name}</span>
                  <span>{time(l.at)}</span>
                  {l.seat !== mySeat && !reported.has(l.id) ? (
                    <button type="button" className={styles.report} aria-label={`Report ${l.name}'s message`} onClick={() => socket.current?.send(JSON.stringify({ t: 'report', id: l.id }))}>
                      <Flag size={13} aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
                <p className={styles.text}>{l.text}</p>
              </div>
            ))}
          </div>
          {note ? <p className={styles.note} role="status">{note}</p> : null}
          <form
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault()
              send()
            }}
          >
            <input className={styles.input} value={text} maxLength={MAX} placeholder="Type a message" aria-label="Message" enterKeyHint="send" onChange={(e) => setText(e.target.value)} />
            <button type="submit" className={styles.send} aria-label="Send" disabled={!text.trim()}>
              <Send size={18} aria-hidden="true" />
            </button>
          </form>
        </section>
      ) : null}
    </BodyPortal>
  )
}
