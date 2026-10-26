'use client'

import dynamic from 'next/dynamic'
import { useParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useGame } from '@/hooks/use-game'
import { endActivity, setActivityQueue, startActivity } from '@/lib/game/activity'
import { fetchHostCard, type HostCard } from '@/lib/game/hostels-api'
import { normalizeAppearance, type Appearance } from '@/lib/game/look'
import type { FurnitureAction, FurnitureId } from '@/lib/game/room-furniture'
import { resolvePaint } from '@/lib/game/house-paint'
import { layoutForLodging } from '@/lib/game/room-layouts'
import { roomLightAt } from '@/lib/game/room-lighting'
import { devPinnedMinute, watMinuteOfDay } from '@/lib/game/wat-clock'
import { FurnitureSheet } from './furniture-sheet'
import type { RoomPlayerControl } from './room-player'
import { VisitBanner } from './visit-banner'
import styles from './room.module.css'

const HomeCanvas = dynamic(
  () => import('./home-canvas').then((m) => m.HomeCanvas),
  {
    ssr: false,
    loading: () => <div className={styles.canvasStage} aria-hidden="true" />,
  },
)

export function RoomScreen() {
  const { state, act } = useGame()
  const [furniture, setFurniture] = useState<FurnitureId | null>(null)
  // The 3D character fills in control.use once it has mounted
  const control = useMemo<RoomPlayerControl>(() => ({}), [])
  const pick = useRoomActionQueue(control, (action) => void act(action.id, { atHome: true }))
  const [modelReady, setModelReady] = useState<'checking' | 'ok' | 'missing'>('checking')
  // /room/[username]: visiting someone else's place — their character is home too
  const params = useParams<{ username?: string }>()
  const visiting = params?.username ? decodeURIComponent(params.username) : null
  const isOwn = !visiting || (state?.username ?? '').toLowerCase() === visiting.toLowerCase()
  const [host, setHost] = useState<HostCard | null>(null)
  useEffect(() => {
    if (!visiting || isOwn) return
    let cancelled = false
    void fetchHostCard(visiting).then((res) => {
      if (!cancelled && res.ok) setHost(res.host)
    })
    return () => {
      cancelled = true
    }
  }, [visiting, isOwn])
  // Your own home, or the host's when visiting (their character shows once the card loads)
  const visitingOther = !!visiting && !isOwn
  const layout = layoutForLodging(visitingOther ? host?.lodgingId : state?.lodgingId)
  // Wall paint follows whoever lives here, so visitors see the owner's colour
  const ownerName = visitingOther ? host?.username : state?.username
  const paint = ownerName ? resolvePaint({ id: ownerName.toLowerCase() }).hex : undefined

  // Real WAT time of day, the same for everyone (dev: ?time=21:30 pins it)
  const [pinned, setPinned] = useState<number | null>(null)
  useEffect(() => setPinned(devPinnedMinute(window.location.search)), [])
  const clock = useCallback(() => pinned ?? watMinuteOfDay(), [pinned])
  // The sky tint behind the house only needs to move every few seconds
  const [sky, setSky] = useState(() => roomLightAt(12 * 60))
  useEffect(() => {
    const update = () => setSky(roomLightAt(clock()))
    update()
    const id = window.setInterval(update, 5000)
    return () => window.clearInterval(id)
  }, [clock, state?.gameTime])
  const hostLook = useMemo<Appearance | undefined>(
    () => (host ? normalizeAppearance(host.appearance as Partial<Appearance>) : undefined),
    [host],
  )

  useEffect(() => {
    let cancelled = false
    setModelReady('checking')
    void fetch(layout.glb, { method: 'HEAD' })
      .then((res) => {
        if (!cancelled) setModelReady(res.ok ? 'ok' : 'missing')
      })
      .catch(() => {
        if (!cancelled) setModelReady('missing')
      })
    return () => {
      cancelled = true
    }
  }, [layout.glb])

  return (
      <div className={styles.root} aria-label={visitingOther ? `${host?.username ?? visiting}'s ${layout.label.toLowerCase()}` : `Your ${layout.label.toLowerCase()}`}>
        <div className={styles.canvasStage}>
        {/* Morning / evening / night tint over the page background; clear at midday */}
        <div
          className={styles.sky}
          aria-hidden="true"
          style={{ background: `linear-gradient(180deg, ${sky.skyTop}, ${sky.skyBottom})`, opacity: sky.skyOpacity }}
        />
        {modelReady === 'ok' && (!visitingOther || host) ? (
          <HomeCanvas layout={layout} paint={paint} clock={clock} appearance={state?.appearance} host={hostLook} onFurniture={setFurniture} control={control} />
        ) : null}
        {modelReady === 'missing' ? (
          <p className={styles.missingModel} role="status">
            Add <code>{layout.glb.replace('/models/', '')}</code> to <code>public/models/</code> to see your room here.
          </p>
        ) : null}
        {modelReady === 'checking' ? (
          <p className={styles.missingModel} role="status" aria-live="polite">
            Loading room…
          </p>
        ) : null}
        </div>
        {visiting && !isOwn ? <VisitBanner username={host?.username ?? visiting} displayName={host?.displayName ?? null} /> : null}
        <FurnitureSheet
          furniture={furniture}
          onClose={() => setFurniture(null)}
          onPick={(id, action) => {
            setFurniture(null)
            pick(id, action)
          }}
        />
      </div>
  )
}

