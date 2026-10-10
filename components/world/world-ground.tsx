'use client'

import { useMemo } from 'react'
import {
  CanvasTexture,
  DodecahedronGeometry,
  ExtrudeGeometry,
  IcosahedronGeometry,
  MeshStandardMaterial,
  OctahedronGeometry,
  Shape,
  SRGBColorSpace,
} from 'three'
import {
  BRIDGES,
  CAMPUS_ZONE,
  inRect,
  LANDS,
  MED_ZONE,
  type Land,
  mulberry32,
  onLand,
  ROADS,
  WATER_LEVEL,
  type Bridge,
  type Rect,
  type RockSpot,
} from '@/lib/game/world-layout'
import { Block, paint } from './materials'

const GROUND = '#B2BEB5'
const GRASS = '#9fdc76'
const DARK_GRASS = '#6faf4e'
const ZONE_GRASS = '#b4e690'

function roundedRect(w: number, d: number, radius: number) {
  const r = Math.min(radius, w / 2, d / 2)
  const x = -w / 2
  const y = -d / 2
  const shape = new Shape()
  shape.moveTo(x + r, y)
  shape.lineTo(x + w - r, y)
  shape.quadraticCurveTo(x + w, y, x + w, y + r)
  shape.lineTo(x + w, y + d - r)
  shape.quadraticCurveTo(x + w, y + d, x + w - r, y + d)
  shape.lineTo(x + r, y + d)
  shape.quadraticCurveTo(x, y + d, x, y + d - r)
  shape.lineTo(x, y + r)
  shape.quadraticCurveTo(x, y, x + r, y)
  return shape
}

function roundedSlab(w: number, d: number, radius: number, depth: number) {
  return new ExtrudeGeometry(roundedRect(w, d, radius), { depth, bevelEnabled: false, curveSegments: 8 })
}

const ISLAND_BEVEL = 0.55
const ISLAND_DEPTH = 0.14
const ISLAND_LIP = 0.09

function islandPad(w: number, d: number) {
  const innerW = w - ISLAND_BEVEL * 2
  const innerD = d - ISLAND_BEVEL * 2
  const geometry = new ExtrudeGeometry(roundedRect(innerW, innerD, 2.4), {
    depth: ISLAND_DEPTH,
    bevelEnabled: true,
    bevelThickness: ISLAND_LIP,
    bevelSize: ISLAND_BEVEL,
    bevelSegments: 5,
    curveSegments: 10,
  })
  geometry.computeVertexNormals()
  return geometry
}

function Slab({ rect, color, radius, top, depth }: { rect: Rect; color: string; radius: number; top: number; depth: number }) {
  const geometry = useMemo(() => roundedSlab(rect.w, rect.d, radius, depth), [rect.w, rect.d, radius, depth])
  return (
    <mesh
      geometry={geometry}
      material={paint(color, 0.9)}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[rect.x, top - depth, rect.z]}
      receiveShadow
    />
  )
}

function Island({ land }: { land: Land }) {
  const geometry = useMemo(() => islandPad(land.w, land.d), [land.w, land.d])
  return (
    <mesh
      geometry={geometry}
      material={paint(land.shade === 'dark' ? DARK_GRASS : GRASS, 0.9)}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[land.x, -(ISLAND_DEPTH + ISLAND_LIP), land.z]}
      castShadow
      receiveShadow
    />
  )
}

function Lowland() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, WATER_LEVEL, 0]} receiveShadow>
      <planeGeometry args={[420, 420]} />
      <meshStandardMaterial color={GROUND} roughness={0.95} />
    </mesh>
  )
}

const ROCK_GEOMETRIES = [new DodecahedronGeometry(1, 0), new IcosahedronGeometry(1, 0), new OctahedronGeometry(1, 0)]
const ROCK_MATERIALS = ['#a7adb5', '#8f969f', '#bfc4ca', '#9c938a'].map(
  (color) => new MeshStandardMaterial({ color, roughness: 0.9, flatShading: true }),
)

export function RockField({ spots, seed }: { spots: RockSpot[]; seed: number }) {
  const rocks = useMemo(() => {
    const rand = mulberry32(seed)
    return spots.map((spot) => ({
      pos: [spot.x, spot.y + spot.s * 0.35, spot.z] as [number, number, number],
      scale: [spot.s, spot.s * (0.55 + rand() * 0.4), spot.s * (0.8 + rand() * 0.4)] as [number, number, number],
      rot: [rand() * 0.6, rand() * Math.PI * 2, rand() * 0.6] as [number, number, number],
      geo: Math.floor(rand() * ROCK_GEOMETRIES.length),
      mat: Math.floor(rand() * ROCK_MATERIALS.length),
    }))
  }, [spots, seed])

  return (
    <group>
      {rocks.map((rock, index) => (
        <mesh
          key={index}
          geometry={ROCK_GEOMETRIES[rock.geo]}
          material={ROCK_MATERIALS[rock.mat]}
          position={rock.pos}
          rotation={rock.rot}
          scale={rock.scale}
          castShadow
          receiveShadow
        />
      ))}
    </group>
  )
}

