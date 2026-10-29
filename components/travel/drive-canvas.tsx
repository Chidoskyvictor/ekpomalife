'use client'

import { Canvas } from '@react-three/fiber'
import { DriveScene, type DriveMode, type DriveRoute, type DriveView } from './drive-scene'

/** The drive's own small WebGL canvas: no shadows, no antialiasing, capped resolution. */
export function DriveCanvas({ mode, view, route, plannedMs }: { mode: DriveMode; view: DriveView; route: DriveRoute; plannedMs: number }) {
  const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
  return (
    <Canvas
      dpr={coarse ? 1 : [1, 1.5]}
      gl={{ antialias: false, powerPreference: 'low-power', failIfMajorPerformanceCaveat: false }}
      camera={{ position: [5.6, 3.1, 8], fov: 58, near: 0.5, far: 320 }}
    >
      <DriveScene mode={mode} view={view} route={route} plannedMs={plannedMs} />
    </Canvas>
  )
}
