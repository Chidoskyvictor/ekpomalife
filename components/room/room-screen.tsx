'use client'

import dynamic from 'next/dynamic'
import { useParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useGame } from '@/hooks/use-game'
import { fetchHostCard, type HostCard } from '@/lib/game/hostels-api'
import { normalizeAppearance, type Appearance } from '@/lib/game/look'
import type { FurnitureId } from '@/lib/game/room-furniture'
import { resolvePaint } from '@/lib/game/house-paint'
import { layoutForLodging } from '@/lib/game/room-layouts'
import { GAME_MINUTES_PER_MS, pinnedRoomTime, roomLightAt } from '@/lib/game/room-lighting'
import { RoomCameraDebugPanel } from './room-camera-debug-panel'
import { RoomCameraDebugProvider } from './room-camera-debug-context'
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

  // Game clock between server refreshes: last known time + real time since (10 game min / real min)
  const clockBase = useRef({ gameTime: 12 * 60, at: 0 })
  const [pinned, setPinned] = useState<number | null>(null)
  useEffect(() => setPinned(pinnedRoomTime(window.location.search)), [])
  useEffect(() => {
    if (state?.gameTime != null) clockBase.current = { gameTime: state.gameTime, at: performance.now() }
  }, [state?.gameTime])
  const clock = useCallback(() => {
    if (pinned != null) return pinned
    const { gameTime, at } = clockBase.current
    return at ? gameTime + (performance.now() - at) * GAME_MINUTES_PER_MS : gameTime
  }, [pinned])
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
    <RoomCameraDebugProvider>
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
        <RoomCameraDebugPanel />
        {visiting && !isOwn ? <VisitBanner username={host?.username ?? visiting} displayName={host?.displayName ?? null} /> : null}
        <FurnitureSheet
          furniture={furniture}
          onClose={() => setFurniture(null)}
          onPick={(id, action) => {
            setFurniture(null)
            // Walk over, then the server applies the action once the character starts using it
            control.use?.(id, action, () => void act(action.id, { atHome: true }))
          }}
        />
      </div>
    </RoomCameraDebugProvider>
  )
}