function outskirtRocks() {
  const rand = mulberry32(91)
  const spots: RockSpot[] = []
  let attempts = 0
  while (spots.length < 70 && attempts < 4000) {
    attempts++
    const x = (rand() - 0.5) * 130
    const z = (rand() - 0.5) * 120
    if (onLand(x, z, -1.4)) continue
    if (BRIDGES.some((b) => inRect(x, z, b, 2)) || ROADS.some((r) => inRect(x, z, r, 1.5))) continue
    const nearIslands = onLand(x, z, -6)
    const cluster = 1 + Math.floor(rand() * 3)
    for (let i = 0; i < cluster; i++) {
      const s = (nearIslands ? 0.35 : 0.6) + rand() * (nearIslands ? 0.35 : 0.9)
      const cx = x + (rand() - 0.5) * 1.6
      const cz = z + (rand() - 0.5) * 1.6
      if (onLand(cx, cz, -s - 0.6)) continue
      spots.push({ x: cx, y: WATER_LEVEL, z: cz, s })
    }
  }
  return spots
}

function Rocks() {
  const spots = useMemo(outskirtRocks, [])
  return <RockField spots={spots} seed={91} />
}

function Fence({ rect, gapX }: { rect: Rect; gapX?: number }) {
  const height = 0.5
  const left = rect.x - rect.w / 2
  const right = rect.x + rect.w / 2
  const front = rect.z + rect.d / 2
  const back = rect.z - rect.d / 2
  const segments: { pos: [number, number, number]; size: [number, number, number] }[] = [
    { pos: [rect.x, height / 2, back], size: [rect.w, height, 0.22] },
    { pos: [left, height / 2, rect.z], size: [0.22, height, rect.d] },
    { pos: [right, height / 2, rect.z], size: [0.22, height, rect.d] },
  ]
  if (gapX !== undefined) {
    const gap = 3.4
    const leftLen = gapX - gap / 2 - left
    const rightLen = right - (gapX + gap / 2)
    segments.push({ pos: [left + leftLen / 2, height / 2, front], size: [leftLen, height, 0.22] })
    segments.push({ pos: [right - rightLen / 2, height / 2, front], size: [rightLen, height, 0.22] })
  } else {
    segments.push({ pos: [rect.x, height / 2, front], size: [rect.w, height, 0.22] })
  }
  return (
    <group>
      {segments.map((segment, index) => (
        <Block key={index} position={segment.pos} size={segment.size} color="#ffffff" />
      ))}
    </group>
  )
}

function Gate({ x, z, color }: { x: number; z: number; color: string }) {
  return (
    <group position={[x, 0, z]}>
      {[-1.9, 1.9].map((offset) => (
        <Block key={offset} position={[offset, 1.1, 0]} size={[0.45, 2.2, 0.45]} color={color} />
      ))}
      <Block position={[0, 2.3, 0]} size={[4.4, 0.45, 0.5]} color={color} />
      <Block position={[0, 2.3, 0.26]} size={[3.4, 0.3, 0.04]} color="#f2c94c" shadow={false} />
    </group>
  )
}

function Road({ rect }: { rect: Rect }) {
  const horizontal = rect.w > rect.d
  const length = horizontal ? rect.w : rect.d
  const dashes = Math.floor(length / 3)
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[rect.x, 0.025, rect.z]} receiveShadow>
        <planeGeometry args={[rect.w, rect.d]} />
        <meshStandardMaterial color="#4a5260" roughness={0.85} />
      </mesh>
      {rect.w >= 3 || rect.d >= 3
        ? Array.from({ length: dashes }, (_, i) => {
            const offset = -length / 2 + 1.5 + i * 3
            const position: [number, number, number] = horizontal
              ? [rect.x + offset, 0.035, rect.z]
              : [rect.x, 0.035, rect.z + offset]
            return (
              <mesh key={i} rotation={[-Math.PI / 2, 0, horizontal ? 0 : Math.PI / 2]} position={position}>
                <planeGeometry args={[1.2, 0.14]} />
                <meshStandardMaterial color="#ffffff" />
              </mesh>
            )
          })
        : null}
    </group>
  )
}

