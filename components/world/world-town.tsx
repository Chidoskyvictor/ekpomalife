'use client'

import { useMemo } from 'react'
import { generateTown, type House, type Tree } from '@/lib/game/world-layout'
import { Block, glass, paint } from './materials'
import { RockField } from './world-ground'

const LEAF_TONES = ['#3fae5a', '#52bf6a', '#2f9a4f', '#6acb72']

function GlassBands({ w, d, floors, floorH, base }: { w: number; d: number; floors: number; floorH: number; base: number }) {
  return (
    <>
      {Array.from({ length: floors }, (_, i) => {
        const y = base + floorH * (i + 0.55)
        return (
          <group key={i}>
            <Block position={[0, y, d / 2 + 0.01]} size={[w * 0.82, floorH * 0.42, 0.04]} material={glass} shadow={false} />
            <Block position={[0, y, -d / 2 - 0.01]} size={[w * 0.82, floorH * 0.42, 0.04]} material={glass} shadow={false} />
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
                  size={[w * 0.88, floorH * 0.55, 0.04]}
                  material={glass}
                  shadow={false}
                />
              ))}
              {[1, -1].map((side) => (
                <Block
                  key={`s${side}`}
                  position={[(side * w) / 2 + side * 0.01, floorH * (i + 0.5), 0]}
                  size={[0.04, floorH * 0.55, d * 0.88]}
                  material={glass}
                  shadow={false}
                />
              ))}
            </group>
          ))}
          <Block position={[0, h + 0.08, 0]} size={[w + 0.15, 0.16, d + 0.15]} color={accent} />
          <Block position={[w * 0.2, h + 0.4, -d * 0.2]} size={[w * 0.35, 0.5, d * 0.35]} color="#f5f7fa" />
        </group>
      )
    }
    case 'duplex': {
      const lower = h * 0.55
      const upper = h * 0.55
      return (
        <group>
          <Block position={[0, lower / 2, 0]} size={[w, lower, d]} color={wall} />
          <Block position={[w * 0.12, lower + upper / 2, -d * 0.08]} size={[w * 0.82, upper, d * 0.86]} color={accent} />
          <Block position={[w * 0.12, lower + upper * 0.55, d * 0.35 + 0.01]} size={[w * 0.6, upper * 0.45, 0.04]} material={glass} shadow={false} />
          <Block position={[-w * 0.15, lower * 0.5, d / 2 + 0.01]} size={[w * 0.55, lower * 0.5, 0.04]} material={glass} shadow={false} />
          <Block position={[w * 0.12, lower + upper + 0.05, -d * 0.08]} size={[w * 0.9, 0.1, d * 0.94]} color="#f5f7fa" />
          <Block position={[-w * 0.32, lower + 0.04, d * 0.3]} size={[w * 0.36, 0.08, d * 0.4]} color="#f5f7fa" />
        </group>
      )
    }
    case 'villa': {
      return (
        <group>
          <Block position={[0, h * 0.4, 0]} size={[w, h * 0.8, d]} color={wall} />
          <group position={[0, h * 0.8 + 0.12, 0]} rotation={[0.18, 0, 0]}>
            <Block position={[0, 0, 0]} size={[w + 0.3, 0.12, d + 0.4]} color={accent} />
          </group>
          <Block position={[0, h * 0.38, d / 2 + 0.01]} size={[w * 0.7, h * 0.42, 0.04]} material={glass} shadow={false} />
          <Block position={[w / 2 + 0.35, 0.03, 0]} size={[0.6, 0.06, d * 0.7]} color="#5ec8f2" shadow={false} />
        </group>
      )
    }
    default: {
      const floors = h > 1.5 ? 2 : 1
      return (
        <group>
          <Block position={[0, h / 2, 0]} size={[w, h, d]} color={wall} />
          <GlassBands w={w} d={d} floors={floors} floorH={h / floors} base={0} />
          <Block position={[0, h + 0.07, 0]} size={[w + 0.1, 0.14, d + 0.1]} color={accent} />
          <Block position={[w / 2 - 0.15, h * 0.4, d / 2 + 0.2]} size={[0.05, h * 0.8, 0.4]} color={accent} />
        </group>
      )
    }
  }
}

function TreeModel({ tree }: { tree: Tree }) {
  const leaf = LEAF_TONES[Math.floor(tree.tone * LEAF_TONES.length)]!
  if (tree.palm) {
    return (
      <group position={[tree.x, 0, tree.z]} scale={tree.s}>
        <mesh position={[0, 0.9, 0]} rotation={[0, 0, 0.08]} castShadow material={paint('#a0714f')}>
          <cylinderGeometry args={[0.08, 0.13, 1.8, 6]} />
        </mesh>
        {[0, 1, 2, 3, 4].map((i) => (
          <group key={i} position={[0.07, 1.8, 0]} rotation={[0, (i * Math.PI * 2) / 5, 0]}>
            <Block position={[0.45, -0.08, 0]} size={[0.9, 0.05, 0.28]} color={leaf} />
          </group>
        ))}
      </group>
    )
  }
  return (
    <group position={[tree.x, 0, tree.z]} scale={tree.s}>
      <mesh position={[0, 0.45, 0]} castShadow material={paint('#8a5a3b')}>
        <cylinderGeometry args={[0.1, 0.14, 0.9, 6]} />
      </mesh>
      <mesh position={[0, 1.35, 0]} castShadow material={paint(leaf, 0.8)}>
        <sphereGeometry args={[0.75, 10, 8]} />
      </mesh>
    </group>
  )
}

export function WorldTown() {
  const { houses, trees, rocks } = useMemo(() => generateTown(), [])

  return (
    <group>
      {houses.map((house, index) => (
        <group key={`h${index}`} position={[house.x, 0, house.z]} rotation={[0, house.rot, 0]}>
          <HouseModel house={house} />
        </group>
      ))}
      {trees.map((tree, index) => (
        <TreeModel key={`t${index}`} tree={tree} />
      ))}
      <RockField spots={rocks} seed={17} />
    </group>
  )
}
