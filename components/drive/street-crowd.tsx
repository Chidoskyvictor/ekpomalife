'use client'

import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, useState } from 'react'
import { CharacterFigure } from '@/components/look/character-figure'
import { driveTelemetry } from '@/lib/game/drive'
import { normalizeAppearance, type Appearance } from '@/lib/game/look'
import { LANDMARKS } from './town-lots'

/*
 * A few people standing at the entrance of the destinations nearest to you: the same animated
 * characters the players use. Only the two closest places have anyone out, so the cost stays
 * the same wherever you drive.
 */

const TOPS = ['#d95f3b', '#3d6fb5', '#f0e3c0', '#5a9a5a', '#c94f8a', '#e0b13c', '#7a4fb5', '#f2f2f2']
const SKINS = ['#8a5a3b', '#6b4226', '#a9744f', '#5C3317']
const SHOWN = 2
const PER_PLACE = 3
const REACH = 150

export function EntranceCrowd() {
  const [near, setNear] = useState<string[]>([])
  const last = useRef('')
  const clock = useRef(0)
  const still = useRef(false)
  useFrame((_, dt) => {
    clock.current += dt
    if (clock.current < 0.6) return
    clock.current = 0
    const { x, z } = driveTelemetry
    const ids = LANDMARKS
      .map((l) => ({ id: l.id, d: Math.hypot(l.x - x, l.z - z) }))
      .filter((l) => l.d < REACH)
      .sort((a, b) => a.d - b.d)
      .slice(0, SHOWN)
      .map((l) => l.id)
    const key = ids.join(',')
    if (key !== last.current) {
      last.current = key
      setNear(ids)
    }
  })
  return (
    <>
      {near.map((id) => (
        <Group key={id} id={id} still={still} />
      ))}
    </>
  )
}

function Group({ id, still }: { id: string; still: React.RefObject<boolean> }) {
  const lm = LANDMARKS.find((l) => l.id === id)!
  const people = useMemo(
    () =>
      Array.from({ length: PER_PLACE }, (_, i) => {
        const h = Math.abs([...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7)) + i * 5
        const sin = Math.sin(lm.yaw)
        const cos = Math.cos(lm.yaw)
        // In front of the door, on the pavement, a little apart; the first looks at the road, the others at each other
        const out = lm.depth / 2 + 1.1 + (i === 0 ? 0.3 : 0)
        const lateral = (i - 1) * 1.25
        return {
          x: lm.x + sin * out + cos * lateral,
          z: lm.z + cos * out - sin * lateral,
          yaw: i === 0 ? lm.yaw : lm.yaw + (i === 1 ? Math.PI / 2 : -Math.PI / 2),
          look: normalizeAppearance({
            body: (h + i) % 2 ? 'woman' : 'man',
            skin: SKINS[h % SKINS.length],
            topColor: TOPS[(h + i * 3) % TOPS.length],
            bottomColor: i % 2 ? '#2a2a2a' : '#3a4a6a',
          } as Partial<Appearance>),
        }
      }),
    [id, lm],
  )
  return (
    <>
      {people.map((p, i) => (
        <group key={i} position={[p.x, 0.2, p.z]} rotation={[0, p.yaw, 0]}>
          <CharacterFigure appearance={p.look} moving={still} />
        </group>
      ))}
    </>
  )
}