function BridgeSpan({ bridge }: { bridge: Bridge }) {
  const extra = 1.2
  const deckW = bridge.alongX ? bridge.w + extra : bridge.w + 0.6
  const deckD = bridge.alongX ? bridge.d + 0.6 : bridge.d + extra
  const rail = 0.12
  const railOffset = (bridge.alongX ? deckD : deckW) / 2 - rail / 2
  const span = bridge.alongX ? deckW : deckD
  return (
    <group position={[bridge.x, 0, bridge.z]}>
      <Block position={[0, -0.13, 0]} size={[deckW, 0.3, deckD]} color="#e7ecf2" />
      {[-1, 1].map((side) => (
        <Block
          key={side}
          position={bridge.alongX ? [0, 0.28, side * railOffset] : [side * railOffset, 0.28, 0]}
          size={bridge.alongX ? [span, 0.1, rail] : [rail, 0.1, span]}
          color="#2f80ed"
        />
      ))}
      {[-1, 1].flatMap((side) =>
        [-1, 1].map((end) => {
          const along = (end * (span - 0.6)) / 2
          const across = side * railOffset
          return (
            <Block
              key={`${side}${end}`}
              position={bridge.alongX ? [along, 0.12, across] : [across, 0.12, along]}
              size={[0.14, 0.42, 0.14]}
              color="#ffffff"
            />
          )
        }),
      )}
      {[-1, 1].map((end) => (
        <Block
          key={end}
          position={bridge.alongX ? [(end * span) / 4, -0.45, 0] : [0, -0.45, (end * span) / 4]}
          size={[0.4, 0.5, 0.4]}
          color="#c7d0db"
          shadow={false}
        />
      ))}
    </group>
  )
}

const LABEL_HEIGHT = 1.5
const LABEL_FONT_PX = 96

function GroundLabel({ text, position, rotation = 0 }: { text: string; position: [number, number, number]; rotation?: number }) {
  const { texture, width } = useMemo(() => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    const font = `800 ${LABEL_FONT_PX}px ${getComputedStyle(document.body).fontFamily}`
    ctx.font = font
    ctx.letterSpacing = `${LABEL_FONT_PX * 0.35}px`
    const textWidth = Math.ceil(ctx.measureText(text).width)
    canvas.width = textWidth
    canvas.height = Math.ceil(LABEL_FONT_PX * 1.25)
    ctx.font = font
    ctx.letterSpacing = `${LABEL_FONT_PX * 0.35}px`
    ctx.textBaseline = 'middle'
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.fillText(text, 0, canvas.height / 2)
    const map = new CanvasTexture(canvas)
    map.colorSpace = SRGBColorSpace
    map.anisotropy = 8
    return { texture: map, width: (LABEL_HEIGHT * canvas.width) / canvas.height }
  }, [text])

  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, rotation]} raycast={() => null}>
      <planeGeometry args={[width, LABEL_HEIGHT]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

function Zone({ rect }: { rect: Rect }) {
  const geometry = useMemo(() => roundedSlab(rect.w, rect.d, 1.2, 0.02), [rect.w, rect.d])
  return (
    <mesh geometry={geometry} material={paint(ZONE_GRASS, 0.9)} rotation={[-Math.PI / 2, 0, 0]} position={[rect.x, 0, rect.z]} receiveShadow />
  )
}

export function WorldGround() {
  return (
    <group>
      <Lowland />
      <Rocks />
      {LANDS.map((land) => (
        <Island key={land.name} land={land} />
      ))}
      <Zone rect={CAMPUS_ZONE} />
      <Zone rect={MED_ZONE} />
      <Fence rect={CAMPUS_ZONE} gapX={-8} />
      <Fence rect={MED_ZONE} gapX={MED_ZONE.x} />
      <Gate x={-8} z={CAMPUS_ZONE.z + CAMPUS_ZONE.d / 2} color="#2f80ed" />
      <Gate x={MED_ZONE.x} z={MED_ZONE.z + MED_ZONE.d / 2} color="#eb5757" />
      {BRIDGES.map((bridge, index) => (
        <BridgeSpan key={index} bridge={bridge} />
      ))}
      {ROADS.map((road, index) => (
        <Road key={index} rect={road} />
      ))}
      <GroundLabel text="AMBROSE ALLI UNIVERSITY" position={[-8, 0.05, -2]} />
      <GroundLabel text="EKPOMA–IRUEKPEN RD" position={[-28, 0.06, 4]} />
    </group>
  )
}
