'use client'

import { useEffect, useRef, useState } from 'react'
import { drivePeers, driveTelemetry } from '@/lib/game/drive'
import { ROADS, placeSpot } from '@/lib/game/drive-road'
import { racesNow } from '@/lib/game/races-api'
import styles from './mini-map.module.css'

/** Game metres from the middle of the map to its edge, small and tapped-open. */
const REACH = { small: 220, big: 420 }
/** Racers get these colours in slot order; everyone else on the road is grey. */
const RACER_COLOURS = ['#f59e0b', '#ef4444', '#22c55e', '#a855f7', '#06b6d4', '#ec4899']
const ROAD_WIDTH = { highway: 5, road: 3.2, street: 2.2 } as const

/**
 * A round map in the corner while you drive: turns with the car (the way you face is up), shows the
 * roads around you, other drivers (racers in colour, with their letter), and the finish or place you
 * are heading to. Tap to make it bigger.
 */
export function MiniMap({ destId }: { destId: string | null }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [big, setBig] = useState(false)
  const size = big ? 196 : 112

  useEffect(() => {
    const el = canvas.current
    const ctx = el?.getContext('2d')
    if (!el || !ctx) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    el.width = size * dpr
    el.height = size * dpr
    const reach = big ? REACH.big : REACH.small

    const draw = () => {
      const { x, z, h } = driveTelemetry
      const half = size / 2
      const k = half / reach
      const cos = Math.cos(h)
      const sin = Math.sin(h)
      // World → map: the car's forward is up, its right is right
      const at = (wx: number, wz: number): [number, number] => {
        const dx = wx - x
        const dz = wz - z
        return [half + (dx * -cos + dz * sin) * k, half - (dx * sin + dz * cos) * k]
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, size, size)
      ctx.save()
      ctx.beginPath()
      ctx.arc(half, half, half, 0, Math.PI * 2)
      ctx.clip()
      ctx.fillStyle = '#e7ecdf'
      ctx.fillRect(0, 0, size, size)

      // Roads near the car
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#ffffff'
      for (const road of ROADS) {
        ctx.lineWidth = ROAD_WIDTH[road.kind] * (big ? 1.2 : 1)
        ctx.beginPath()
        let on = false
        for (const [px, pz] of road.pts) {
          const far = Math.abs(px - x) > reach * 1.6 || Math.abs(pz - z) > reach * 1.6
          if (far) {
            on = false
            continue
          }
          const [mx, my] = at(px, pz)
          if (on) ctx.lineTo(mx, my)
          else ctx.moveTo(mx, my)
          on = true
        }
        ctx.stroke()
      }

      // Where you are heading: a chequered flag (clamped to the rim when it is far)
      const dest = destId ? placeSpot(destId) : null
      if (dest) {
        let [fx, fy] = at(dest.x, dest.z)
        const dist = Math.hypot(fx - half, fy - half)
        if (dist > half - 9) {
          fx = half + ((fx - half) / dist) * (half - 9)
          fy = half + ((fy - half) / dist) * (half - 9)
        }
        ctx.font = `${big ? 18 : 14}px system-ui`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('🏁', fx, fy)
      }

      // Other drivers: racers in their colour with a letter, the rest grey
      const race = racesNow().mine
      const racing = race && (race.status === 'open' || race.status === 'running') ? race : null
      for (const peer of drivePeers.current.values()) {
        const s = peer.state
        if (!s || s.pose !== 'sit') continue
        const [px, py] = at(s.x, s.z)
        if (Math.hypot(px - half, py - half) > half - 4) continue
        const racer = racing?.racers.find((r) => r.name === peer.username)
        ctx.beginPath()
        ctx.arc(px, py, racer ? 6 : 4, 0, Math.PI * 2)
        ctx.fillStyle = racer ? RACER_COLOURS[racer.slot % RACER_COLOURS.length]! : '#9ca3af'
        ctx.fill()
        ctx.lineWidth = 1.5
        ctx.strokeStyle = '#ffffff'
        ctx.stroke()
        if (racer) {
          ctx.fillStyle = '#ffffff'
          ctx.font = '700 8px system-ui'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(racer.name.slice(0, 1).toUpperCase(), px, py + 0.5)
        }
      }

      // You: an arrow in the middle, pointing up
      ctx.beginPath()
      ctx.moveTo(half, half - 8)
      ctx.lineTo(half + 6, half + 6)
      ctx.lineTo(half, half + 3)
      ctx.lineTo(half - 6, half + 6)
      ctx.closePath()
      ctx.fillStyle = '#2563eb'
      ctx.fill()
      ctx.lineWidth = 1.5
      ctx.strokeStyle = '#ffffff'
      ctx.stroke()
      ctx.restore()
    }

    draw()
    const id = window.setInterval(draw, 150)
    return () => window.clearInterval(id)
  }, [big, size, destId])

  return (
    <button
      type="button"
      className={styles.map}
      style={{ width: size, height: size }}
      aria-label={big ? 'Make the map smaller' : 'Make the map bigger'}
      onClick={() => setBig((b) => !b)}
    >
      <canvas ref={canvas} style={{ width: size, height: size }} aria-hidden="true" />
    </button>
  )
}
