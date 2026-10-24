'use client'

import { useMemo, useState } from 'react'
import { formatRoomCameraSnippet, roundCamera } from '@/lib/game/room-camera-debug'
import { useRoomCameraDebug } from './room-camera-debug-context'

type AxisRow = {
  key: 'position' | 'target'
  axis: 0 | 1 | 2
  label: string
  min: number
  max: number
  step: number
}

const ROWS: AxisRow[] = [
  { key: 'position', axis: 0, label: 'pos X', min: -30, max: 30, step: 0.05 },
  { key: 'position', axis: 1, label: 'pos Y', min: 0.2, max: 25, step: 0.05 },
  { key: 'position', axis: 2, label: 'pos Z', min: -30, max: 30, step: 0.05 },
  { key: 'target', axis: 0, label: 'target X', min: -15, max: 15, step: 0.05 },
  { key: 'target', axis: 1, label: 'target Y', min: -2, max: 8, step: 0.05 },
  { key: 'target', axis: 2, label: 'target Z', min: -15, max: 15, step: 0.05 },
]

export function RoomCameraDebugPanel() {
  const ctx = useRoomCameraDebug()
  const [open, setOpen] = useState(true)

  const placement = ctx?.placement ?? null

  const snippet = useMemo(
    () => (placement ? formatRoomCameraSnippet(placement) : ''),
    [placement],
  )

  if (!ctx?.enabled || !placement) return null

  const patchAxis = (row: AxisRow, value: number) => {
    const current = ctx.placement[row.key]
    const next = [...current] as [number, number, number]
    next[row.axis] = value
    ctx.setOverride({ [row.key]: next })
  }

  const patchScalar = (key: 'fov' | 'minDistance' | 'maxDistance', value: number) => {
    ctx.setOverride({ [key]: value })
  }

  return (
    <div
      className="pointer-events-auto absolute left-3 top-[max(3.5rem,env(safe-area-inset-top)+2.75rem)] z-40 max-h-[min(70dvh,28rem)] max-w-[min(100vw-1.5rem,22rem)] overflow-y-auto rounded-xl border border-black/10 bg-white/92 p-3 text-xs text-[#122846] shadow-lg backdrop-blur-sm"
      aria-label="Room camera debug"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <button type="button" className="min-h-[44px] font-medium" onClick={() => setOpen((v) => !v)}>
          Room camera {open ? '▾' : '▸'}
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            className="min-h-[44px] text-[#5c6b7a] underline"
            disabled={!ctx.live}
            onClick={() => ctx.applyLive()}
          >
            Use orbit
          </button>
          <button type="button" className="min-h-[44px] text-[#5c6b7a] underline" onClick={() => ctx.reset()}>
            Reset
          </button>
        </div>
      </div>
      {open ? (
        <div className="space-y-2">
          <p className="text-[11px] leading-snug text-[#5c6b7a]">
            Pinch or scroll to zoom. Copy the block for defaults. <strong>minDistance</strong> is closest zoom
            (4.2).
          </p>
          {ctx.live ? (
            <p className="font-mono text-[10px] text-[#5c6b7a]">
              distance {roundCamera(ctx.live.distance, 2)}
            </p>
          ) : null}
          {ROWS.map((row) => {
            const val = ctx.placement[row.key][row.axis]
            return (
              <label key={`${row.key}-${row.axis}`} className="flex flex-col gap-0.5">
                <span className="text-[#5c6b7a]">{row.label}</span>
                <input
                  type="range"
                  min={row.min}
                  max={row.max}
                  step={row.step}
                  value={val}
                  onChange={(e) => patchAxis(row, Number(e.target.value))}
                />
                <input
                  type="number"
                  className="min-h-[44px] rounded border border-black/15 px-2 py-1 text-sm"
                  value={val}
                  step={row.step}
                  onChange={(e) => patchAxis(row, Number(e.target.value))}
                />
              </label>
            )
          })}
          {(
            [
              ['fov', ctx.placement.fov, 20, 75, 0.5],
              ['minDistance', ctx.placement.minDistance, 2, 12, 0.1],
              ['maxDistance', ctx.placement.maxDistance, 5, 60, 0.5],
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
                onChange={(e) => patchScalar(key, Number(e.target.value))}
              />
              <input
                type="number"
                className="min-h-[44px] rounded border border-black/15 px-2 py-1 text-sm"
                value={val}
                step={step}
                onChange={(e) => patchScalar(key, Number(e.target.value))}
              />
            </label>
          ))}
          <label className="flex flex-col gap-1">
            <span className="text-[#5c6b7a]">Copy for chat / room-camera.ts</span>
            <textarea
              readOnly
              className="h-32 w-full resize-y rounded border border-black/15 bg-[#f6f8fa] p-2 font-mono text-[10px] leading-snug"
              value={snippet}
              onFocus={(e) => e.target.select()}
            />
          </label>
        </div>
      ) : null}
    </div>
  )
}
