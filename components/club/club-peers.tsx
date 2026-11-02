'use client'

import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef, type MutableRefObject } from 'react'
import type { Group } from 'three'
import { CharacterFigure, type FigurePose } from '@/components/look/character-figure'
import { normalizeAppearance, type Appearance } from '@/lib/game/look'
import type { Peer } from '@/lib/game/club-live'

/** One other player: glides to their latest position and plays their pose, with a name tag. */
function PeerFigure({ peer, bubble, onTap }: { peer: Peer; bubble?: string; onTap?: (peer: Peer) => void }) {
  const body = useRef<Group>(null)
  const moving = useRef(false)
  const pose = useRef<FigurePose | null>(null)
  const placed = useRef(false)

  useFrame((_, delta) => {
    const group = body.current
    const s = peer.state
    if (!group) return
    group.visible = !!s
    if (!s) return
    if (!placed.current) {
      group.position.set(s.x, s.y, s.z)
      group.rotation.y = s.h
      placed.current = true
    }
    // Smooth toward the last update (they arrive ~6 times a second)
    const k = Math.min(1, delta * 10)
    group.position.x += (s.x - group.position.x) * k
    group.position.y += (s.y - group.position.y) * k
    group.position.z += (s.z - group.position.z) * k
    let turn = s.h - group.rotation.y
    turn = Math.atan2(Math.sin(turn), Math.cos(turn))
    group.rotation.y += turn * k
    moving.current = s.moving
    pose.current = s.pose === 'walk' || s.pose === 'idle' ? null : s.pose
  })

  return (
    <group ref={body} visible={false}>
      <CharacterFigure appearance={normalizeAppearance(peer.appearance as Partial<Appearance>)} moving={moving} pose={pose} />
      {onTap ? (
        // See-through capsule over the body takes the tap (opens their card)
        <mesh
          position={[0, 0.95, 0]}
          onClick={(e) => {
            e.stopPropagation()
            onTap(peer)
          }}
        >
          <capsuleGeometry args={[0.32, 1.2, 4, 8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      ) : null}
      <Html position={[0, 2.15, 0]} center distanceFactor={9} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
        <span
          style={{
            display: 'inline-block',
            maxWidth: bubble ? 200 : 120,
            overflow: 'hidden',
            padding: '2px 8px',
            borderRadius: 999,
            background: peer.vip ? 'rgba(201,162,39,0.9)' : 'rgba(17,12,40,0.75)',
            color: '#fff',
            fontSize: 12,
            fontWeight: 700,
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {bubble ?? `@${peer.username}`}
        </span>
      </Html>
    </group>
  )
}

/** Everyone else in your crowd group. `roster` changes when people join or leave. */
export function ClubPeers({
  peers,
  roster,
  bubbles,
  onTap,
}: {
  peers: MutableRefObject<Map<string, Peer>>
  roster: number
  /** Reactions / lines over people's heads, by userId (shown in place of their name for a moment). */
  bubbles?: Record<string, string>
  onTap?: (peer: Peer) => void
}) {
  void roster
  return (
    <>
      {[...peers.current.values()].map((peer) => (
        <PeerFigure key={peer.userId} peer={peer} bubble={bubbles?.[peer.userId]} onTap={onTap} />
      ))}
    </>
  )
}
