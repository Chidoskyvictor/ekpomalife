'use client'

import dynamic from 'next/dynamic'
import { useEffect } from 'react'
import { useGame } from '@/hooks/use-game'
import { useClubLive } from '@/lib/game/club-live'
import { useDrive } from '@/lib/game/drive'

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
  if (!drive) return null
  return (
    <div className="pointer-events-auto absolute inset-0" style={{ background: '#cfd9e6' }} aria-label="Driving">
      <StreetCanvas key={drive.car.id} car={drive.car} start={drive.start} send={live.sendState} peers={live.peers} roster={live.roster} />
    </div>
  )
}
