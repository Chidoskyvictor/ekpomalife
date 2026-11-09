'use client'

import { Html } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { Group } from 'three'
import type { Appearance } from '@/lib/game/look'
import { CharacterFigure, type FigurePose } from '@/components/look/character-figure'
import { HUB_DESKS, HUB_SEATS, SEATED_Y, type HubDeskId } from '@/lib/game/hub-desks'

/** dreality walks the floor, stopping a while at each desk (x, z; he faces +z, toward the desk in front of him). */
const ROUND: [number, number][] = [
  [-4.15, 1.12], [-1.95, 1.12], [0.25, 1.12], [1.4, 1.12],
  [1.4, -1.3], [0.25, -1.3], [-1.95, -1.3], [-4.15, -1.3], [-5.3, -1.3],
  [-5.3, 1.12],
]
const STOP_S = 3.2
const WALK_SPEED = 0.95
const DREALITY: Appearance = {
  body: 'man',
  hair: 'classic',
  outfit: 'office',
  skin: '#6B3F28',
  hairColor: '#1b1410',
  topColor: '#0f766e',
  bottomColor: '#1f2937',
}

/** An extra NPC, "dreality", going round the desks one after another. */
function Dreality() {
  const group = useRef<Group>(null)
  const moving = useRef(false)
  const idle = useRef<FigurePose | null>(null)
  const state = useRef({ x: ROUND[0]![0], z: ROUND[0]![1], next: 1, wait: STOP_S, heading: 0 })
  useFrame((_, delta) => {
    const g = group.current
    if (!g) return
    const dt = Math.min(delta, 0.1)
    const st = state.current
    const goal = ROUND[st.next]!
    if (st.wait > 0) {
      st.wait -= dt
      moving.current = false
      // Face the desk while standing there
      st.heading += (((0 - st.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 6)
    } else {
      const dx = goal[0] - st.x
      const dz = goal[1] - st.z
      const dist = Math.hypot(dx, dz)
      if (dist < 0.06) {
        st.next = (st.next + 1) % ROUND.length
        // Only the desk stops are long; corners pass straight on
        const here = ROUND[(st.next + ROUND.length - 1) % ROUND.length]!
        st.wait = here[0] === 1.4 || here[0] === -5.3 ? 0 : STOP_S
      } else {
        const step = Math.min(dist, WALK_SPEED * dt)
        st.x += (dx / dist) * step
        st.z += (dz / dist) * step
        moving.current = true
        const want = Math.atan2(dx, dz)
        st.heading += (((want - st.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 8)
      }
    }
    g.position.set(st.x, 0, st.z)
    g.rotation.y = st.heading
  })
  const look = useMemo(() => DREALITY, [])
  return (
    <group ref={group} position={[ROUND[0]![0], 0, ROUND[0]![1]]}>
      <CharacterFigure appearance={look} pose={idle} moving={moving} />
      <Html position={[0, 1.95, 0]} center distanceFactor={9} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
        <span
          style={{
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: 999,
            background: 'rgba(17,12,40,0.78)',
            color: '#fff',
            fontSize: 12,
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}
        >
          dreality
        </span>
      </Html>
    </group>
  )
}

/**
 * The Innovation Hub NPCs, seated on their desks' chairs with name tags. Tapping an NPC or their
 * desk opens their task (you walk over first).
 */
export function HubNpcs({ onTap, onSeat }: { onTap?: (id: HubDeskId) => void; onSeat?: (seatId: string) => void }) {
  // Seated NPCs type at their laptops
  const sit = useRef<FigurePose | null>('type')
  const still = useRef(false)
  const tap = (id: HubDeskId) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    onTap?.(id)
  }
  return (
    <>
      <Dreality />
      {HUB_DESKS.map((desk) => (
        <group key={desk.id}>
          <group position={[desk.npc.x, SEATED_Y, desk.npc.z]} rotation={[0, desk.npc.heading, 0]}>
            <CharacterFigure appearance={desk.npc.appearance} pose={sit} moving={still} />
            {/* See-through capsule over the body takes the tap */}
            <mesh position={[0, 0.95, 0]} onClick={tap(desk.id)}>
              <capsuleGeometry args={[0.32, 1.0, 4, 8]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            <Html position={[0, 1.95, 0]} center distanceFactor={9} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
              <span
                style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: 'rgba(17,12,40,0.78)',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}
              >
                {desk.emoji} {desk.npc.name}
              </span>
            </Html>
          </group>
          {/* The desk itself is tappable too */}
          <mesh position={[desk.desk.x, 0.4, desk.desk.z]} onClick={tap(desk.id)}>
            <boxGeometry args={[1.55, 0.85, 0.8]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        </group>
      ))}
      {/* Free chairs and bar stools: tap one to sit on it */}
      {onSeat
        ? HUB_SEATS.map((s) => (
            <mesh
              key={s.id}
              position={[s.x, 0.5, s.z]}
              onClick={(e) => {
                e.stopPropagation()
                onSeat(s.id)
              }}
            >
              <boxGeometry args={[0.55, 1.0, 0.55]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          ))
        : null}
    </>
  )
}
