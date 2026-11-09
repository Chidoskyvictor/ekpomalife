'use client'

import { Camera, Flag, MessageCircle, PartyPopper, ShieldOff, Smile, Users, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { hapticTap } from '@/components/hud/haptic'
import { BodyPortal } from '@/components/ui/body-portal'
import { useGame } from '@/hooks/use-game'
import { runTimed } from '@/lib/game/activity'
import type { Peer, useClubLive } from '@/lib/game/club-live'
import { openDirectChat } from '@/lib/game/hostels-api'
import {
  fetchRelation,
  interact,
  interactionById,
  INTERACTIONS,
  LEVEL_LABEL,
  lockedReason,
  reportPlayer,
  respondToAsk,
  setBlock,
  setPartner,
  type Relation,
} from '@/lib/game/interactions'
import { PlayerFace } from '@/components/look/player-face'
import { requestOpenChat } from '@/lib/game/open-chat'
import { bubbleFor } from '@/lib/game/quick-lines'
import { BaeRow } from './bae-row'
import type { RoomPlayerControl } from './room-player'
import styles from './people-panel.module.css'

type Live = ReturnType<typeof useClubLive>
const BUBBLE_MS = 4000

/**
 * Other players in this home: bubbles over their heads, the thing they just did to you, and the
 * state for the sheet (who is selected). Both characters show an interaction: a bubble over each,
 * and a hop (dance pose) for the lively ones. Asks (hug / romantic) wait for your answer.
 */
export function useHomePeople(live: Live, control: RoomPlayerControl, homeOwner: string | null, myUsername: string | null = null) {
  const { notifyToast, refreshServer } = useGame()
  const [bubbles, setBubbles] = useState<Record<string, string>>({})
  const [target, setTarget] = useState<Peer | null>(null)
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

  /** My own character: emoji bubble + HUD tile for a few seconds (and a hop). */
  const showMine = useCallback(
    (emoji: string, title: string, lively: boolean) => {
      if (lively) control.pose?.('dance')
      // Only the hop is cleared afterwards: a paired pose (hug...) ends on its own timer
      void runTimed({ emoji, title, seconds: 4 }, () => {}).then(() => {
        if (lively) control.pose?.(null)
      })
    },
    [control],
  )

  // Lines (reactions) from others
  const seenSaid = useRef(0)
  useEffect(() => {
    for (const s of live.said) {
      if (s.at <= seenSaid.current) continue
      seenSaid.current = s.at
      const text = bubbleFor(s.line)
      if (text && live.peers.current.has(s.from)) showBubble(s.from, text)
    }
  }, [live.said, live.peers, showBubble])

  // Interactions that played: both characters show it
  const seenAct = useRef(0)
  useEffect(() => {
    for (const a of live.acts) {
      if (a.at <= seenAct.current) continue
      seenAct.current = a.at
      const def = interactionById(a.action)
      if (!def) continue
      const fromPeer = live.peers.current.has(a.from)
      const toPeer = live.peers.current.has(a.to)
      const line = a.landed ? def.bubble : '😬 ...flopped'
      if (fromPeer) showBubble(a.from, line)
      else showMine(def.emoji, def.label, a.landed && !!def.lively)
      if (toPeer) showBubble(a.to, a.landed ? def.emoji : '😐')
      else if (fromPeer) {
        showMine(def.emoji, def.label, a.landed && !!def.lively)
        notifyToast(`@${a.fromUsername}: ${def.label}`, true)
      }
      void refreshServer()
    }
  }, [live.acts, live.peers, showBubble, showMine, notifyToast, refreshServer])

  // Accepted hug / kiss / cuddle / hold hands / slow dance: my character walks to its spot next to theirs
  // and holds the matching pose; theirs does the same on their phone, and everyone else sees both via the live poses
  const seenPair = useRef(0)
  useEffect(() => {
    for (const p of live.pairs) {
      if (p.at <= seenPair.current) continue
      seenPair.current = p.at
      const me = (myUsername ?? '').toLowerCase()
      const spot = p.spots ? Object.entries(p.spots).find(([name]) => name.toLowerCase() === me)?.[1] : undefined
      if (spot) control.goPair?.(spot, p.seconds)
    }
  }, [live.pairs, control, myUsername])

  const lastDeclined = useRef(0)
  useEffect(() => {
    if (live.declined && live.declined.at > lastDeclined.current) {
      lastDeclined.current = live.declined.at
      notifyToast('They said not now. No worries.', false)
    }
  }, [live.declined, notifyToast])

  return { bubbles, target, setTarget, showBubble, showMine, homeOwner }
}

export type HomePeople = ReturnType<typeof useHomePeople>

/** The bar at the bottom while someone else is in the room (Together · Dance · Socialise · Message). */
export function PeopleBar({ live, people, onOpen }: { live: Live; people: HomePeople; onOpen: (peer: Peer) => void }) {
  const { notifyToast } = useGame()
  const first = [...live.peers.current.values()][0]
  void live.roster
  if (!first) return null
  const quick = async (action: string) => {
    hapticTap()
    if (!people.homeOwner) return
    const res = await interact(first.username, people.homeOwner, action)
    if (!res.ok) notifyToast(res.error, false)
  }
  const message = async () => {
    const res = await openDirectChat(first.userId)
    if (res.ok) requestOpenChat(res.chat)
  }
  return (
    <div className={styles.bar} role="toolbar" aria-label={`With @${first.username}`}>
      <button type="button" className={styles.barBtn} onClick={() => void quick('together')}>
        <Camera size={18} aria-hidden="true" />
        <span>Together</span>
      </button>
      <button
        type="button"
        className={styles.barBtn}
        onClick={() => {
          people.showMine('💃🏾', 'Dance', true)
          live.say('*', 'dance')
        }}
      >
        <PartyPopper size={18} aria-hidden="true" />
        <span>Dance</span>
      </button>
      <button type="button" className={`${styles.barBtn} ${styles.barMain}`} onClick={() => onOpen(first)}>
        <Users size={18} aria-hidden="true" />
        <span>Socialise</span>
      </button>
      <button type="button" className={styles.barBtn} onClick={() => void message()}>
        <MessageCircle size={18} aria-hidden="true" />
        <span>Message</span>
      </button>
    </div>
  )
}

/** "@x wants to hug you": nothing plays until you accept. */
export function AskPrompt({ live }: { live: Live }) {
  const ask = live.asks[0]
  const [, tick] = useState(0)
  useEffect(() => {
    if (!ask) return
    const id = window.setInterval(() => {
      tick((n) => n + 1)
      if (Date.now() > ask.until) live.dismissAsk(ask.id)
    }, 1000)
    return () => window.clearInterval(id)
  }, [ask, live])
  if (!ask) return null
  const def = interactionById(ask.action)
  const answer = async (accept: boolean) => {
    live.dismissAsk(ask.id)
    await respondToAsk(ask.id, accept)
  }
  return (
    <BodyPortal>
      <div className={styles.ask} role="alertdialog" aria-label="Someone wants to interact">
        <span className={styles.askEmoji} aria-hidden="true">
          {def?.emoji ?? '🤗'}
        </span>
        <span className={styles.askText}>
          <strong>@{ask.fromUsername}</strong>
          <span>wants to {def ? def.label.toLowerCase() : 'interact'} with you</span>
        </span>
        <button type="button" className={styles.no} onClick={() => void answer(false)}>
          Not now
        </button>
        <button type="button" className={styles.yes} onClick={() => void answer(true)}>
          Accept
        </button>
      </div>
    </BodyPortal>
  )
}

/** The sheet for one other player: their avatar, how close you are, what you can do, and safety. */
export function PersonSheet({ peer, homeOwner, onClose, people }: { peer: Peer | null; homeOwner: string; onClose: () => void; people: HomePeople }) {
  const { notifyToast } = useGame()
  const [rel, setRel] = useState<Relation | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<'report' | 'block' | null>(null)
  const username = peer?.username

  useEffect(() => {
    if (!username) return
    setRel(null)
    setConfirm(null)
    let cancelled = false
    void fetchRelation(username).then((r) => {
      if (!cancelled && r.ok) setRel(r.relation)
    })
    return () => {
      cancelled = true
    }
  }, [username])

  if (!peer) return null
  const isHost = peer.username.toLowerCase() === homeOwner.toLowerCase()
  const blocked = rel?.blockedByYou ?? false

  const run = async (id: string) => {
    if (busy || blocked) return
    const def = interactionById(id)!
    setBusy(true)
    onClose()
    const res = await interact(peer.username, homeOwner, id)
    setBusy(false)
    if (!res.ok) {
      notifyToast(res.error, false)
      return
    }
    if (res.pending) notifyToast(`Asked @${peer.username}. Waiting for their answer...`, true)
    else if (res.landed === false) notifyToast(`${def.label} flopped 😬`, false)
  }

  const partner = async () => {
    const res = await setPartner(peer.username, !(rel?.partnerYou ?? false))
    if (res.ok) {
      setRel(res.relation)
      notifyToast(res.relation.partnerYou ? 'Marked. They are never told unless they do the same.' : 'Removed.', true)
    } else notifyToast(res.error, false)
  }
  const block = async () => {
    const res = await setBlock(peer.username, !blocked)
    if (res.ok) {
      setRel(res.relation)
      setConfirm(null)
      if (res.relation.blockedByYou) onClose()
    } else notifyToast(res.error, false)
  }
  const report = async () => {
    const res = await reportPlayer(peer.username, 'reported from home sheet')
    setConfirm(null)
    notifyToast(res.ok ? 'Reported. Thanks for telling us.' : res.error, res.ok)
  }

  return (
    <BodyPortal>
      <div className={styles.backdrop} onClick={onClose} role="presentation">
        <section className={styles.sheet} role="dialog" aria-label={`@${peer.username}`} onClick={(e) => e.stopPropagation()}>
          <span className={styles.handle} aria-hidden="true" />
          <header className={styles.head}>
            <span className={styles.avatar}>
              <PlayerFace look={peer.appearance} color="#2f7cf6" label={peer.username} size={56} className={styles.face} />
            </span>
            <span className={styles.titles}>
              <strong>@{peer.username}</strong>
              <span>
                Real player{isHost ? ' · your host' : ''} · {rel ? LEVEL_LABEL[rel.level] : '...'}
              </span>
            </span>
            <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
              <X size={18} aria-hidden="true" />
            </button>
          </header>
          {blocked ? null : <BaeRow username={peer.username} />}
          <div className={styles.grid}>
            {blocked ? (
              <p className={styles.note}>You blocked @{peer.username}. Unblock below to interact again.</p>
            ) : (
              INTERACTIONS.filter((i) => !(i.visitorOnly && !isHost)).map((i) => {
                const lock = lockedReason(i, rel)
                return (
                  <button key={i.id} type="button" className={styles.card} disabled={!!lock || busy} onClick={() => void run(i.id)}>
                    <span className={styles.emoji} aria-hidden="true">
                      {i.emoji}
                    </span>
                    <span className={styles.cardTitle}>{i.label}</span>
                    <span className={styles.chips}>
                      {lock ? (
                        <span className={`${styles.chip} ${styles.lock}`}>{lock}</span>
                      ) : (
                        <>
                          {i.chance ? <span className={`${styles.chip} ${styles.risk}`}>{i.chance}%</span> : null}
                          {i.gains.map((g) => (
                            <span key={g} className={styles.chip}>
                              {g}
                            </span>
                          ))}
                          {i.tier !== 'friendly' ? <span className={`${styles.chip} ${styles.ask2}`}>asks first</span> : null}
                        </>
                      )}
                    </span>
                  </button>
                )
              })
            )}
          </div>
          <footer className={styles.safety}>
            <button type="button" className={`${styles.safeBtn} ${rel?.partnerYou ? styles.on : ''}`} onClick={() => void partner()} disabled={blocked}>
              <Smile size={16} aria-hidden="true" /> {rel?.partnerYou ? 'Open to partner ✓' : 'Open to partner'}
            </button>
            {confirm === 'block' ? (
              <button type="button" className={`${styles.safeBtn} ${styles.danger}`} onClick={() => void block()}>
                <ShieldOff size={16} aria-hidden="true" /> {blocked ? 'Unblock?' : 'Block for sure?'}
              </button>
            ) : (
              <button type="button" className={styles.safeBtn} onClick={() => (blocked ? void block() : setConfirm('block'))}>
                <ShieldOff size={16} aria-hidden="true" /> {blocked ? 'Unblock' : 'Block'}
              </button>
            )}
            {confirm === 'report' ? (
              <button type="button" className={`${styles.safeBtn} ${styles.danger}`} onClick={() => void report()}>
                <Flag size={16} aria-hidden="true" /> Report for sure?
              </button>
            ) : (
              <button type="button" className={styles.safeBtn} onClick={() => setConfirm('report')}>
                <Flag size={16} aria-hidden="true" /> Report
              </button>
            )}
          </footer>
        </section>
      </div>
    </BodyPortal>
  )
}
