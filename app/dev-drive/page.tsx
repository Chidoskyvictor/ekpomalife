'use client'

import { notFound, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import { StreetCanvas } from '@/components/drive/street-world'
import type { Peer } from '@/lib/game/club-live'
import { driveView } from '@/lib/game/drive'
import { driveStartFrom, roadById, spotAt } from '@/lib/game/drive-road'

/** Development only: the street world without signing in. `?at=<place id>&time=21:30` */
function Inner() {
  const q = useSearchParams()
  const start = useMemo(() => {
    // `?road=<id>&s=<m>&off=<m>&h=<rad>` puts the car anywhere on a road instead
    const rid = q.get('road')
    if (rid) {
      const sp = spotAt(roadById(rid).id, Number(q.get('s') ?? 100), Number(q.get('off') ?? 8))
      return { x: sp.x, z: sp.z, h: q.get('h') ? Number(q.get('h')) : Math.atan2(sp.dx, sp.dz) }
    }
    return driveStartFrom(q.get('at') ?? 'aau-gate')
  }, [q])
  useEffect(() => {
    driveView.yaw = Number(q.get('yaw') ?? 0)
    driveView.tilt = Number(q.get('tilt') ?? 0)
    driveView.zoom = Number(q.get('zoom') ?? 1)
  }, [q])
  const peers = useRef(new Map<string, Peer>())
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000' }}>
      <StreetCanvas car={{ model: 'gt3', color: '#c94f4f' }} start={start} send={() => {}} peers={peers} roster={0} />
    </div>
  )
}

export default function DevDrive() {
  if (process.env.NODE_ENV === 'production') notFound()
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  )
}
