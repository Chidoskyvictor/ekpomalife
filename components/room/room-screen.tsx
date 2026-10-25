'use client'

import dynamic from 'next/dynamic'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { useGame } from '@/hooks/use-game'
import { fetchHostCard, type HostCard } from '@/lib/game/hostels-api'
import { normalizeAppearance, type Appearance } from '@/lib/game/look'
import type { FurnitureId } from '@/lib/game/room-furniture'
import { layoutForLodging } from '@/lib/game/room-layouts'
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
        {modelReady === 'ok' && (!visitingOther || host) ? (
          <HomeCanvas layout={layout} appearance={state?.appearance} host={hostLook} onFurniture={setFurniture} control={control} />
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
