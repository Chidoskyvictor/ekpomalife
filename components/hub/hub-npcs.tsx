'use client'

import { Html } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useRef } from 'react'
import { CharacterFigure, type FigurePose } from '@/components/look/character-figure'
import { HUB_DESKS, HUB_SEATS, SEATED_Y, type HubDeskId } from '@/lib/game/hub-desks'

/**
 * The Innovation Hub NPCs, seated on their desks' chairs with name tags. Tapping an NPC or their
 * desk opens their task (you walk over first).
 */
export function HubNpcs({ onTap, onSeat }: { onTap?: (id: HubDeskId) => void; onSeat?: (seatId: string) => void }) {
  const sit = useRef<FigurePose | null>('sit')
  const still = useRef(false)
  const tap = (id: HubDeskId) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    onTap?.(id)
  }
  return (
    <>
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
