'use client'

import { Clone, useGLTF } from '@react-three/drei'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { generateKenneyTown, kenneyUrl, type KenneyPlacement } from '@/lib/game/kenney-buildings'
import { MAP } from '@/lib/game/map-theme'
import { Block } from './materials'

function KenneyMesh({ placement }: { placement: KenneyPlacement }) {
  const { scene } = useGLTF(kenneyUrl(placement.model))
  const pad = placement.scale * 1.15
  return (
    <group position={[placement.x, 0, placement.z]} rotation={[0, placement.rot, 0]}>
      <Block position={[0, 0.04, 0]} size={[pad + 0.22, 0.07, pad + 0.22]} color={MAP.kenneyPadEdge} shadow={false} />
      <Block position={[0, 0.085, 0]} size={[pad, 0.08, pad]} color={MAP.kenneyPad} />
      <Clone object={scene} position={[0, 0.14, 0]} scale={placement.scale} castShadow receiveShadow />
    </group>
  )
}

function KenneyCluster({ items }: { items: KenneyPlacement[] }) {
  return (
    <group>
      {items.map((placement) => (
        <KenneyMesh key={placement.id} placement={placement} />
      ))}
    </group>
  )
}

export function WorldKenney() {
  const [mobile, setMobile] = useState(false)

  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px), (pointer: coarse)')
    const sync = () => setMobile(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  const items = useMemo(() => generateKenneyTown(mobile), [mobile])

  return (
    <Suspense fallback={null}>
      <KenneyCluster items={items} />
    </Suspense>
  )
}
