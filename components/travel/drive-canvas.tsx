'use client'

import { ContextRestore } from '@/components/three/context-restore'
import { Canvas } from '@react-three/fiber'
import type { Appearance } from '@/lib/game/look'
import { DriveScene, type DriveMode, type DriveRoute, type DriveView } from './drive-scene'

/** The drive's own small WebGL canvas (full device resolution and antialiasing, like the rest of the game). */
export function DriveCanvas({
  mode,
  view,
  route,
  plannedMs,
  appearance,
  onShown,
}: {
  mode: DriveMode
  view: DriveView
  route: DriveRoute
  plannedMs: number
  appearance?: Appearance
  onShown?: () => void
}) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      gl={{ antialias: true, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false }}
      camera={{ position: [5.6, 3.1, 8], fov: 58, near: 0.5, far: 320 }}
    >
      <ContextRestore />
      <DriveScene mode={mode} view={view} route={route} plannedMs={plannedMs} appearance={appearance} onShown={onShown} />
    </Canvas>
  )
}
