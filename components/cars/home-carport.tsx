'use client'

import type { ThreeEvent } from '@react-three/fiber'
import type { RoomLayout } from '@/lib/game/room-layouts'
import { CAR_MAP_SCALE, Carport } from './car-lot-zone'

/**
 * The carport in a home's own scene: outside the front of the house.
 * Nothing is drawn until the owner has a car; then up to two are parked under it, with a
 * "+N more" tag for the rest. Tapping it (your own home) opens My garage.
 */
export function HomeCarport({ layout, cars, onTap }: { layout: RoomLayout; cars: string[]; onTap?: () => void }) {
  if (cars.length === 0) return null
  const minX = Math.min(...layout.floors.map((f) => f[0]))
  const maxX = Math.max(...layout.floors.map((f) => f[2]))
  const maxZ = Math.max(...layout.floors.map((f) => f[3]))
  // The carport is modelled at map scale; grow it back so the cars are life-size next to the house
  const k = 0.85 / CAR_MAP_SCALE
  const span = (cars.length > 1 ? 2.3 : 1.25) * k
  return (
    <group
      // Out front where the room camera can see it: by the left corner in the corner view, by the right wall in the hostel's front view
      position={layout.view === 'front' ? [maxX + 0.4 - span / 2, 0, maxZ + 3.4] : [minX - 0.4 + span / 2, 0, maxZ + 3.8]}
      scale={k}
      onClick={
        onTap
          ? (event: ThreeEvent<MouseEvent>) => {
              event.stopPropagation()
              onTap()
            }
          : undefined
      }
    >
      <Carport cars={cars} tag={0.42} />
    </group>
  )
}
