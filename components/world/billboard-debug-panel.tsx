'use client'

import { useEffect, useMemo, useState } from 'react'
import { OPEN_AD_EVENT } from '@/lib/game/billboard-ad'
import { MAP_ZONES, firstSlabUV, frontSlabUV } from '@/lib/game/world-layout'
import { useZoneDebug } from './zone-debug-context'

const BILLBOARDS = MAP_ZONES.filter((zone) => zone.model.startsWith('billboard'))

function round(n: number, digits = 4) {
  const p = 10 ** digits
  return Math.round(n * p) / p
}

/**
 * Dev-only card for the billboards: pick one (or tap it on the map) and nudge
 * placement / size. Changes save in this browser until pasted into world-layout.ts.
 */
export function BillboardDebugPanel() {
  const ctx = useZoneDebug()
  // Starts collapsed so it doesn't cover the HUD; tapping a billboard opens it
  const [open, setOpen] = useState(false)
  const [id, setId] = useState(BILLBOARDS[0]?.id ?? '')

  // Tapping a billboard selects it here
  useEffect(() => {
    const onTap = (event: Event) => {
      const tapped = (event as CustomEvent<string>).detail
      if (BILLBOARDS.some((b) => b.id === tapped)) {
        setId(tapped)
        setOpen(true)
      }
    }
    window.addEventListener(OPEN_AD_EVENT, onTap)
    return () => window.removeEventListener(OPEN_AD_EVENT, onTap)
  }, [])

  const base = useMemo(() => BILLBOARDS.find((b) => b.id === id), [id])
  if (!ctx?.enabled || !base) return null

  const o = ctx.overrides[id] ?? {}
  const x = o.x ?? base.position[0]
  const z = o.z ?? base.position[1]
  const rotation = o.rotation ?? base.rotation
  const modelY = o.modelY ?? base.modelY ?? 0
  const scaleMul = o.scaleMul ?? base.scaleMul ?? 1
  const south = base.slab === 'south'
  const [u, v] = south ? frontSlabUV(x, z) : firstSlabUV(x, z)
  const extras = modelY !== 0 || scaleMul !== 1 ? `, undefined, undefined, { modelY: ${round(modelY, 3)}, scaleMul: ${round(scaleMul, 3)} }` : ''
  // Second-slab billboards use southZone(...) with an options object
  const snippet = south
    ? `southZone('${base.id}', '${base.label}', ${round(u)}, ${round(v)}, '${base.model}', [${base.footprint.join(', ')}], { rotation: ${round(rotation)}, modelY: ${round(modelY, 3)}, scaleMul: ${round(scaleMul, 3)} }),`
    : `zone('${base.id}', '${base.label}', ${round(u)}, ${round(v)}, '${base.model}', [${base.footprint.join(', ')}], ${round(rotation)}${extras}),`

  const sliders = [
    ['Left / right', 'x', x, base.position[0] - 40, base.position[0] + 40, 0.25],
    ['Forward / back', 'z', z, base.position[1] - 40, base.position[1] + 40, 0.25],
    ['Size', 'scaleMul', scaleMul, 0.3, 3, 0.05],
    ['Height', 'modelY', modelY, -2, 6, 0.05],
  ] as const

  // Rotate works in degrees; stored as radians, wrapped to −180°…180°
  const degrees = Math.round((rotation * 180) / Math.PI)
  const setDegrees = (deg: number) => {
    const wrapped = ((((deg + 180) % 360) + 360) % 360) - 180
    ctx.setOverride(id, { rotation: (wrapped * Math.PI) / 180 })
  }

  return (
    <div
      className="pointer-events-auto absolute right-3 top-14 z-40 w-[min(100vw-1.5rem,17rem)] rounded-xl border border-black/10 bg-white/92 p-3 text-xs text-[#122846] shadow-lg backdrop-blur-sm"
      aria-label="Billboard debug"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <button type="button" className="font-medium" onClick={() => setOpen((value) => !value)}>
          Billboard debug {open ? '▾' : '▸'}
        </button>
        <button type="button" className="text-[#5c6b7a] underline" onClick={() => ctx.clearOverride(id)}>
          Reset
        </button>
      </div>
      {open ? (
        <div className="space-y-2">
          <div className="grid grid-cols-6 gap-1" role="group" aria-label="Billboard">
            {BILLBOARDS.map((b, i) => (
              <button
                key={b.id}
                type="button"
                aria-pressed={b.id === id}
                className={`rounded-md border py-1 font-semibold ${
                  b.id === id ? 'border-[#2f7cf6] bg-[#2f7cf6] text-white' : 'border-black/15 bg-white'
                }`}
                onClick={() => setId(b.id)}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="flex items-center justify-between text-[#5c6b7a]">
              Rotate
              <span className="flex items-center gap-1">
                <input
                  type="number"
                  aria-label="Rotate degrees"
                  className="w-14 rounded border border-black/15 px-1 py-0.5 text-right font-mono"
                  value={degrees}
                  step={5}
                  onChange={(e) => setDegrees(Number(e.target.value))}
                />
                °
              </span>
            </span>
            <input
              type="range"
              aria-label="Rotate"
              min={-180}
              max={180}
              step={1}
              value={degrees}
              onChange={(e) => setDegrees(Number(e.target.value))}
            />
            <span className="flex gap-1">
              <button type="button" className="flex-1 rounded-md border border-black/15 bg-white py-0.5" onClick={() => setDegrees(degrees - 90)}>
                ↺ 90°
              </button>
              <button type="button" className="flex-1 rounded-md border border-black/15 bg-white py-0.5" onClick={() => setDegrees(degrees + 90)}>
                ↻ 90°
              </button>
            </span>
          </div>
          {sliders.map(([label, key, value, min, max, step]) => (
            <label key={key} className="flex flex-col gap-0.5">
              <span className="flex justify-between text-[#5c6b7a]">
                {label}
                <span className="font-mono">{round(value, 2)}</span>
              </span>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => ctx.setOverride(id, { [key]: Number(e.target.value) })}
              />
            </label>
          ))}
          <label className="flex flex-col gap-1">
            <span className="text-[#5c6b7a]">Paste into {south ? 'SOUTH_ZONES' : 'FIRST_ZONES'} (world-layout.ts)</span>
            <textarea
              readOnly
              className="h-20 w-full resize-y rounded border border-black/15 bg-[#f6f8fa] p-2 font-mono text-[10px] leading-snug"
              value={snippet}
              onFocus={(e) => e.target.select()}
            />
          </label>
        </div>
      ) : null}
    </div>
  )
}
