'use client'

import { useGLTF } from '@react-three/drei'
import { useMemo } from 'react'
import { CanvasTexture, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace } from 'three'
import {
  CHARACTER_GLB,
  HAIR_COLOR,
  SHOE_COLOR,
  SKIN,
  fabricSwatch,
  type Appearance,
  type FabricId,
  type HairId,
  type OutfitId,
} from '@/lib/game/look'

const fabricCache = new Map<string, MeshStandardMaterial>()
const colorCache = new Map<string, MeshStandardMaterial>()

function paint(color: string, roughness = 0.72) {
  let material = colorCache.get(color)
  if (!material) {
    material = new MeshStandardMaterial({ color, roughness, metalness: 0.02 })
    colorCache.set(color, material)
  }
  return material
}

function fabricMaterial(id: FabricId) {
  const cached = fabricCache.get(id)
  if (cached) return cached
  const { a, b } = fabricSwatch(id)
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = b
  ctx.fillRect(0, 0, 128, 128)
        ctx.fillStyle = a
  for (let y = -24; y < 152; y += 24) {
    for (let x = -24; x < 152; x += 24) {
      ctx.beginPath()
      ctx.moveTo(x + 12, y)
      ctx.lineTo(x + 24, y + 12)
      ctx.lineTo(x + 12, y + 24)
      ctx.lineTo(x, y + 12)
      ctx.closePath()
      ctx.fill()
    }
  }
  const map = new CanvasTexture(canvas)
  map.colorSpace = SRGBColorSpace
  map.wrapS = map.wrapT = RepeatWrapping
  map.repeat.set(2, 2)
  const material = new MeshStandardMaterial({ map, roughness: 0.7 })
  fabricCache.set(id, material)
  return material
}

function Limb({
  position,
  size,
  color,
}: {
  position: [number, number, number]
  size: [number, number, number]
  color: string
}) {
  return (
    <mesh position={position} castShadow material={paint(color)}>
      <capsuleGeometry args={[size[0], size[1], 4, 8]} />
    </mesh>
  )
}

function Hair({ id, body }: { id: HairId; body: Appearance['body'] }) {
  const hair = paint(HAIR_COLOR)
  const gele = paint('#D4A84B')
  if (id === 'bald') return null
  if (id === 'lowcut') {
    return <mesh position={[0, 1.58, 0]} material={hair} castShadow><sphereGeometry args={[0.195, 12, 10, 0, Math.PI * 2, 0, 1.1]} /></mesh>
  }
  if (id === 'classic') {
    return <mesh position={[0, 1.57, 0.01]} material={hair} castShadow><sphereGeometry args={[0.2, 12, 10, 0, Math.PI * 2, 0, 1.25]} /></mesh>
  }
  if (id === 'afro') {
    return <mesh position={[0, 1.68, 0]} material={hair} castShadow><sphereGeometry args={[0.32, 12, 10]} /></mesh>
  }
  if (id === 'curls') {
    return (
      <group>
        {[-0.12, 0.12, 0, -0.08, 0.08].map((x, i) => (
          <mesh key={i} position={[x, 1.62 + (i % 2) * 0.04, i > 2 ? 0.1 : -0.02]} material={hair} castShadow>
            <sphereGeometry args={[0.1, 8, 8]} />
          </mesh>
        ))}
      </group>
    )
  }
  if (id === 'locs') {
    return (
      <group>
        <mesh position={[0, 1.58, 0]} material={hair} castShadow><sphereGeometry args={[0.2, 10, 8, 0, Math.PI * 2, 0, 1.3]} /></mesh>
        {[-0.12, -0.04, 0.04, 0.12].map((x) => (
          <mesh key={x} position={[x, 1.28, 0.12]} material={hair} castShadow>
            <capsuleGeometry args={[0.03, 0.28, 3, 6]} />
          </mesh>
        ))}
      </group>
    )
  }
  if (id === 'bun') {
    return (
      <group>
        <mesh position={[0, 1.58, 0]} material={hair} castShadow><sphereGeometry args={[0.2, 12, 10, 0, Math.PI * 2, 0, 1.2]} /></mesh>
        <mesh position={[0, 1.7, -0.12]} material={hair} castShadow><sphereGeometry args={[0.1, 10, 8]} /></mesh>
      </group>
    )
  }
  if (id === 'ponytail') {
    return (
      <group>
        <mesh position={[0, 1.58, 0]} material={hair} castShadow><sphereGeometry args={[0.2, 12, 10, 0, Math.PI * 2, 0, 1.2]} /></mesh>
        <mesh position={[0, 1.42, -0.18]} rotation={[0.5, 0, 0]} material={hair} castShadow>
          <capsuleGeometry args={[0.045, 0.28, 3, 6]} />
        </mesh>
      </group>
    )
  }
  if (id === 'long') {
    return <mesh position={[0, 1.48, -0.04]} material={hair} castShadow><sphereGeometry args={[0.26, 12, 10]} /></mesh>
  }
  if (id === 'gele') {
    return (
      <group>
        <mesh position={[0, 1.6, 0]} material={gele} castShadow><torusGeometry args={[0.18, 0.07, 8, 16]} /></mesh>
        <mesh position={[0.16, 1.66, 0]} material={gele} castShadow><boxGeometry args={[0.12, 0.16, 0.08]} /></mesh>
      </group>
    )
  }
  return (
    <group>
      <mesh position={[0, 1.58, 0]} material={hair} castShadow>
        <sphereGeometry args={[body === 'woman' ? 0.22 : 0.2, 12, 10, 0, Math.PI * 2, 0, 1.25]} />
      </mesh>
      {body === 'woman'
        ? [-0.1, 0.1].map((x) => (
            <mesh key={x} position={[x, 1.32, 0.08]} material={hair} castShadow>
              <capsuleGeometry args={[0.035, 0.22, 3, 6]} />
            </mesh>
          ))
        : null}
    </group>
  )
}

