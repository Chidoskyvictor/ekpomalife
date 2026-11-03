'use client'

import { Html } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useGame } from '@/hooks/use-game'
import { ESTATE_PLOTS, plotFromSelectId, plotSelectId } from '@/lib/game/estates'
import { useHouses } from '@/lib/game/houses-api'

/**
 * Players' houses in the estates: an invisible tap box over each house that has an owner (tap →
 * the house sheet), a tag over the one you picked, and "My house" over yours.
 */
export function HouseTargets() {
  const { isGuest, selectedId, select } = useGame()
  const { houses, myPlot } = useHouses(!isGuest)
  const picked = plotFromSelectId(selectedId)
  if (isGuest) return null
  return (
    <group>
      {houses.map((house) => {
        const slot = ESTATE_PLOTS[house.plot]
        if (!slot) return null
        const mine = house.plot === myPlot
        const tag = mine ? 'My house' : house.plot === picked ? `@${house.username}` : null
        return (
          <group key={house.plot} position={[slot.x, 0, slot.z]}>
            <mesh
              position={[0, slot.cellW * 0.45, 0]}
              visible={false}
              onClick={(event: ThreeEvent<MouseEvent>) => {
                event.stopPropagation()
                select(plotSelectId(house.plot))
              }}
            >
              <boxGeometry args={[slot.cellW, slot.cellW * 0.9, slot.cellD]} />
            </mesh>
            {tag ? (
              <Html position={[0, slot.cellW * 1.1, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '3px 9px',
                    borderRadius: 999,
                    background: mine ? '#2F6BF0' : '#fff',
                    color: mine ? '#fff' : '#111827',
                    boxShadow: '0 4px 12px rgba(0,0,0,.18)',
                    font: '700 12px system-ui, sans-serif',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {house.home ? <span style={{ width: 7, height: 7, borderRadius: 7, background: '#22C55E' }} /> : null}
                  {tag}
                </span>
              </Html>
            ) : null}
          </group>
        )
      })}
    </group>
  )
}
