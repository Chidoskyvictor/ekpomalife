'use client'

import { Html } from '@react-three/drei'
import { useRef } from 'react'
import { CharacterFigure, type FigurePose } from '@/components/look/character-figure'
import { CHURCH_NPCS } from '@/lib/game/church-npcs'

/** The pastor at the pulpit and a few worshippers on the pews. */
export function ChurchNpcs() {
  const sit = useRef<FigurePose | null>('sit')
  const stand = useRef<FigurePose | null>(null)
  const still = useRef(false)
  return (
    <>
      {CHURCH_NPCS.map((npc) => (
        <group key={npc.id} position={[npc.x, npc.y, npc.z]} rotation={[0, npc.heading, 0]}>
          <CharacterFigure appearance={npc.appearance} pose={npc.seated ? sit : stand} moving={still} />
          {npc.name ? (
            <Html position={[0, 2.15, 0]} center distanceFactor={9} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
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
                ⛪ {npc.name}
              </span>
            </Html>
          ) : null}
        </group>
      ))}
    </>
  )
}
