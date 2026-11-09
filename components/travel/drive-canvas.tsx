'use client'

import { ContextRestore } from '@/components/three/context-restore'
import { Canvas } from '@react-three/fiber'
import { ACESFilmicToneMapping, PCFShadowMap, PCFSoftShadowMap, SRGBColorSpace } from 'three'
import { GFX, useGfxTier } from '@/lib/game/gfx-quality'
import type { Appearance } from '@/lib/game/look'
import { DriveScene, type DriveMode, type DriveRoute, type DriveView } from './drive-scene'

/** The drive's own small WebGL canvas. Quality follows the graphics tier: shadows from medium up, MSAA and pixel ratio by tier. */
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
  const tier = useGfxTier()
  const gfx = GFX[tier]
  return (
    <Canvas
      // The tier decides MSAA (fixed at context creation), so a change remounts the canvas
      key={tier}
      dpr={gfx.dpr}
      shadows={tier === 'low' ? false : { type: tier === 'high' ? PCFSoftShadowMap : PCFShadowMap }}
      gl={{ antialias: gfx.antialias, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false }}
      camera={{ position: [5.6, 3.1, 8], fov: 58, near: 0.5, far: 320 }}
      onCreated={({ gl }) => {
        gl.toneMapping = ACESFilmicToneMapping
        gl.toneMappingExposure = 1
        gl.outputColorSpace = SRGBColorSpace
      }}
    >
      <ContextRestore />
      <DriveScene mode={mode} view={view} route={route} plannedMs={plannedMs} appearance={appearance} onShown={onShown} />
    </Canvas>
  )
}
