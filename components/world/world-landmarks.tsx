'use client'

import { Html } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useEffect, useState } from 'react'
import { LOCATIONS, TYPE_META } from '@/lib/game/content'
import { isMapLocation } from '@/lib/game/world-layout'
import type { LocationRecord } from '@/lib/game/types'
import { cn } from '@/lib/utils'
import { MAP } from '@/lib/game/map-theme'
import { AdminBlock } from './admin-block'
import { Block as Box, glass, paint } from './materials'

const CAMPUS_ACCENT: Record<string, string> = {
  aau_library: '#C9843A',
  mbc: '#7A63B0',
  college_of_medicine: '#C45C5C',
}

const HOSTEL_COLORS: Record<string, { wall: string; accent: string }> = {
  igbinedion_hostel: { wall: MAP.building, accent: MAP.roof },
  maryvale_hostel: { wall: MAP.buildingGray, accent: MAP.roof },
}

function CampusBuilding({ location }: { location: LocationRecord }) {
  const [w, h, d] = location.size
  const accent = CAMPUS_ACCENT[location.id] ?? '#2f80ed'
  const base = 0.16
  const fins = 6

  return (
    <group>
      <Box position={[0, base / 2, 0]} size={[w + 1, base, d + 1]} color={MAP.landLight} />
      <Box position={[0, base + h / 2, 0]} size={[w, h, d]} color={MAP.building} />
      <Box position={[0, base + h * 0.48, d / 2 + 0.02]} size={[w * 0.9, h * 0.78, 0.05]} material={glass} shadow={false} />
      <Box position={[0, base + h * 0.48, -d / 2 - 0.02]} size={[w * 0.9, h * 0.6, 0.05]} material={glass} shadow={false} />
      {Array.from({ length: fins }, (_, i) => (
        <Box
          key={i}
          position={[-w * 0.45 + (i * w * 0.9) / (fins - 1), base + h / 2, d / 2 + 0.1]}
          size={[0.1, h, 0.16]}
          color={accent}
        />
      ))}
      <Box position={[0, base + h + 0.1, 0]} size={[w + 0.3, 0.2, d + 0.3]} color={accent} />
      <Box position={[0, 1.1, d / 2 + 0.7]} size={[w * 0.4, 0.08, 1.1]} color={accent} />
      {[-1, 1].map((side) => (
        <Box key={side} position={[(side * w * 0.18), 0.55, d / 2 + 1.15]} size={[0.08, 1.1, 0.08]} color={MAP.building} />
      ))}

      {location.id === 'aau_library' ? (
        <group>
          <Box position={[0, base + h + 0.2 + 0.5, -d * 0.1]} size={[w * 0.6, 1, d * 0.65]} material={glass} />
          <Box position={[0, base + h + 1.28, -d * 0.1]} size={[w * 0.66, 0.14, d * 0.72]} color={accent} />
        </group>
      ) : null}

      {location.id === 'mbc' ? (
        <group>
          <Box position={[w * 0.25, base + h + 0.7, 0]} size={[w * 0.8, 1, d * 0.9]} color={accent} />
          <Box position={[w * 0.25, base + h + 0.7, d * 0.45 + 0.02]} size={[w * 0.7, 0.45, 0.04]} material={glass} shadow={false} />
        </group>
      ) : null}

      {location.id === 'college_of_medicine' ? (
        <group position={[0, base + h + 1, d / 2 - 0.3]}>
          <Box position={[0, 0, 0]} size={[1.5, 1.5, 0.12]} color={MAP.building} />
          <Box position={[0, 0, 0.08]} size={[1.1, 0.34, 0.04]} color={accent} shadow={false} />
          <Box position={[0, 0, 0.08]} size={[0.34, 1.1, 0.04]} color={accent} shadow={false} />
        </group>
      ) : null}
    </group>
  )
}

