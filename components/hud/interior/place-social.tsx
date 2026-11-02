'use client'

import { ChevronRight, MessageCircle, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useGame } from '@/hooks/use-game'
import type { useClubLive } from '@/lib/game/club-live'
import { openDirectChat } from '@/lib/game/hostels-api'
import { requestOpenChat } from '@/lib/game/open-chat'
import { bubbleFor, REACTIONS, SOCIALS, type SocialId } from '@/lib/game/quick-lines'
import { socialAtVenue } from '@/lib/game/venues-api'
import styles from './place-social.module.css'

/*
 * The social layer every interior shares (Lagos Life style): reactions everyone in your group
 * sees, bubbles over people's heads, and the card you get when you tap someone (an NPC or a
 * player): Say Hello, Gist, Crack Joke, Compliment, and Chat for players.
 */

type Live = ReturnType<typeof useClubLive>

/** Someone in the scene that isn't a real player. */
export type PlaceNpc = { id: string; name: string; role?: string; line: string }
/** A real player (from the live group or the "everyone here" list). */
export type PlacePlayer = { userId: string; username: string }

export type TalkTarget = { kind: 'npc'; npc: PlaceNpc } | { kind: 'player'; player: PlacePlayer }

const BUBBLE_MS = 4000

/** What an NPC says back to a social action [landed, flopped]. */
const NPC_REPLY: Record<SocialId, [string, string]> = {
  hello: ['Hi! Welcome 😊', 'Hi! Welcome 😊'],
  gist: ['Ehen! You hear wetin happen for Ekpoma today? 👀', 'Ehen! You hear wetin happen for Ekpoma today? 👀'],
  joke: ['😂😂 You no well!', '😐 Abeg rest'],
  compliment: ['Thank you o! 😍', 'Thank you o! 😍'],
}

/**
 * Bubbles, reactions and the talk card for one place. Bubbles are keyed by NPC id, player
 * userId, or 'me'. Lines from the others in your group show over their heads, with a toast when
 * they were aimed at you.
 */
export function usePlaceSocial(placeId: string, live: Live) {
  const { notifyToast, refreshServer } = useGame()
  const [bubbles, setBubbles] = useState<Record<string, string>>({})
  const [talk, setTalk] = useState<TalkTarget | null>(null)
  const [acting, setActing] = useState(false)
  const timers = useRef<Record<string, number>>({})

  const showBubble = useCallback((who: string, text: string) => {
    window.clearTimeout(timers.current[who])
    setBubbles((b) => ({ ...b, [who]: text }))
    timers.current[who] = window.setTimeout(() => {
      setBubbles((b) => {
        const next = { ...b }
        delete next[who]
        return next
      })
    }, BUBBLE_MS)
  }, [])
  useEffect(() => {
    const all = timers.current
    return () => Object.values(all).forEach((t) => window.clearTimeout(t))
  }, [])

  const seen = useRef(0)
  useEffect(() => {
    for (const s of live.said) {
      if (s.at <= seen.current) continue
      seen.current = s.at
      const from = live.peers.current.get(s.from)
      const text = bubbleFor(s.line)
      // My own come back too; I already show those over my head
      if (!text || !from) continue
      showBubble(s.from, text)
      if (s.to !== '*' && !live.peers.current.has(s.to)) notifyToast(`@${from.username}: ${text}`, true)
    }
  }, [live.said, live.peers, showBubble, notifyToast])

  const react = (id: string) => {
    const r = REACTIONS.find((x) => x.id === id)
    if (!r) return
    showBubble('me', `${r.emoji} ${r.label}`)
    live.say('*', id)
  }

  const social = async (kind: SocialId) => {
    if (!talk || acting) return
    const target = talk.kind === 'npc' ? `npc:${talk.npc.id}` : talk.player.userId
    const def = SOCIALS.find((s) => s.id === kind)!
    setActing(true)
    try {
      const res = await socialAtVenue(placeId, kind, target)
      if (!res.ok) {
        notifyToast(res.error, false)
        return
      }
      // Needs changed on the server: pull them so the HUD shows the gain
      void refreshServer()
      showBubble('me', kind === 'joke' && !res.landed ? '😂 …' : `${def.emoji} ${def.label}`)
      if (talk.kind === 'npc') {
        const npcId = talk.npc.id
        const reply = NPC_REPLY[kind][res.landed ? 0 : 1]
        window.setTimeout(() => showBubble(npcId, reply), 800)
      }
      notifyToast(kind === 'joke' && !res.landed ? 'The joke flopped 😬' : `${def.label} · ${def.gains}`, res.landed)
    } finally {
      setActing(false)
    }
  }

  const chat = async (player: PlacePlayer) => {
    const res = await openDirectChat(player.userId)
    if (!res.ok) {
      notifyToast(res.error ?? 'Could not open the chat', false)
      return
    }
    setTalk(null)
    requestOpenChat(res.chat)
  }

  /** Tap an NPC: they say their line and their card opens. */
  const talkToNpc = (npc: PlaceNpc) => {
    showBubble(npc.id, npc.line)
    setTalk({ kind: 'npc', npc })
  }

  const inGroup = (userId: string) => live.peers.current.has(userId)

  return { bubbles, showBubble, react, talk, setTalk, talkToNpc, social, chat, acting, inGroup }
}

