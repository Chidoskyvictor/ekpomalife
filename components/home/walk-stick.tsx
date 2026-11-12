'use client'

import { useRef, useState } from 'react'
import styles from './walk-stick.module.css'

/** Shared with the street scene's player: -1..1 each way, screen directions (z up the screen is -1). */
export const walkStick = { x: 0, z: 0 }

const RADIUS = 44

/** A thumb joystick for walking outside: drag the knob, let go to stop. */
export function WalkStick() {
  const base = useRef<HTMLDivElement>(null)
  const [knob, setKnob] = useState<[number, number]>([0, 0])
  const id = useRef<number | null>(null)

  const move = (clientX: number, clientY: number) => {
    const el = base.current
    if (!el) return
    const r = el.getBoundingClientRect()
    let dx = clientX - (r.left + r.width / 2)
    let dy = clientY - (r.top + r.height / 2)
    const d = Math.hypot(dx, dy)
    if (d > RADIUS) {
      dx = (dx / d) * RADIUS
      dy = (dy / d) * RADIUS
    }
    setKnob([dx, dy])
    walkStick.x = dx / RADIUS
    walkStick.z = dy / RADIUS
  }
  const release = () => {
    id.current = null
    setKnob([0, 0])
    walkStick.x = 0
    walkStick.z = 0
  }

  return (
    <div
      ref={base}
      className={styles.base}
      role="application"
      aria-label="Walk: drag to move"
      onPointerDown={(e) => {
        id.current = e.pointerId
        e.currentTarget.setPointerCapture(e.pointerId)
        move(e.clientX, e.clientY)
      }}
      onPointerMove={(e) => {
        if (id.current === e.pointerId) move(e.clientX, e.clientY)
      }}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <span className={styles.knob} style={{ transform: `translate(${knob[0]}px, ${knob[1]}px)` }} />
    </div>
  )
}