function Hostel({ location }: { location: LocationRecord }) {
  const [w, h, d] = location.size
  const colors = HOSTEL_COLORS[location.id] ?? { wall: '#ffe3a3', accent: '#f2b705' }
  const floors = 3
  const floorH = h / floors

  return (
    <group>
      <Box position={[0, h / 2, 0]} size={[w, h, d]} color={colors.wall} />
      {Array.from({ length: floors }, (_, i) => (
        <group key={i}>
          <Box position={[0, floorH * (i + 0.55), d / 2 + 0.01]} size={[w * 0.86, floorH * 0.45, 0.04]} material={glass} shadow={false} />
          <Box position={[0, floorH * (i + 0.55), -d / 2 - 0.01]} size={[w * 0.86, floorH * 0.45, 0.04]} material={glass} shadow={false} />
          {i > 0 ? (
            <>
              <Box position={[0, floorH * i, d / 2 + 0.28]} size={[w + 0.1, 0.08, 0.55]} color={colors.accent} />
              <Box position={[0, floorH * i + 0.18, d / 2 + 0.53]} size={[w + 0.1, 0.28, 0.04]} color={MAP.building} />
            </>
          ) : null}
        </group>
      ))}
      <Box position={[0, h + 0.08, 0]} size={[w + 0.2, 0.16, d + 0.2]} color={colors.accent} />
      <mesh position={[w * 0.3, h + 0.5, -d * 0.2]} castShadow material={paint(MAP.buildingGray)}>
        <cylinderGeometry args={[0.32, 0.32, 0.7, 12]} />
      </mesh>
      <Box position={[-w * 0.25, h + 0.4, 0]} size={[w * 0.35, 0.5, d * 0.5]} color={MAP.building} />
    </group>
  )
}

function Storefront({ location, accent }: { location: LocationRecord; accent: string }) {
  const [w, h, d] = location.size
  return (
    <group>
      <Box position={[0, h / 2, 0]} size={[w, h, d]} color={MAP.building} />
      <Box position={[0, h * 0.42, d / 2 + 0.02]} size={[w * 0.86, h * 0.62, 0.05]} material={glass} shadow={false} />
      <group position={[0, h * 0.8, d / 2 + 0.45]} rotation={[0.35, 0, 0]}>
        <Box position={[0, 0, 0]} size={[w * 0.95, 0.07, 0.9]} color={accent} />
      </group>
      <Box position={[0, h + 0.35, d / 2 - 0.1]} size={[w * 0.7, 0.5, 0.12]} color={accent} />
      <Box position={[0, h + 0.06, 0]} size={[w + 0.15, 0.12, d + 0.15]} color={MAP.roof} />
    </group>
  )
}