function Clothes({ outfit, fabric, body }: { outfit: OutfitId; fabric: FabricId; body: Appearance['body'] }) {
  const cloth = fabricMaterial(fabric)
  const navy = paint('#243044')
  const grey = paint('#6B7280')
  const woman = body === 'woman'

  if (outfit === 'hoodie') {
    return (
      <group>
        <mesh position={[0, 1.12, 0]} material={cloth} castShadow><boxGeometry args={[0.46, 0.42, 0.28]} /></mesh>
        <mesh position={[0, 1.32, 0]} material={cloth} castShadow><boxGeometry args={[0.34, 0.12, 0.26]} /></mesh>
        <mesh position={[0, 0.62, 0]} material={grey} castShadow><boxGeometry args={[0.36, 0.46, 0.22]} /></mesh>
      </group>
    )
  }
  if (outfit === 'office') {
    return (
      <group>
        <mesh position={[0, 1.12, 0]} material={woman ? cloth : paint('#F4F1EA')} castShadow>
          <boxGeometry args={[woman ? 0.4 : 0.44, 0.4, 0.24]} />
        </mesh>
        <mesh position={[0, 0.58, 0]} material={navy} castShadow>
          <boxGeometry args={[woman ? 0.36 : 0.38, woman ? 0.42 : 0.52, 0.22]} />
        </mesh>
      </group>
    )
  }
  if (outfit === 'chiller') {
    return (
      <group>
        <mesh position={[0, 1.14, 0]} material={cloth} castShadow><boxGeometry args={[0.48, 0.36, 0.28]} /></mesh>
        <mesh position={[0, 0.7, 0]} material={paint('#4B5563')} castShadow><boxGeometry args={[0.4, 0.28, 0.24]} /></mesh>
      </group>
    )
  }
  if (outfit === 'sitework') {
    return (
      <group>
        <mesh position={[0, 1.12, 0]} material={paint('#F0EEE5')} castShadow><boxGeometry args={[0.44, 0.4, 0.24]} /></mesh>
        <mesh position={[0, 0.62, 0]} material={paint('#C4A35A')} castShadow><boxGeometry args={[0.4, 0.48, 0.24]} /></mesh>
      </group>
    )
  }
  if (outfit === 'owambe') {
    return (
      <group>
        <mesh position={[0, 1.14, 0]} material={cloth} castShadow><boxGeometry args={[0.4, 0.36, 0.24]} /></mesh>
        <mesh position={[0, 0.62, 0]} material={cloth} castShadow><cylinderGeometry args={[0.28, 0.34, 0.7, 10]} /></mesh>
      </group>
    )
  }
  return (
    <group>
      <mesh position={[0, woman ? 1.16 : 1.1, 0]} material={cloth} castShadow>
        <boxGeometry args={[woman ? 0.36 : 0.42, woman ? 0.28 : 0.44, 0.22]} />
      </mesh>
      {!woman ? (
        <>
          <mesh position={[-0.26, 1.18, 0]} material={cloth} castShadow>
            <boxGeometry args={[0.14, 0.16, 0.16]} />
          </mesh>
          <mesh position={[0.26, 1.18, 0]} material={cloth} castShadow>
            <boxGeometry args={[0.14, 0.16, 0.16]} />
          </mesh>
        </>
      ) : null}
      <mesh position={[0, woman ? 0.7 : 0.58, 0]} material={woman ? navy : paint('#6B4DE0')} castShadow>
        {woman ? <cylinderGeometry args={[0.2, 0.26, 0.4, 10]} /> : <boxGeometry args={[0.36, 0.52, 0.2]} />}
      </mesh>
    </group>
  )
}

