'use client'

import { Html } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { LOCATIONS, TYPE_META } from '@/lib/game/content'
import type { LocationRecord } from '@/lib/game/types'
import { cn } from '@/lib/utils'

function Box({
  position,
  size,
  color,
}: {
  position: [number, number, number]
  size: [number, number, number]
  color: string
}) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} />
    </mesh>
  )
}

function LandmarkModel({ location }: { location: LocationRecord }) {
  const [w, h, d] = location.size
  const meta = TYPE_META[location.type]

  switch (location.id) {
    case 'sports_complex':
      return (
        <group>
          <Box position={[0, 0.05, 0]} size={[w + 1.4, 0.1, d + 1.4]} color="#d9c7a3" />
          <Box position={[0, 0.12, 0]} size={[w, 0.06, d]} color="#4fa35e" />
          <Box position={[0, 0.16, 0]} size={[0.08, 0.02, d]} color="#ffffff" />
          {[-1, 1].map((side) => (
            <Box key={side} position={[(side * w) / 2, 0.5, 0]} size={[0.1, 0.8, 1.6]} color="#ffffff" />
          ))}
          <Box position={[0, 0.6, -d / 2 - 1]} size={[w, 1.2, 0.8]} color="#e6e1d4" />
        </group>
      )
    case 'keke_park':
      return (
        <group>
          <Box position={[0, 0.05, 0]} size={[w, 0.1, d]} color="#8f9aa3" />
          {[-1.5, 0, 1.5].map((x, i) => (
            <group key={x} position={[x, 0, i % 2 === 0 ? -0.6 : 0.8]}>
              <Box position={[0, 0.55, 0]} size={[0.9, 0.9, 1.4]} color="#f2c230" />
              <Box position={[0, 1.08, -0.1]} size={[0.95, 0.12, 1.2]} color="#1f6b45" />
            </group>
          ))}
          <Box position={[w / 2 - 0.4, 1, -d / 2 + 0.4]} size={[0.15, 2, 0.15]} color="#3b3b3b" />
        </group>
      )
    case 'ekpoma_market':
      return (
        <group>
          <Box position={[0, 0.05, 0]} size={[w, 0.1, d]} color="#d8c7a8" />
          {Array.from({ length: 6 }, (_, i) => {
            const x = -w / 2 + 1.2 + (i % 3) * 2.3
            const z = i < 3 ? -1.2 : 1.2
            const colors = ['#d9622b', '#2f8f5b', '#e2b63a', '#3a7fc4', '#d94a72', '#7a5cc2']
            return (
              <group key={i} position={[x, 0, z]}>
                <Box position={[0, 0.45, 0]} size={[1.6, 0.6, 1.4]} color="#b88a5c" />
                <mesh position={[0, 1.15, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
                  <coneGeometry args={[1.25, 0.6, 4]} />
                  <meshStandardMaterial color={colors[i]} flatShading />
                </mesh>
              </group>
            )
          })}
        </group>
      )
    case 'church':
      return (
        <group>
          <Box position={[0, h / 2, 0]} size={[w, h, d]} color={meta.color} />
          <mesh position={[0, h + 0.5, 0]} rotation={[0, 0, 0]} castShadow>
            <cylinderGeometry args={[0, w * 0.72, 1, 4, 1]} />
            <meshStandardMaterial color={meta.roof} flatShading />
          </mesh>
          <Box position={[0, h + 1.4, d / 2 - 0.6]} size={[1, 2.6, 1]} color={meta.color} />
          <Box position={[0, h + 3.2, d / 2 - 0.6]} size={[0.12, 1, 0.12]} color="#5b4630" />
          <Box position={[0, h + 3.3, d / 2 - 0.6]} size={[0.6, 0.12, 0.12]} color="#5b4630" />
        </group>
      )
    case 'mosque':
      return (
        <group>
          <Box position={[0, h / 2, 0]} size={[w, h, d]} color="#f4f1e8" />
          <mesh position={[0, h, 0]} castShadow>
            <sphereGeometry args={[w * 0.36, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#2f8f5b" />
          </mesh>
          <mesh position={[w / 2 + 0.3, h, d / 2 - 0.3]} castShadow>
            <cylinderGeometry args={[0.3, 0.36, h * 2, 8]} />
            <meshStandardMaterial color="#f4f1e8" />
          </mesh>
          <mesh position={[w / 2 + 0.3, h * 2 + 0.3, d / 2 - 0.3]} castShadow>
            <coneGeometry args={[0.36, 0.7, 8]} />
            <meshStandardMaterial color="#2f8f5b" />
          </mesh>
        </group>
      )
    case 'viewing_centre':
      return (
        <group>
          <Box position={[0, h / 2, 0]} size={[w, h, d]} color={meta.color} />
          <Box position={[0, h + 0.08, 0]} size={[w + 0.3, 0.16, d + 0.3]} color={meta.roof} />
          <Box position={[0, h * 0.62, d / 2 + 0.02]} size={[w * 0.7, h * 0.5, 0.06]} color="#1d2b3a" />
          <Box position={[0, h * 0.62, d / 2 + 0.06]} size={[w * 0.6, h * 0.38, 0.02]} color="#4fa35e" />
          <Box position={[w / 2 + 0.6, 0.35, 0.6]} size={[0.8, 0.7, 0.6]} color="#c4683a" />
        </group>
      )
    default:
      break
  }

  if (location.type === 'campus') {
    return (
      <group>
        <Box position={[0, 0.08, 0]} size={[w + 1, 0.16, d + 1]} color="#e7e0cf" />
        <Box position={[0, h / 2 + 0.16, 0]} size={[w, h, d]} color={meta.color} />
        <Box position={[0, h + 0.26, 0]} size={[w + 0.4, 0.2, d + 0.4]} color={meta.roof} />
        {Array.from({ length: 5 }, (_, i) => (
          <Box
            key={i}
            position={[-w / 2 + 0.6 + (i * (w - 1.2)) / 4, h / 2 + 0.16, d / 2 + 0.25]}
            size={[0.22, h, 0.22]}
            color="#ffffff"
          />
        ))}
        {[0.33, 0.66].map((t) => (
          <Box key={t} position={[0, 0.16 + h * t, d / 2 + 0.01]} size={[w - 0.4, 0.3, 0.02]} color="#8fb4c9" />
        ))}
      </group>
    )
  }

  if (location.type === 'hostel') {
    return (
      <group>
        <Box position={[0, h / 2, 0]} size={[w, h, d]} color={meta.color} />
        <mesh position={[0, h + 0.45, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
          <coneGeometry args={[Math.max(w, d) * 0.78, 0.9, 4]} />
          <meshStandardMaterial color={meta.roof} flatShading />
        </mesh>
        {[0.3, 0.7].map((t) =>
          [-1, 0, 1].map((col) => (
            <Box key={`${t}${col}`} position={[col * 1.4, h * t, d / 2 + 0.01]} size={[0.7, 0.5, 0.02]} color="#6f9fb8" />
          )),
        )}
      </group>
    )
  }

  return (
    <group>
      <Box position={[0, h / 2, 0]} size={[w, h, d]} color={meta.color} />
      <mesh position={[0, h + 0.4, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[Math.max(w, d) * 0.78, 0.8, 4]} />
        <meshStandardMaterial color={meta.roof} flatShading />
      </mesh>
      <Box position={[0, h * 0.75, d / 2 + 0.35]} size={[w * 0.85, 0.08, 0.7]} color={meta.roof} />
    </group>
  )
}

type LandmarkProps = {
  location: LocationRecord
  selected: boolean
  isCurrent: boolean
  onSelect: (id: string) => void
}

function Landmark({ location, selected, isCurrent, onSelect }: LandmarkProps) {
  const [x, z] = location.position
  const pinHeight = location.size[1] + (location.type === 'worship' ? 3.5 : 1.8)
  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    onSelect(location.id)
  }

  return (
    <group position={[x, 0, z]}>
      <group onClick={handleClick}>
        <LandmarkModel location={location} />
      </group>
      <Html position={[0, pinHeight, 0]} center zIndexRange={[20, 10]}>
        <button
          type="button"
          onClick={() => onSelect(location.id)}
          aria-label={location.name}
          aria-pressed={selected}
          className="group flex flex-col items-center gap-1 outline-none"
        >
          <span
            className={cn(
              'flex size-9 items-center justify-center rounded-full border-2 bg-white text-lg shadow-md transition-transform group-hover:scale-110 group-focus-visible:ring-4 group-focus-visible:ring-primary/40',
              selected ? 'scale-110 border-primary' : isCurrent ? 'border-gold' : 'border-white',
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
      {LOCATIONS.map((location) => (
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
