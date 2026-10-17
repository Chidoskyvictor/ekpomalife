'use client'

import { ContactShadows, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { Suspense, useEffect, useState } from 'react'
import { CharacterFigure } from '@/components/look/character-figure'
import { StepDots } from '@/components/create/step-dots'
import { StageErrorBoundary } from '@/components/create/stage-error-boundary'
import type { Appearance } from '@/lib/game/look'
import lookStyles from '@/components/look/look-studio.module.css'
import styles from './create-stage.module.css'

export function CreateStage({
  title,
  step,
  backHref,
  appearance,
}: {
  title: string
  step: 1 | 2 | 3 | 4
  backHref: string
  appearance: Appearance
}) {
  // Prefer mobile-first so phones never remount Canvas desktop→mobile (R3F runtime crash).
  const [mobile, setMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 1023px)').matches : true,
  )

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1023px)')
    const sync = () => setMobile(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  return (
    <div className={styles.stage}>
      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 py-4">
        <Link
          href={backHref}
          className="flex size-10 items-center justify-center rounded-full bg-white text-neutral-800 shadow-sm ring-1 ring-black/5"
          aria-label="Back"
        >
          <ChevronLeft className="size-5" />
        </Link>
        <div className="flex flex-col items-center gap-2">
          <p className={lookStyles.stepTitle}>{title}</p>
          <StepDots current={step} />
        </div>
        <span className="size-10" aria-hidden="true" />
      </header>

      <StageErrorBoundary>
        <Canvas
          camera={
            mobile
              ? { position: [0, 1.28, 4.35], fov: 28 }
              : { position: [0, 1.15, 4.1], fov: 32 }
          }
          className="relative z-0 h-full bg-transparent"
          style={{ background: 'transparent' }}
          shadows
          dpr={[1, 1.25]}
          gl={{
            alpha: true,
            antialias: !mobile,
            powerPreference: 'default',
            failIfMajorPerformanceCaveat: false,
          }}
          onCreated={({ gl }) => {
            gl.setClearColor(0x000000, 0)
          }}
        >
          <ambientLight intensity={1.05} />
          <hemisphereLight args={['#FFF7EC', '#B8C4C0', 0.55]} />
          <directionalLight position={[2.2, 4.2, 2]} intensity={1.15} castShadow={!mobile} />
          <group scale={mobile ? 0.78 : 1} position={mobile ? [0, 0.28, 0] : [0, 0, 0]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} receiveShadow>
              <circleGeometry args={[0.42, 64]} />
              <meshBasicMaterial color="#DDE3EB" />
            </mesh>
            {!mobile ? (
              <ContactShadows position={[0, 0.005, 0]} opacity={0.22} scale={1.6} blur={2.2} far={1.1} />
            ) : null}
            <Suspense fallback={null}>
              <CharacterFigure appearance={appearance} />
            </Suspense>
          </group>
          <OrbitControls
            enablePan={false}
            enableZoom={false}
            minPolarAngle={1.1}
            maxPolarAngle={1.45}
            target={mobile ? [0, 1.02, 0] : [0, 0.85, 0]}
          />
        </Canvas>
      </StageErrorBoundary>
      <p className={styles.hint}>Drag to spin</p>
    </div>
  )
}
