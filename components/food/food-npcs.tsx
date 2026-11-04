'use client'

import { Html } from '@react-three/drei'
import { useRef } from 'react'
import { CharacterFigure, type FigurePose } from '@/components/look/character-figure'
import type { FoodNpc } from '@/lib/game/food-room'

/** A food place's staff behind the counter and its diners. Tap staff to order, diners to chat. */
export function FoodNpcs({ npcs, onTap, bubbles }: { npcs: FoodNpc[]; onTap?: (npc: FoodNpc) => void; bubbles?: Record<string, string> }) {
  const sit = useRef<FigurePose | null>('sit')
  const stand = useRef<FigurePose | null>(null)
  const still = useRef(false)
  return (
    <>
      {npcs.map((npc) => {
        const bubble = bubbles?.[npc.id]
        return (
          <group key={npc.id} position={[npc.x, npc.y, npc.z]} rotation={[0, npc.heading, 0]}>
            <CharacterFigure appearance={npc.appearance} pose={npc.seated ? sit : stand} moving={still} />
            {onTap ? (
              <mesh
                position={[0, 0.95, 0]}
                onClick={(e) => {
                  e.stopPropagation()
                  onTap(npc)
                }}
              >
                <capsuleGeometry args={[0.32, 1.0, 4, 8]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
            ) : null}
            <Html position={[0, npc.seated ? 1.95 : 2.15, 0]} center distanceFactor={9} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
              <span
                style={{
                  display: 'inline-block',
                  maxWidth: bubble ? 200 : 120,
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: npc.seated ? 'rgba(17,12,40,0.6)' : 'rgba(15,118,110,0.9)',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 700,
                  whiteSpace: bubble ? 'normal' : 'nowrap',
                }}
              >
                {bubble ?? (npc.seated ? npc.name : `🍛 ${npc.name}`)}
              </span>
            </Html>
          </group>
        )
      })}
    </>
  )
}
