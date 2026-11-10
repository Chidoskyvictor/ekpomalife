'use client'

import type { ThreeEvent } from '@react-three/fiber'
import { AUTOS_BAYS } from '@/lib/game/autos-room'
import { CARS } from '@/lib/game/cars-rules'
import { CarModel } from './car-model'

/** The seven cars for sale, parked on the showroom's display bays. Tap one to open it in the Showroom. */
export function ShowroomCars({ onTap }: { onTap: (modelId: string) => void }) {
  return (
    <group>
      {CARS.map((car, i) => {
        const bay = AUTOS_BAYS[i]
        if (!bay) return null
        return (
          <group
            key={car.id}
            position={[bay.x, 0.16, bay.z]}
            rotation={[0, bay.rot, 0]}
            onClick={(event: ThreeEvent<MouseEvent>) => {
              event.stopPropagation()
              onTap(car.id)
            }}
          >
            <CarModel id={car.id} color={car.color} />
          </group>
        )
      })}
    </group>
  )
}