type Queued = { key: string; furniture: FurnitureId; action: FurnitureAction }
const MAX_QUEUED = 3

/**
 * Sims-style action queue for the room: pick something while busy and it lines up (up to 3) as a
 * dim tile; each runs when the one before finishes. The running action walks over, then the tile
 * fills and the server applies it at the end. ✕ on the running tile skips to the next one; ✕ on a
 * waiting tile drops it; walking off (tap the floor / arrow keys) stops everything.
 */
function useRoomActionQueue(control: RoomPlayerControl, run: (action: FurnitureAction) => void) {
  const queue = useRef<Queued[]>([])
  const busy = useRef(false)
  const skipped = useRef(false)

  const sync = useCallback(() => {
    setActivityQueue(
      queue.current.map((q) => ({
        key: q.key,
        emoji: q.action.emoji,
        title: q.action.title,
        onRemove: () => {
          queue.current = queue.current.filter((x) => x.key !== q.key)
          sync()
        },
      })),
    )
  }, [])

  const start = useRef<(item: Queued) => void>(() => undefined)
  const next = useCallback(() => {
    busy.current = false
    const item = queue.current.shift()
    sync()
    if (item) start.current(item)
  }, [sync])

  start.current = (item: Queued) => {
    busy.current = true
    const { action } = item
    control.use?.(item.furniture, action, {
      onStart: () =>
        startActivity({
          emoji: action.emoji,
          title: action.title,
          seconds: action.seconds,
          onCancel: () => {
            skipped.current = true
            control.stop?.()
          },
        }),
      onDone: () => {
        endActivity()
        run(action)
        next()
      },
      onAbort: () => {
        endActivity()
        if (skipped.current) {
          skipped.current = false
          next()
          return
        }
        // Walked away: drop everything lined up
        queue.current = []
        busy.current = false
        sync()
      },
    })
  }

  // Leaving the room clears the queue tiles
  useEffect(() => () => setActivityQueue([]), [])

  return useCallback(
    (furniture: FurnitureId, action: FurnitureAction) => {
      const item = { key: `${Date.now()}-${Math.random()}`, furniture, action }
      if (!busy.current) {
        start.current(item)
        return
      }
      if (queue.current.length >= MAX_QUEUED) return
      queue.current = [...queue.current, item]
      sync()
    },
    [sync],
  )
}
