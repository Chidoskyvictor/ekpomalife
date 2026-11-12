'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef } from 'react'
import { useGame } from '@/hooks/use-game'
import { useClubLive } from '@/lib/game/club-live'
import { drivePeers, driveView, useDrive } from '@/lib/game/drive'

// The street world pulls in the ride's road and buildings: loaded only when a drive starts
const StreetCanvas = dynamic(() => import('./street-world').then((m) => m.StreetCanvas), { ssr: false })

/**
 * The driving view: fills the screen over the map while you are at the wheel. Everyone who is
 * driving shares one live room, so you see each other's cars on the road.
 */
export function StreetDrive() {
  const drive = useDrive()
  const { state } = useGame()
  const live = useClubLive('map-drive', Boolean(drive && state), state?.username, '/cars/live-ticket')
  // Setting off: the same start sound as a keke or okada ride, then the road's hum under the drive
  const driving = Boolean(drive)
  useEffect(() => {
    if (!driving) return
    const start = new Audio('/audio/ride/start.mp3')
    start.volume = 0.7
    void start.play().catch(() => {})
    const road = new Audio('/audio/ride/traffic.mp3')
    road.loop = true
    road.volume = 0.25
    void road.play().catch(() => {})
    return () => {
      start.pause()
      road.pause()
    }
  }, [driving])
  // Fingers on the road view: one drags the camera around the car, two pinch it in and out
  const touches = useRef(new Map<number, { x: number; y: number }>())
  const spread = () => {
    const [a, b] = [...touches.current.values()]
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
  }
  const lift = (id: number) => {
    touches.current.delete(id)
    driveView.held = touches.current.size > 0
    driveView.at = performance.now()
  }
  drivePeers.current = live.peers.current
  if (!drive) return null
  return (
    <div
      className="pointer-events-auto absolute inset-0"
      style={{ background: '#cfd9e6', touchAction: 'none' }}
      aria-label="Driving"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
        driveView.held = true
      }}
      onPointerMove={(e) => {
        const was = touches.current.get(e.pointerId)
        if (!was) return
        const before = spread()
        touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
        if (touches.current.size >= 2) {
          const now = spread()
          if (before > 0 && now > 0) driveView.zoom = Math.max(0.6, Math.min(3, (driveView.zoom * before) / now))
        } else {
          driveView.yaw -= (e.clientX - was.x) * 0.008
          driveView.tilt = Math.max(-0.25, Math.min(1.6, driveView.tilt + (e.clientY - was.y) * 0.006))
        }
      }}
      onPointerUp={(e) => lift(e.pointerId)}
      onPointerCancel={(e) => lift(e.pointerId)}
      onWheel={(e) => {
        driveView.zoom = Math.max(0.6, Math.min(3, driveView.zoom * (e.deltaY > 0 ? 1.1 : 0.9)))
      }}
    >
      <StreetCanvas key={drive.car.id} car={drive.car} start={drive.start} send={live.sendState} peers={live.peers} roster={live.roster} />
    </div>
  )
}