export type PlaceSocial = ReturnType<typeof usePlaceSocial>

/** Wave · Laugh · Dance · Abeg · Hiss, seen by everyone in your group. */
export function PlaceReactions({ onReact }: { onReact: (id: string) => void }) {
  return (
    <div className={styles.reactions} role="group" aria-label="Reactions">
      {REACTIONS.map((r) => (
        <button key={r.id} type="button" className={styles.reaction} onClick={() => onReact(r.id)}>
          <span aria-hidden="true">{r.emoji}</span>
          {r.label}
        </button>
      ))}
    </div>
  )
}

/** The card for someone you tapped. Shows in place of the place sheet. */
export function PlaceTalkCard({ social, placeName, tone = 'light' }: { social: PlaceSocial; placeName: string; tone?: 'light' | 'night' }) {
  const { talk, setTalk, acting } = social
  if (!talk) return null
  const name = talk.kind === 'npc' ? talk.npc.name : `@${talk.player.username}`
  const sub =
    talk.kind === 'npc'
      ? (talk.npc.role ?? placeName)
      : social.inGroup(talk.player.userId)
        ? `Here at ${placeName} · in your group`
        : `Here at ${placeName} · hanging out`
  return (
    <div className={`${styles.card} ${tone === 'night' ? styles.night : ''}`} role="dialog" aria-label={name}>
      <div className={styles.head}>
        <span className={styles.avatar} aria-hidden="true">
          {talk.kind === 'npc' ? '🙂' : '🧑🏾'}
        </span>
        <div className={styles.text}>
          <strong>{name}</strong>
          <span>{sub}</span>
        </div>
        <button type="button" className={styles.close} aria-label="Close" onClick={() => setTalk(null)}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      {talk.kind === 'npc' ? <p className={styles.quote}>“{talk.npc.line}”</p> : null}
      {talk.kind === 'player' ? (
        <button type="button" className={styles.chat} onClick={() => void social.chat(talk.player)}>
          <MessageCircle size={18} aria-hidden="true" />
          Chat
        </button>
      ) : null}

      <ul className={styles.socials}>
        {SOCIALS.map((s) => (
          <li key={s.id}>
            <button type="button" className={styles.social} disabled={acting} onClick={() => void social.social(s.id)}>
              <span className={styles.socialEmoji} aria-hidden="true">
                {s.emoji}
              </span>
              <span className={styles.socialText}>
                <strong>{s.label}</strong>
                <small>{s.chance ? `${s.chance}% · ${s.gains}` : s.gains}</small>
              </span>
              <ChevronRight size={18} className={styles.chev} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