function ModularFigure({ appearance }: { appearance: Appearance }) {
  const woman = appearance.body === 'woman'
  const shorts = appearance.outfit === 'chiller'
  return (
    <group>
      <mesh position={[0, 1.48, 0]} material={paint(SKIN)} castShadow>
        <sphereGeometry args={[0.2, 16, 12]} />
      </mesh>
      <mesh position={[0, 1.3, 0]} material={paint(SKIN)} castShadow>
        <cylinderGeometry args={[0.07, 0.08, 0.1, 8]} />
      </mesh>
      <Clothes outfit={appearance.outfit} fabric={appearance.fabric} body={appearance.body} />
      <Limb position={[woman ? -0.26 : -0.28, 1.08, 0]} size={[0.055, 0.42, 0.055]} color={SKIN} />
      <Limb position={[woman ? 0.26 : 0.28, 1.08, 0]} size={[0.055, 0.42, 0.055]} color={SKIN} />
      <Limb position={[-0.1, shorts ? 0.42 : 0.34, 0]} size={[0.07, shorts ? 0.28 : 0.46, 0.07]} color={SKIN} />
      <Limb position={[0.1, shorts ? 0.42 : 0.34, 0]} size={[0.07, shorts ? 0.28 : 0.46, 0.07]} color={SKIN} />
      <mesh position={[-0.1, 0.05, 0.04]} material={paint(SHOE_COLOR)} castShadow>
        <boxGeometry args={[0.12, 0.07, 0.2]} />
      </mesh>
      <mesh position={[0.1, 0.05, 0.04]} material={paint(SHOE_COLOR)} castShadow>
        <boxGeometry args={[0.12, 0.07, 0.2]} />
      </mesh>
      <Hair id={appearance.hair} body={appearance.body} />
    </group>
  )
}

function ImportedFigure({ url, appearance }: { url: string; appearance: Appearance }) {
  const { scene } = useGLTF(url)
  const clone = useMemo(() => scene.clone(true), [scene])
  return (
    <group scale={1.15} position={[0, 0, 0]}>
      <primitive object={clone} />
      <Hair id={appearance.hair} body={appearance.body} />
    </group>
  )
}

export function CharacterFigure({ appearance, imported = false }: { appearance: Appearance; imported?: boolean }) {
  if (imported) return <ImportedFigure url={CHARACTER_GLB[appearance.body]} appearance={appearance} />
  return <ModularFigure appearance={appearance} />
}
