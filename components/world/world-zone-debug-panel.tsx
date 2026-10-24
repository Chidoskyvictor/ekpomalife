'use client'

import { useMemo, useState } from 'react'
import { MAP_ZONES, firstSlabUV, frontSlabUV } from '@/lib/game/world-layout'
import { useZoneDebug } from './zone-debug-context'

const DEFAULT_ZONE = 'aau-gate'

function round(n: number, digits = 4) {
  const p = 10 ** digits
  return Math.round(n * p) / p
}

export function WorldZoneDebugPanel() {
  const ctx = useZoneDebug()
  const [open, setOpen] = useState(true)
  const [zoneId, setZoneId] = useState(DEFAULT_ZONE)

  const zone = useMemo(() => MAP_ZONES.find((z) => z.id === zoneId), [zoneId])
  const base = zone ?? MAP_ZONES[0]
  const o = ctx?.overrides[zoneId] ?? {}

  if (!ctx?.enabled || !base) return null

  const x = o.x ?? base.position[0]
  const z = o.z ?? base.position[1]
  const rotation = o.rotation ?? base.rotation
  const modelY = o.modelY ?? base.modelY ?? 0
  const scaleMul = o.scaleMul ?? base.scaleMul ?? 1
  const south = base.slab === 'south'
  const [u, v] = south ? frontSlabUV(x, z) : firstSlabUV(x, z)

  const snippet = south
    ? `southZone('${base.id}', '${base.label}', ${round(u, 4)}, ${round(v, 4)}, '${base.model}', [${base.footprint.join(', ')}], { rotation: ${round(rotation, 4)} })`
    : `zone(
  '${base.id}',
  '${base.label}',
  ${round(u, 4)},
  ${round(v, 4)},
  '${base.model}',
  [${base.footprint.join(', ')}],
  ${round(rotation, 4)}${base.scale != null ? `,\n  ${round(base.scale * scaleMul, 3)}` : scaleMul !== 1 ? `,\n  undefined /* scaleMul ${scaleMul} */` : ''},
)`

  const patch = (key: keyof typeof o, value: number) => {
    ctx.setOverride(zoneId, { [key]: value })
  }

  return (
    <div
      className="pointer-events-auto absolute left-3 top-14 z-40 max-w-[min(100vw-1.5rem,22rem)] rounded-xl border border-black/10 bg-white/92 p-3 text-xs text-[#122846] shadow-lg backdrop-blur-sm"
      aria-label="Map zone debug"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          className="font-medium"
          onClick={() => setOpen((v) => !v)}
        >
          Zone debug {open ? '▾' : '▸'}
        </button>
        <button
          type="button"
          className="text-[#5c6b7a] underline"
          onClick={() => ctx.clearOverride(zoneId)}
        >
          Reset
        </button>
      </div>
      {open ? (
        <div className="space-y-2">
          <label className="flex flex-col gap-0.5">
            <span className="text-[#5c6b7a]">Building</span>
            <select
              className="rounded border border-black/15 bg-white px-2 py-1"
              value={zoneId}
              onChange={(e) => setZoneId(e.target.value)}
            >
              {MAP_ZONES.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.label}
                </option>
              ))}
            </select>
          </label>
          {(
            [
              ['x', x, -120, 120, 0.25],
              ['z', z, -120, 120, 0.25],
              ['rotation', rotation, -Math.PI, Math.PI, 0.02],
              ['modelY', modelY, -2, 4, 0.02],
              ['scaleMul', scaleMul, 0.25, 3, 0.05],
            ] as const
          ).map(([key, val, min, max, step]) => (
            <label key={key} className="flex flex-col gap-0.5">
              <span className="text-[#5c6b7a]">{key}</span>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={val}
                onChange={(e) => patch(key, Number(e.target.value))}
              />
              <input
                type="number"
                className="rounded border border-black/15 px-2 py-0.5"
                value={val}
                step={step}
                onChange={(e) => patch(key, Number(e.target.value))}
              />
            </label>
          ))}
          <label className="flex flex-col gap-1">
            <span className="text-[#5c6b7a]">Paste into MAP_ZONES (world-layout.ts)</span>
            <textarea
              readOnly
              className="h-28 w-full resize-y rounded border border-black/15 bg-[#f6f8fa] p-2 font-mono text-[10px] leading-snug"
              value={snippet}
              onFocus={(e) => e.target.select()}
            />
          </label>
        </div>
      ) : null}
    </div>
  )
}
