'use client'

import { Bounds, OrbitControls, useBounds } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense, useEffect } from 'react'
import { CharacterFigure } from '@/components/look/character-figure'
import { DEFAULT_APPEARANCE, normalizeAppearance, type Appearance } from '@/lib/game/look'
import styles from './profile-sheet.module.css'

/** Hair and clothes stream in after the body, so fit the camera again once they have. */
function RefitWhenLoaded() {
  const bounds = useBounds()
  useEffect(() => {
    const timers = [150, 700, 1600].map((ms) => window.setTimeout(() => bounds.refresh().clip().fit(), ms))
    return () => timers.forEach((t) => window.clearTimeout(t))
  }, [bounds])
  return null
}

/** The player's look on a soft stage — drag to spin (no zoom/pan). Mounted only while visible. */
export function CharacterSpinner({ appearance }: { appearance?: Appearance }) {
  const look = normalizeAppearance(appearance ?? DEFAULT_APPEARANCE)
  return (
    <div className={styles.stage}>
      <Canvas dpr={[1, 1.75]} camera={{ fov: 30, position: [0, 1.2, 4] }} gl={{ alpha: true, antialias: true }}>
        <ambientLight intensity={0.9} />
        <directionalLight position={[2, 4, 3]} intensity={1.3} />
        <directionalLight position={[-3, 2, -2]} intensity={0.35} />
        <Suspense fallback={null}>
          <Bounds fit clip observe margin={1.15}>
            <CharacterFigure appearance={look} />
            <RefitWhenLoaded />
          </Bounds>
        </Suspense>
        <OrbitControls
          makeDefault
          enableZoom={false}
          enablePan={false}
          minPolarAngle={Math.PI / 2.15}
          maxPolarAngle={Math.PI / 2.15}
          rotateSpeed={0.8}
        />
      </Canvas>
      <span className={styles.stageFloor} aria-hidden="true" />
      <span className={styles.stageHint}>Drag to spin</span>
    </div>
  )
}
