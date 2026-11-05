'use client'

import { Canvas } from '@react-three/fiber'
import { Suspense, useEffect, useSyncExternalStore } from 'react'
import { PortraitCapture } from '@/components/hud/avatar-portrait'
import { faceDrawn, nextFace, subscribeFaces } from '@/lib/game/face-cache'

const PX = 128

/** The one hidden canvas that draws players' faces, one look at a time (see face-cache.ts). */
export function FaceRenderer() {
  const job = useSyncExternalStore(subscribeFaces, nextFace, () => null)
  // A look that never finishes (bad model) is given up on after a while, so the queue keeps moving
  useEffect(() => {
    if (!job) return
    const id = window.setTimeout(() => faceDrawn(job.key, null), 15_000)
    return () => window.clearTimeout(id)
  }, [job])
  if (!job) return null
  return (
    <div style={{ position: 'fixed', left: -10_000, top: 0, width: PX, height: PX, pointerEvents: 'none' }} aria-hidden="true">
      <Canvas key={job.key} dpr={1} gl={{ preserveDrawingBuffer: true, alpha: true, antialias: true }} camera={{ fov: 30, position: [0, 1.5, 3] }} style={{ width: PX, height: PX }}>
        <ambientLight intensity={0.9} />
        <directionalLight position={[2, 4, 3]} intensity={1.4} />
        <directionalLight position={[-3, 2, -2]} intensity={0.4} />
        <Suspense fallback={null}>
          <PortraitCapture appearance={job.look} onShot={(url) => faceDrawn(job.key, url)} />
        </Suspense>
      </Canvas>
    </div>
  )
}
