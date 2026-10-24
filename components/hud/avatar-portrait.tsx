'use client'

import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useRef, useState } from 'react'
import { Box3, Vector3, type Group, type PerspectiveCamera } from 'three'
import { CharacterFigure } from '@/components/look/character-figure'
import { DEFAULT_APPEARANCE, normalizeAppearance, type Appearance } from '@/lib/game/look'

/**
 * Head-and-shoulders picture of the player's chosen look (from signup).
 * Renders the 3D character once in a tiny off-screen canvas, saves it as an image
 * (cached per look), then drops the canvas — the HUD only ever shows an <img>.
 */
const CACHE_KEY = 'ekpoma-avatar-portrait-v2'
const PX = 192

function readCache(key: string): string | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { key: string; url: string }
    return parsed.key === key ? parsed.url : null
  } catch {
    return null
  }
}

function writeCache(key: string, url: string) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ key, url }))
  } catch {
    /* storage full / blocked — just re-render next time */
  }
}

/** Frames the head once the model (and hair) has loaded, then hands back a PNG. */
function PortraitCapture({ appearance, onShot }: { appearance: Appearance; onShot: (url: string) => void }) {
  const group = useRef<Group>(null)
  const camera = useThree((state) => state.camera) as PerspectiveCamera
  const gl = useThree((state) => state.gl)
  const frames = useRef(0)
  const done = useRef(false)

  useFrame(() => {
    if (done.current || !group.current) return
    frames.current += 1
    if (frames.current === 12) {
      // Frame the top ~27% of the figure: face + shoulders
      const box = new Box3().setFromObject(group.current)
      const height = Math.max(box.max.y - box.min.y, 0.001)
      const center = box.getCenter(new Vector3())
      const lookY = box.max.y - height * 0.13
      const span = height * 0.27
      const distance = span / (2 * Math.tan((camera.fov * Math.PI) / 360))
      camera.position.set(center.x, lookY + height * 0.02, center.z + distance * 1.05)
      camera.lookAt(center.x, lookY, center.z)
      camera.updateProjectionMatrix()
    }
    if (frames.current === 16) {
      done.current = true
      onShot(gl.domElement.toDataURL('image/png'))
    }
  })

  return (
    <group ref={group}>
      <CharacterFigure appearance={appearance} />
    </group>
  )
}

export function AvatarPortrait({
  appearance,
  fallbackColor,
  initial,
  className,
}: {
  appearance?: Appearance
  fallbackColor: string
  initial: string
  className?: string
}) {
  const look = normalizeAppearance(appearance ?? DEFAULT_APPEARANCE)
  const key = JSON.stringify(look)
  const [url, setUrl] = useState<string | null>(null)
  const [capturing, setCapturing] = useState(false)

  useEffect(() => {
    const cached = readCache(key)
    if (cached) {
      setUrl(cached)
      setCapturing(false)
    } else {
      setUrl(null)
      setCapturing(true)
    }
  }, [key])

  return (
    <>
      {url ? (
        <img className={className} src={url} alt="" draggable={false} />
      ) : (
        <span className={className} style={{ background: fallbackColor, display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700 }}>
          {initial}
        </span>
      )}
      {capturing ? (
        <div style={{ position: 'fixed', left: -10_000, top: 0, width: PX, height: PX, pointerEvents: 'none' }} aria-hidden="true">
          <Canvas
            dpr={1}
            gl={{ preserveDrawingBuffer: true, alpha: true, antialias: true }}
            camera={{ fov: 30, position: [0, 1.5, 3] }}
            style={{ width: PX, height: PX }}
          >
            <ambientLight intensity={0.9} />
            <directionalLight position={[2, 4, 3]} intensity={1.4} />
            <directionalLight position={[-3, 2, -2]} intensity={0.4} />
            <Suspense fallback={null}>
              <PortraitCapture
                appearance={look}
                onShot={(shot) => {
                  writeCache(key, shot)
                  setUrl(shot)
                  setCapturing(false)
                }}
              />
            </Suspense>
          </Canvas>
        </div>
      ) : null}
    </>
  )
}
