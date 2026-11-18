'use client'

import { useFrame } from '@react-three/fiber'
import { Component, useRef, useState, type ReactNode } from 'react'
import type { Group } from 'three'
import type { MessProp } from '@/lib/game/gigs-api'
import { HOME_TILE } from '@/lib/game/home-grid'
import type { HomeSpec } from '@/lib/game/home-buy-rules'

/*
 * Clutter lying on the floor of a house (Cleaner job). Everyone sees it; only a hired cleaner can
 * tap it, and it shrinks away before the server confirms.
 */

const LOOK: Record<string, { color: string; shape: 'paper' | 'sock' | 'box' | 'bottle' }> = {
  paper: { color: '#f4f1e8', shape: 'paper' },
  sock: { color: '#e0507a', shape: 'sock' },
  box: { color: '#b98a55', shape: 'box' },
  bottle: { color: '#3aa06b', shape: 'bottle' },
}

function Prop({ spec, prop, tappable, leaving, onTap }: { spec: HomeSpec; prop: MessProp; tappable: boolean; leaving: boolean; onTap: () => void }) {
  const group = useRef<Group>(null)
  const scale = useRef(1)
  const look = LOOK[prop.kind] ?? LOOK.paper!
  const x = spec.ox + (prop.x + 0.5) * HOME_TILE
  const z = spec.oz + (prop.z + 0.5) * HOME_TILE
  useFrame((_, delta) => {
    const g = group.current
    if (!g) return
    // Shrinks and spins away when tapped; otherwise a gentle pulse tells the cleaner it can be tapped
    scale.current = leaving ? Math.max(0, scale.current - delta * 3.2) : 1
    const pulse = tappable && !leaving ? 1 + Math.sin(performance.now() / 300) * 0.06 : 1
    g.scale.setScalar(scale.current * pulse)
    if (leaving) g.rotation.y += delta * 12
  })
  return (
    <group ref={group} position={[x, 0, z]}>
      {look.shape === 'paper' ? (
        <mesh position={[0, 0.09, 0]} castShadow>
          <icosahedronGeometry args={[0.09, 0]} />
          <meshStandardMaterial color={look.color} roughness={0.9} />
        </mesh>
      ) : null}
      {look.shape === 'sock' ? (
        <mesh position={[0, 0.03, 0]} rotation={[0, 0.6, 0]} castShadow>
          <boxGeometry args={[0.22, 0.05, 0.08]} />
          <meshStandardMaterial color={look.color} roughness={0.9} />
        </mesh>
      ) : null}
      {look.shape === 'box' ? (
        <mesh position={[0, 0.07, 0]} rotation={[0, 0.4, 0]} castShadow>
          <boxGeometry args={[0.2, 0.14, 0.16]} />
          <meshStandardMaterial color={look.color} roughness={0.85} />
        </mesh>
      ) : null}
      {look.shape === 'bottle' ? (
        <mesh position={[0, 0.05, 0]} rotation={[0, 0, 1.4]} castShadow>
          <cylinderGeometry args={[0.035, 0.035, 0.2, 10]} />
          <meshStandardMaterial color={look.color} roughness={0.4} transparent opacity={0.9} />
        </mesh>
      ) : null}
      {tappable ? (
        // Bigger invisible target so a finger can hit it
        <mesh
          position={[0, 0.12, 0]}
          onClick={(e) => {
            e.stopPropagation()
            if (!leaving) onTap()
          }}
        >
          <sphereGeometry args={[0.3, 8, 8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      ) : null}
    </group>
  )
}

/** A prop that fails to draw must never take the whole room down: it just disappears. */
class MessBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.warn('House mess failed to draw; hiding it.', error)
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

/** All the open mess in a house. `onClean` (cleaners only) is called with a prop's id when it is tapped. */
export function HomeMess(props: { spec: HomeSpec; mess: MessProp[]; onClean?: (id: string) => Promise<boolean> }) {
  return (
    <MessBoundary>
      <HomeMessProps {...props} />
    </MessBoundary>
  )
}

function HomeMessProps({ spec, mess, onClean }: { spec: HomeSpec; mess: MessProp[]; onClean?: (id: string) => Promise<boolean> }) {
  const [leaving, setLeaving] = useState<Set<string>>(new Set())
  return (
    <>
      {mess.map((p) => (
        <Prop
          key={p.id}
          spec={spec}
          prop={p}
          tappable={Boolean(onClean)}
          leaving={leaving.has(p.id)}
          onTap={() => {
            setLeaving((s) => new Set(s).add(p.id))
            void onClean?.(p.id).then((ok) => {
              if (ok) return
              setLeaving((s) => {
                const n = new Set(s)
                n.delete(p.id)
                return n
              })
            })
          }}
        />
      ))}
    </>
  )
}
