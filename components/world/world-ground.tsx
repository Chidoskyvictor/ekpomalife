'use client'

import { Html } from '@react-three/drei'
import { CAMPUS_ZONE, MED_ZONE, ROADS, type Rect } from '@/lib/game/world-layout'

function Zone({ rect, color }: { rect: Rect; color: string }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[rect.x, 0.01, rect.z]} receiveShadow>
      <planeGeometry args={[rect.w, rect.d]} />
      <meshStandardMaterial color={color} />
    </mesh>
  )
}

function Fence({ rect, gapX }: { rect: Rect; gapX?: number }) {
  const height = 0.5
  const color = '#e9e2cf'
  const left = rect.x - rect.w / 2
  const right = rect.x + rect.w / 2
  const front = rect.z + rect.d / 2
  const back = rect.z - rect.d / 2
  const segments: { pos: [number, number, number]; size: [number, number, number] }[] = [
    { pos: [rect.x, height / 2, back], size: [rect.w, height, 0.25] },
    { pos: [left, height / 2, rect.z], size: [0.25, height, rect.d] },
    { pos: [right, height / 2, rect.z], size: [0.25, height, rect.d] },
  ]
  if (gapX !== undefined) {
    const gap = 3.4
    const leftLen = gapX - gap / 2 - left
    const rightLen = right - (gapX + gap / 2)
    segments.push({ pos: [left + leftLen / 2, height / 2, front], size: [leftLen, height, 0.25] })
    segments.push({ pos: [right - rightLen / 2, height / 2, front], size: [rightLen, height, 0.25] })
  } else {
    segments.push({ pos: [rect.x, height / 2, front], size: [rect.w, height, 0.25] })
  }
  return (
    <group>
      {segments.map((segment, index) => (
        <mesh key={index} position={segment.pos} castShadow receiveShadow>
          <boxGeometry args={segment.size} />
          <meshStandardMaterial color={color} />
        </mesh>
      ))}
    </group>
  )
}

function Gate({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      {[-1.9, 1.9].map((offset) => (
        <mesh key={offset} position={[offset, 1.1, 0]} castShadow>
          <boxGeometry args={[0.5, 2.2, 0.5]} />
          <meshStandardMaterial color="#2f8f5b" />
        </mesh>
      ))}
      <mesh position={[0, 2.3, 0]} castShadow>
        <boxGeometry args={[4.4, 0.5, 0.5]} />
        <meshStandardMaterial color="#2f8f5b" />
      </mesh>
      <mesh position={[0, 2.3, 0.26]}>
        <boxGeometry args={[3.4, 0.32, 0.04]} />
        <meshStandardMaterial color="#f2c94c" />
      </mesh>
    </group>
  )
}

function Road({ rect }: { rect: Rect }) {
  const horizontal = rect.w > rect.d
  const length = horizontal ? rect.w : rect.d
  const dashes = Math.floor(length / 3)
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[rect.x, 0.02, rect.z]} receiveShadow>
        <planeGeometry args={[rect.w, rect.d]} />
        <meshStandardMaterial color="#c9774a" />
      </mesh>
      {rect.w >= 3.5 || rect.d >= 3.5
        ? Array.from({ length: dashes }, (_, i) => {
            const offset = -length / 2 + 1.5 + i * 3
            const position: [number, number, number] = horizontal
              ? [rect.x + offset, 0.03, rect.z]
              : [rect.x, 0.03, rect.z + offset]
            return (
              <mesh key={i} rotation={[-Math.PI / 2, 0, horizontal ? 0 : Math.PI / 2]} position={position}>
                <planeGeometry args={[1.2, 0.16]} />
                <meshStandardMaterial color="#f6e7c8" />
              </mesh>
            )
          })
        : null}
    </group>
  )
}

function GroundLabel({ text, position, rotation = 0 }: { text: string; position: [number, number, number]; rotation?: number }) {
  return (
    <Html
      transform
      position={position}
      rotation={[-Math.PI / 2, 0, rotation]}
      zIndexRange={[5, 0]}
      pointerEvents="none"
      distanceFactor={10}
    >
      <span className="pointer-events-none select-none whitespace-nowrap text-[42px] font-extrabold tracking-[0.35em] text-white/70">
        {text}
      </span>
    </Html>
  )
}

export function WorldGround() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[220, 220]} />
        <meshStandardMaterial color="#a7cc8f" />
      </mesh>
      <Zone rect={CAMPUS_ZONE} color="#bcdba3" />
      <Zone rect={MED_ZONE} color="#bcdba3" />
      <Fence rect={CAMPUS_ZONE} gapX={-8} />
      <Fence rect={MED_ZONE} gapX={22} />
      <Gate x={-8} z={CAMPUS_ZONE.z + CAMPUS_ZONE.d / 2} />
      {ROADS.map((road, index) => (
        <Road key={index} rect={road} />
      ))}
      <GroundLabel text="AMBROSE ALLI UNIVERSITY" position={[-10, 0.05, -7.6]} />
      <GroundLabel text="EKPOMA–IRUEKPEN RD" position={[-30, 0.05, 0]} />
    </group>
  )
}