function Bukka({ location }: { location: LocationRecord }) {
  const [w, h, d] = location.size
  const stripes = [MAP.roof, MAP.building, MAP.roof, MAP.building, MAP.roof, MAP.building, MAP.roof]
  return (
    <group>
      <Box position={[0, h / 2, -d * 0.15]} size={[w, h, d * 0.7]} color={MAP.building} />
      <Box position={[0, h * 0.45, d * 0.2 + 0.02]} size={[w * 0.6, h * 0.4, 0.04]} material={glass} shadow={false} />
      {stripes.map((color, i) => (
        <group key={i} position={[-w / 2 + (w / stripes.length) * (i + 0.5), h * 0.9, d * 0.42]} rotation={[0.4, 0, 0]}>
          <Box position={[0, 0, 0]} size={[w / stripes.length, 0.06, 0.9]} color={color} />
        </group>
      ))}
      <Box position={[0, h + 0.06, -d * 0.15]} size={[w + 0.15, 0.12, d * 0.75]} color={MAP.roof} />
      {[-1, 1].map((side) => (
        <group key={side} position={[side * (w / 2 + 0.9), 0, d * 0.25]}>
          <Box position={[0, 0.35, 0]} size={[0.7, 0.06, 0.7]} color={MAP.building} />
          <Box position={[0, 0.17, 0]} size={[0.08, 0.34, 0.08]} color={MAP.building} />
          <Box position={[0, 0.65, 0]} size={[0.05, 0.6, 0.05]} color={MAP.building} />
          <mesh position={[0, 1, 0]} castShadow material={paint(side < 0 ? MAP.window : MAP.roof)}>
            <coneGeometry args={[0.6, 0.3, 8]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function InnovationHub({ location }: { location: LocationRecord }) {
  const [w, h, d] = location.size
  const frame = MAP.roof
  return (
    <group>
      <Box position={[0, h / 2, 0]} size={[w, h, d]} material={glass} />
      <Box position={[0, h * 0.25, 0]} size={[w * 0.8, h * 0.5, d * 0.8]} color={MAP.building} />
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <Box key={`${sx}${sz}`} position={[(sx * w) / 2, h / 2, (sz * d) / 2]} size={[0.16, h, 0.16]} color={frame} />
        )),
      )}
      <Box position={[0, h + 0.07, 0]} size={[w + 0.2, 0.14, d + 0.2]} color={frame} />
      {[-1, 0, 1].map((i) => (
        <group key={i} position={[i * (w / 3.2), h + 0.35, 0]} rotation={[-0.4, 0, 0]}>
          <Box position={[0, 0, 0]} size={[w / 3.6, 0.05, d * 0.6]} color={MAP.buildingGray} />
        </group>
      ))}
    </group>
  )
}

function LandmarkModel({ location }: { location: LocationRecord }) {
  const [w, h, d] = location.size
  const meta = TYPE_META[location.type]

  switch (location.id) {
    case 'aau_campus':
      return <AdminBlock location={location} />
    case 'sports_complex':
      return (
        <group>
          <Box position={[0, 0.05, 0]} size={[w + 1.4, 0.1, d + 1.4]} color={MAP.road} />
          <Box position={[0, 0.12, 0]} size={[w, 0.06, d]} color={MAP.vegetation} />
          <Box position={[0, 0.16, 0]} size={[0.08, 0.02, d]} color={MAP.building} shadow={false} />
          {[-1, 1].map((side) => (
            <Box key={side} position={[(side * w) / 2, 0.5, 0]} size={[0.1, 0.8, 1.6]} color={MAP.building} />
          ))}
          <Box position={[0, 0.6, -d / 2 - 1]} size={[w, 1.2, 0.8]} color={MAP.building} />
          <group position={[0, 1.4, -d / 2 - 0.9]} rotation={[-0.25, 0, 0]}>
            <Box position={[0, 0, 0]} size={[w + 0.3, 0.08, 1.4]} color={MAP.roof} />
          </group>
        </group>
      )
    case 'keke_park':
      return (
        <group>
          <Box position={[0, 0.05, 0]} size={[w, 0.1, d]} color={MAP.road} />
          {[-1.5, 0, 1.5].map((x, i) => (
            <group key={x} position={[x, 0, i % 2 === 0 ? -0.6 : 0.8]}>
              <Box position={[0, 0.55, 0]} size={[0.9, 0.9, 1.4]} color={MAP.roof} />
              <Box position={[0, 1.08, -0.1]} size={[0.95, 0.12, 1.2]} color={MAP.buildingGray} />
            </group>
          ))}
          <Box position={[w / 2 - 0.4, 1, -d / 2 + 0.4]} size={[0.15, 2, 0.15]} color={MAP.buildingGray} />
          <Box position={[w / 2 - 0.4, 2.1, -d / 2 + 0.4]} size={[1, 0.5, 0.1]} color={MAP.roof} />
        </group>
      )
    case 'ekpoma_market':
      return (
        <group>
          <Box position={[0, 0.05, 0]} size={[w, 0.1, d]} color={MAP.landLight} />
          {Array.from({ length: 6 }, (_, i) => {
            const x = -w / 2 + 1.2 + (i % 3) * 2.3
            const z = i < 3 ? -1.2 : 1.2
            const colors = [MAP.roof, MAP.vegetation, '#C8B48A', MAP.window, MAP.buildingGray, '#E2D3B4']
            return (
              <group key={i} position={[x, 0, z]}>
                <Box position={[0, 0.45, 0]} size={[1.6, 0.6, 1.4]} color={MAP.building} />
                <mesh position={[0, 1.15, 0]} rotation={[0, Math.PI / 4, 0]} castShadow material={paint(colors[i]!)}>
                  <coneGeometry args={[1.25, 0.6, 4]} />
                </mesh>
              </group>
            )
          })}
        </group>
      )
    case 'church':
      return (
        <group>
          <Box position={[0, h / 2, 0]} size={[w, h, d]} color={MAP.building} />
          <mesh position={[0, h + 0.5, 0]} castShadow material={paint(MAP.roof)}>
            <cylinderGeometry args={[0, w * 0.72, 1, 4, 1]} />
          </mesh>
          <Box position={[0, h * 0.5, d / 2 + 0.02]} size={[w * 0.3, h * 0.7, 0.04]} material={glass} shadow={false} />
          <Box position={[0, h + 1.4, d / 2 - 0.6]} size={[1, 2.6, 1]} color={MAP.building} />
          <Box position={[0, h + 3.2, d / 2 - 0.6]} size={[0.12, 1, 0.12]} color={MAP.roof} />
          <Box position={[0, h + 3.3, d / 2 - 0.6]} size={[0.6, 0.12, 0.12]} color={MAP.roof} />
        </group>
      )
    case 'mosque':
      return (
        <group>
          <Box position={[0, h / 2, 0]} size={[w, h, d]} color={MAP.building} />
          <mesh position={[0, h, 0]} castShadow material={paint(MAP.vegetation, 0.55)}>
            <sphereGeometry args={[w * 0.36, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
          <mesh position={[w / 2 + 0.3, h, d / 2 - 0.3]} castShadow material={paint(MAP.building)}>
            <cylinderGeometry args={[0.3, 0.36, h * 2, 10]} />
          </mesh>
          <mesh position={[w / 2 + 0.3, h * 2 + 0.3, d / 2 - 0.3]} castShadow material={paint(MAP.vegetation, 0.55)}>
            <coneGeometry args={[0.36, 0.7, 10]} />
          </mesh>
        </group>
      )
    case 'viewing_centre':
      return (
        <group>
          <Box position={[0, h / 2, 0]} size={[w, h, d]} color={MAP.buildingGray} />
          <Box position={[0, h + 0.08, 0]} size={[w + 0.3, 0.16, d + 0.3]} color={MAP.roof} />
          <Box position={[0, h * 0.62, d / 2 + 0.02]} size={[w * 0.8, h * 0.55, 0.06]} color={MAP.building} />
          <Box position={[0, h * 0.62, d / 2 + 0.06]} size={[w * 0.7, h * 0.42, 0.02]} material={glass} shadow={false} />
          <Box position={[w / 2 + 0.6, 0.35, 0.6]} size={[0.8, 0.7, 0.6]} color={MAP.roof} />
        </group>
      )
    case 'roadside_bukka':
      return <Bukka location={location} />
    case 'innovation_hub':
      return <InnovationHub location={location} />
    case 'campus_shop':
      return <Storefront location={location} accent="#7A63B0" />
    default:
      break
  }

  if (location.type === 'campus') return <CampusBuilding location={location} />
  if (location.type === 'hostel') return <Hostel location={location} />
  return <Storefront location={location} accent={meta.roof} />
}

type LandmarkProps = {
  location: LocationRecord
  selected: boolean
  isCurrent: boolean
  onSelect: (id: string) => void
}

function pinHeightFor(location: LocationRecord) {
  const h = location.size[1]
  if (location.type === 'worship') return h + 3.5
  if (location.id === 'aau_library' || location.id === 'mbc' || location.id === 'college_of_medicine') return h + 2.6
  return h + 1.8
}

function Landmark({ location, selected, isCurrent, onSelect }: LandmarkProps) {
  const [x, z] = location.position
  const [pinReady, setPinReady] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setPinReady(true))
    return () => cancelAnimationFrame(id)
  }, [])
  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    onSelect(location.id)
  }

  return (
    <group position={[x, 0, z]}>
      <group onClick={handleClick}>
        <LandmarkModel location={location} />
      </group>
      {pinReady ? (
      <Html position={[0, pinHeightFor(location), 0]} center zIndexRange={[20, 10]}>
        <button
          type="button"
          onClick={() => onSelect(location.id)}
          aria-label={location.name}
          aria-pressed={selected}
          className="group flex flex-col items-center gap-1 outline-none"
        >
          <span
            className={cn(
              'flex size-7 items-center justify-center rounded-full border bg-white text-sm shadow-sm transition-transform group-hover:scale-110 group-focus-visible:ring-4 group-focus-visible:ring-primary/40',
              selected ? 'scale-110 border-neutral-900' : isCurrent ? 'border-primary' : 'border-white',
            )}
          >
            <span aria-hidden="true">{location.emoji}</span>
          </span>
          <span
            className={cn(
              'whitespace-nowrap rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-semibold text-foreground shadow-sm transition-opacity',
              selected || isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100',
            )}
          >
            {isCurrent ? `You · ${location.name}` : location.name}
          </span>
        </button>
      </Html>
      ) : null}
    </group>
  )
}

export function WorldLandmarks({
  selectedId,
  currentId,
  onSelect,
}: {
  selectedId: string | null
  currentId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <group>
      {LOCATIONS.filter((location) => isMapLocation(location.id)).map((location) => (
        <Landmark
          key={location.id}
          location={location}
          selected={selectedId === location.id}
          isCurrent={currentId === location.id}
          onSelect={onSelect}
        />
      ))}
    </group>
  )
}
