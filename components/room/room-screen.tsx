'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'
import { useGame } from '@/hooks/use-game'
import type { FurnitureId } from '@/lib/game/room-furniture'
import { SELFCON_GLB_URL } from '@/lib/game/selfcon-model'
import { RoomCameraDebugPanel } from './room-camera-debug-panel'
import { RoomCameraDebugProvider } from './room-camera-debug-context'
import { FurnitureSheet } from './furniture-sheet'
import type { RoomPlayerControl } from './room-player'
import styles from './room.module.css'

const SelfconRoomCanvas = dynamic(
  () => import('./selfcon-room-canvas').then((m) => m.SelfconRoomCanvas),
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

  useEffect(() => {
    let cancelled = false
    void fetch(SELFCON_GLB_URL, { method: 'HEAD' })
      .then((res) => {
        if (!cancelled) setModelReady(res.ok ? 'ok' : 'missing')
      })
      .catch(() => {
        if (!cancelled) setModelReady('missing')
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <RoomCameraDebugProvider>
      <div className={styles.root} aria-label="Your selfcon">
        <div className={styles.canvasStage}>
        {modelReady === 'ok' ? <SelfconRoomCanvas appearance={state?.appearance} onFurniture={setFurniture} control={control} /> : null}
        {modelReady === 'missing' ? (
          <p className={styles.missingModel} role="status">
            Add <code>selfcon.glb</code> to <code>public/models/</code> to see your room here.
          </p>
        ) : null}
        {modelReady === 'checking' ? (
          <p className={styles.missingModel} role="status" aria-live="polite">
            Loading room…
          </p>
        ) : null}
        </div>
        <RoomCameraDebugPanel />
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
