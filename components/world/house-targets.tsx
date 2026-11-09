'use client'

import { Html } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useGame } from '@/hooks/use-game'
import { ESTATE_PLOTS, plotFromSelectId, plotSelectId } from '@/lib/game/estates'
import { useHouses } from '@/lib/game/houses-api'

type Tag = { x: number; y: number; z: number; label: string; home: boolean } | null

/**
 * Players' houses in the estates: an invisible tap box over each house that has an owner (tap →
 * the house sheet), a tag over the one you picked, and "My house" over yours.
 *
 * The two tags are always mounted and only hidden/moved: drei's <Html> owns a separate React root,
 * and mounting/unmounting it while the map re-renders makes React warn about a synchronous unmount
 * during render.
 */
export function HouseTargets() {
  const { isGuest, selectedId, select } = useGame()
  const { houses, myPlot } = useHouses(!isGuest)
  const picked = plotFromSelectId(selectedId)
  if (isGuest) return null

  let mineTag: Tag = null
  let pickedTag: Tag = null
  for (const house of houses) {
    const slot = ESTATE_PLOTS[house.plot]
    if (!slot) continue
    const at = { x: slot.x, y: slot.cellW * 1.1, z: slot.z, home: Boolean(house.home) }
    if (house.plot === myPlot) mineTag = { ...at, label: 'My house' }
    else if (house.plot === picked) pickedTag = { ...at, label: `@${house.username}` }
  }

  return (
    <group>
      {houses.map((house) => {
        const slot = ESTATE_PLOTS[house.plot]
        if (!slot) return null
        return (
          <mesh
            key={house.plot}
            position={[slot.x, slot.cellW * 0.45, slot.z]}
            visible={false}
            onClick={(event: ThreeEvent<MouseEvent>) => {
              event.stopPropagation()
              select(plotSelectId(house.plot))
            }}
          >
            <boxGeometry args={[slot.cellW, slot.cellW * 0.9, slot.cellD]} />
          </mesh>
        )
      })}
      <HouseTag tag={mineTag} mine />
      <HouseTag tag={pickedTag} mine={false} />
    </group>
  )
}

function HouseTag({ tag, mine }: { tag: Tag; mine: boolean }) {
  return (
    <Html
      position={tag ? [tag.x, tag.y, tag.z] : [0, -1000, 0]}
      center
      zIndexRange={[20, 0]}
      style={{ pointerEvents: 'none', display: tag ? undefined : 'none' }}
    >
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
        {tag?.home ? <span style={{ width: 7, height: 7, borderRadius: 7, background: '#22C55E' }} /> : null}
        {tag?.label}
      </span>
    </Html>
  )
}
