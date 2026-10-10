'use client'

import { useMemo } from 'react'
import { MAP } from '@/lib/game/map-theme'
import { generateTown, type House } from '@/lib/game/world-layout'
import { Block, glass } from './materials'

function GlassBands({ w, d, floors, floorH, base }: { w: number; d: number; floors: number; floorH: number; base: number }) {
  return (
    <>
      {Array.from({ length: floors }, (_, i) => {
        const y = base + floorH * (i + 0.55)
        return (
          <group key={i}>
            <Block position={[0, y, d / 2 + 0.01]} size={[w * 0.72, floorH * 0.36, 0.04]} material={glass} shadow={false} />
            <Block position={[0, y, -d / 2 - 0.01]} size={[w * 0.72, floorH * 0.36, 0.04]} material={glass} shadow={false} />
          </group>
        )
      })}
    </>
  )
}

function HouseModel({ house }: { house: House }) {
  const { w, d, h, wall, accent } = house

  switch (house.style) {
    case 'tower': {
      const floors = Math.max(3, Math.round(h / 0.8))
      const floorH = h / floors
      return (
        <group>
          <Block position={[0, h / 2, 0]} size={[w, h, d]} color={wall} />
          {Array.from({ length: floors }, (_, i) => (
            <group key={i}>
              {[1, -1].map((side) => (
                <Block
                  key={side}
                  position={[0, floorH * (i + 0.5), (side * d) / 2 + side * 0.01]}
                  size={[w * 0.7, floorH * 0.38, 0.04]}
                  material={glass}
                  shadow={false}
                />
              ))}
            </group>
          ))}
          <Block position={[0, h + 0.07, 0]} size={[w + 0.12, 0.14, d + 0.12]} color={accent} />
        </group>
      )
    }
    case 'duplex': {
      const lower = h * 0.55
      const upper = h * 0.52
      return (
        <group>
          <Block position={[0, lower / 2, 0]} size={[w, lower, d]} color={wall} />
          <Block position={[w * 0.1, lower + upper / 2, -d * 0.06]} size={[w * 0.8, upper, d * 0.84]} color={MAP.buildingGray} />
          <Block position={[w * 0.1, lower + upper * 0.52, d * 0.32 + 0.01]} size={[w * 0.5, upper * 0.36, 0.04]} material={glass} shadow={false} />
          <Block position={[-w * 0.12, lower * 0.48, d / 2 + 0.01]} size={[w * 0.46, lower * 0.38, 0.04]} material={glass} shadow={false} />
          <Block position={[w * 0.1, lower + upper + 0.05, -d * 0.06]} size={[w * 0.88, 0.1, d * 0.9]} color={accent} />
        </group>
      )
    }
    case 'villa': {
      return (
        <group>
          <Block position={[0, h * 0.4, 0]} size={[w, h * 0.8, d]} color={wall} />
          <group position={[0, h * 0.8 + 0.1, 0]} rotation={[0.16, 0, 0]}>
            <Block position={[0, 0, 0]} size={[w + 0.24, 0.1, d + 0.32]} color={accent} />
          </group>
          <Block position={[0, h * 0.38, d / 2 + 0.01]} size={[w * 0.58, h * 0.34, 0.04]} material={glass} shadow={false} />
        </group>
      )
    }
    default: {
      const floors = h > 1.5 ? 2 : 1
      return (
        <group>
          <Block position={[0, h / 2, 0]} size={[w, h, d]} color={wall} />
          <GlassBands w={w} d={d} floors={floors} floorH={h / floors} base={0} />
          <Block position={[0, h + 0.06, 0]} size={[w + 0.08, 0.12, d + 0.08]} color={accent} />
        </group>
      )
    }
  }
}

function Lamp({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <Block position={[0, 0.85, 0]} size={[0.1, 1.7, 0.1]} color={MAP.buildingGray} />
      <Block position={[0.18, 1.72, 0]} size={[0.42, 0.08, 0.16]} color={MAP.building} />
      <Block position={[0.32, 1.62, 0]} size={[0.16, 0.12, 0.16]} color={MAP.roof} shadow={false} />
    </group>
  )
}

export function WorldTown() {
  const { houses, lamps } = useMemo(() => generateTown(), [])

  return (
    <group>
      {houses.map((house, index) => (
        <group key={`h${index}`} position={[house.x, 0, house.z]} rotation={[0, house.rot, 0]}>
          <HouseModel house={house} />
        </group>
      ))}
      {lamps.map((lamp, index) => (
        <Lamp key={`l${index}`} x={lamp.x} z={lamp.z} />
      ))}
    </group>
  )
}
