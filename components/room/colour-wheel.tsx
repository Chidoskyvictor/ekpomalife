'use client'

import { useEffect, useRef, useState } from 'react'
import styles from './colour-wheel.module.css'

/* HSL <-> hex (h 0-360, s and l 0-1) */
function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(c * 255).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s, l]
}

const HEX = /^#[0-9a-f]{6}$/i

/**
 * Pick any colour, Lagos Life style: drag on the wheel for the colour (round = hue, out from the
 * middle = how strong), the slider for lighter / darker, or type a hex code.
 */
export function ColourWheel({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const [hsl, setHsl] = useState<[number, number, number]>(() => hexToHsl(HEX.test(value) ? value : '#c8a27a'))
  const [typed, setTyped] = useState(value.replace('#', '').toUpperCase())
  const wheel = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  // Follow outside changes (e.g. Cancel then pick again)
  useEffect(() => {
    if (!HEX.test(value)) return
    if (hslToHex(...hsl) === value.toLowerCase()) return
    setHsl(hexToHsl(value))
    setTyped(value.replace('#', '').toUpperCase())
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the outside value moves
  }, [value])

  const commit = (next: [number, number, number]) => {
    setHsl(next)
    const hex = hslToHex(...next)
    setTyped(hex.replace('#', '').toUpperCase())
    onChange(hex)
  }

  const fromPointer = (clientX: number, clientY: number) => {
    const el = wheel.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const dx = clientX - (r.left + r.width / 2)
    const dy = clientY - (r.top + r.height / 2)
    const radius = r.width / 2
    const s = Math.min(1, Math.hypot(dx, dy) / radius)
    // conic-gradient starts at the top and goes clockwise
    const hue = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360
    commit([hue, s, hsl[2]])
  }

  const [h, s, l] = hsl
  const angle = (h * Math.PI) / 180
  const dot = { left: `${50 + Math.sin(angle) * s * 50}%`, top: `${50 - Math.cos(angle) * s * 50}%` }
  const hex = hslToHex(h, s, l)

  return (
    <div className={styles.wrap}>
      <div
        ref={wheel}
        className={styles.wheel}
        style={{ filter: `brightness(${0.35 + l * 1.3})` }}
        onPointerDown={(e) => {
          dragging.current = true
          e.currentTarget.setPointerCapture(e.pointerId)
          fromPointer(e.clientX, e.clientY)
        }}
        onPointerMove={(e) => {
          if (dragging.current) fromPointer(e.clientX, e.clientY)
        }}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
        role="slider"
        aria-label="Colour"
        aria-valuetext={hex}
        aria-valuenow={Math.round(h)}
        aria-valuemin={0}
        aria-valuemax={360}
      >
        <span className={styles.dot} style={{ ...dot, background: hex }} aria-hidden="true" />
      </div>

      <div className={styles.side}>
        <span className={styles.preview} style={{ background: `linear-gradient(90deg, ${hex} 50%, ${hslToHex(h, s, Math.max(0, l - 0.08))} 50%)` }} aria-hidden="true" />
        <label className={styles.label}>
          Lighter or darker
          <input
            type="range"
            min={8}
            max={92}
            value={Math.round(l * 100)}
            onChange={(e) => commit([h, s, Number(e.target.value) / 100])}
            className={styles.range}
            style={{ background: `linear-gradient(90deg, ${hslToHex(h, s, 0.08)}, ${hslToHex(h, s, 0.5)}, ${hslToHex(h, s, 0.92)})` }}
          />
        </label>
        <label className={styles.hex}>
          <span aria-hidden="true">#</span>
          <input
            value={typed}
            maxLength={6}
            inputMode="text"
            autoCapitalize="characters"
            spellCheck={false}
            aria-label="Hex colour code"
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9a-f]/gi, '').toUpperCase()
              setTyped(v)
              if (v.length === 6) {
                const next = hexToHsl(`#${v}`)
                setHsl(next)
                onChange(`#${v.toLowerCase()}`)
              }
            }}
          />
        </label>
      </div>
    </div>
  )
}
