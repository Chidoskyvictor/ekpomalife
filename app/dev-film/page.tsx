'use client'

import { notFound, useSearchParams } from 'next/navigation'
import { Suspense, useMemo, useRef } from 'react'
import { FilmRig, type FilmShot } from '@/components/drive/film-rig'
import { StreetCanvas } from '@/components/drive/street-world'
import type { Peer } from '@/lib/game/club-live'
import { driveStartFrom, roadUnder, spotAt } from '@/lib/game/drive-road'

/**
 * Development only: film mode for the trailer. The white Benz leads, the silver Lexus pushes it,
 * hazards on, no HUD. `?shot=chase|between|wheel|whip|top|front&at=<place>&time=08:30&speed=30`
 * (`time` pins the light; morning by default).
 */
function Inner() {
  const q = useSearchParams()
  const start = useMemo(() => driveStartFrom(q.get('at') ?? 'aau-gate'), [q])
  const on = useMemo(() => {
    return roadUnder(start.x, start.z)
  }, [start])
  const peers = useRef(new Map<string, Peer>())
  const shot = (q.get('shot') ?? 'chase') as FilmShot
  const speed = Number(q.get('speed') ?? 30)
  // `?road=expressway&s=6000&dir=1` starts the cars anywhere (default: the expressway toward Auchi, past the
  // UKE, G1 ROAD and G2 ROAD gantries; Ihumudumu Road from s=1420 passes IHUMUDUMU ROAD, G2 and G1)
  const roadId = q.get('road') ?? (q.get('at') ? null : 'expressway')
  if (roadId) {
    const s = Number(q.get('s') ?? 6000)
    const dir = Number(q.get('dir') ?? 1)
    const sp = spotAt(roadId, s, dir * 4)
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#000' }}>
        <StreetCanvas car={{ model: 'gla', color: '#f2f2ef' }} start={{ x: sp.x, z: sp.z, h: Math.atan2(sp.dx * dir, sp.dz * dir) }} send={() => {}} peers={peers} roster={0} film={<FilmRig road={roadId} s0={s} dir={dir} shot={shot} speed={speed} />} />
      </div>
    )
  }
  if (!on) return <p style={{ color: '#fff' }}>No road at this place.</p>
  // Heading → direction along the road: compare with the road's own direction at that point
  const road = on.road
  const i = Math.max(1, road.at.findIndex((a) => a >= on.s))
  const [ax, az] = road.pts[i - 1]!
  const [bx, bz] = road.pts[i]!
  const dir = Math.sign((bx - ax) * Math.sin(start.h) + (bz - az) * Math.cos(start.h)) || 1
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000' }}>
      <StreetCanvas
        car={{ model: 'gla', color: '#f2f2ef' }}
        start={start}
        send={() => {}}
        peers={peers}
        roster={0}
        film={<FilmRig road={road.id} s0={on.s + dir * Number(q.get('ahead') ?? 0)} dir={dir} shot={shot} speed={speed} />}
      />
    </div>
  )
}

export default function DevFilm() {
  if (process.env.NODE_ENV === 'production') notFound()
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  )
}
