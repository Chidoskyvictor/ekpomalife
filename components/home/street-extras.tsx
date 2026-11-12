'use client'

import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, useState } from 'react'
import type { Group } from 'three'
import { CarModel } from '@/components/cars/car-model'
import { CharacterFigure } from '@/components/look/character-figure'
import { normalizeAppearance, type Appearance } from '@/lib/game/look'
import styles from './street.module.css'

/** The car you drive, parked at the kerb a few steps from your gate (life size: same scale as the home carport). */
export const PARKED_CAR_SCALE = 0.85
/** Car footprint at that scale (long side along the road), for the walk blocks and the "Get in" reach. */
export const PARKED_CAR = { length: 4.0, width: 1.75 }

export function ParkedCar({ model, color, x, z }: { model: string; color: string; x: number; z: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, Math.PI / 2, 0]} scale={PARKED_CAR_SCALE}>
      <CarModel id={model} color={color} />
    </group>
  )
}

/** The small boy who hangs around the street: a child in our usual character model. */
const BOY: Appearance = normalizeAppearance({
  body: 'man',
  hair: 'lowcut',
  outfit: 'casual',
  skin: '#6B3F28',
  hairColor: '#0D0D0D',
  topColor: '#E0B13C',
  bottomColor: '#3A4A5C',
})
const BOY_SCALE = 0.68
const BOY_SPEED = 1.3
/** Within this many metres he comes over and asks; his tag shows while you are this close. */
const ASK_REACH = 4.2
const STOP_SHORT = 1.3

/**
 * The street boy: strolls up and down the road, comes over when you are near and stops a step
 * away with "Brother, any work?" (or "Sister, …") over his head, then wanders off when you leave.
 */
export function StreetBoy({
  player,
  minX,
  maxX,
  z,
  word,
}: {
  /** Where you are (x, z), updated as you walk. */
  player: React.RefObject<[number, number]>
  minX: number
  maxX: number
  /** The line he walks along (on the road). */
  z: number
  /** "Brother" or "Sister". */
  word: string
}) {
  const group = useRef<Group>(null)
  const moving = useRef(false)
  const pos = useRef<[number, number]>([minX + (maxX - minX) * 0.7, z])
  const goal = useRef<[number, number]>([minX + 2, z])
  const [asking, setAsking] = useState(false)
  const askingRef = useRef(false)
  const look = useMemo(() => BOY, [])

  useFrame((_, delta) => {
    const g = group.current
    if (!g) return
    const dt = Math.min(delta, 0.05)
    const [px, pz] = player.current
    const [bx, bz] = pos.current
    const near = Math.hypot(px - bx, pz - bz) < ASK_REACH
    if (near !== askingRef.current) {
      askingRef.current = near
      setAsking(near)
    }
    // Near you: walk over and stop a step away. Otherwise stroll between the ends of the street.
    let [gx, gz] = goal.current
    if (near) {
      gx = px
      gz = pz
    } else if (Math.hypot(gx - bx, gz - bz) < 0.3) {
      goal.current = [bx < (minX + maxX) / 2 ? maxX - 1 - Math.random() * 3 : minX + 1 + Math.random() * 3, z + (Math.random() - 0.5) * 1.2]
      ;[gx, gz] = goal.current
    }
    const dx = gx - bx
    const dz = gz - bz
    const far = Math.hypot(dx, dz)
    const go = near ? far > STOP_SHORT : far > 0.05
    moving.current = go
    if (go) {
      const step = Math.min(BOY_SPEED * dt, far - (near ? STOP_SHORT : 0))
      pos.current = [bx + (dx / far) * step, bz + (dz / far) * step]
    }
    // Face where he walks, or you when he is asking
    const face = near ? Math.atan2(px - pos.current[0], pz - pos.current[1]) : Math.atan2(dx, dz)
    let turn = face - g.rotation.y
    turn = Math.atan2(Math.sin(turn), Math.cos(turn))
    g.rotation.y += turn * Math.min(1, dt * 8)
    g.position.set(pos.current[0], 0, pos.current[1])
  })

  return (
    <group ref={group} position={[pos.current[0], 0, pos.current[1]]}>
      <group scale={BOY_SCALE}>
        <CharacterFigure appearance={look} moving={moving} />
      </group>
      {asking ? (
        <Html position={[0, 1.55, 0]} center zIndexRange={[12, 0]} style={{ pointerEvents: 'none' }}>
          <span className={styles.boyTag}>{word}, any work?</span>
        </Html>
      ) : null}
    </group>
  )
}
