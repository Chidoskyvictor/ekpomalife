'use client'

import { useMemo } from 'react'
import { DEFAULT_HAIR_FIT, formatHairFit, hairFitFor, type HairFit } from '@/lib/game/hair-config'
import type { Appearance } from '@/lib/game/look'

function Field({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}) {
  return (
    <label className="grid grid-cols-[4.5rem_1fr_3.2rem] items-center gap-2 text-[11px]">
      <span className="text-neutral-500">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full"
      />
      <span className="tabular-nums text-neutral-700">{value.toFixed(3)}</span>
    </label>
  )
}

export function HairDebugPanel({
  appearance,
  value,
  onChange,
}: {
  appearance: Appearance
  value: HairFit | null
  onChange: (next: HairFit | null) => void
}) {
  const stored = hairFitFor(appearance.body, appearance.hair) ?? {
    file: 'sculpted',
    ...DEFAULT_HAIR_FIT,
  }
  const fit = value ?? stored

  const degrees = useMemo(() => {
    if (!fit) return [0, 0, 0] as [number, number, number]
    return fit.rotation.map((rad) => (rad * 180) / Math.PI) as [number, number, number]
  }, [fit])

  if (!stored || !fit) {
    return (
      <section className="rounded-xl bg-neutral-50 p-3 text-xs ring-1 ring-neutral-200">
        <p className="font-medium text-neutral-700">Hair debug</p>
        <p className="mt-1 text-neutral-500">No GLB for {appearance.body} / {appearance.hair}.</p>
      </section>
    )
  }

  const patch = (partial: Partial<HairFit>) => onChange({ ...fit, ...partial })
  const setOffset = (index: number, n: number) => {
    const offset = [...fit.offset] as [number, number, number]
    offset[index] = n
    patch({ offset })
  }
  const setRotationDeg = (index: number, deg: number) => {
    const rotation = [...fit.rotation] as [number, number, number]
    rotation[index] = (deg * Math.PI) / 180
    patch({ rotation })
  }

  const logValues = () => {
    const text = `${appearance.body}.${appearance.hair}: ${formatHairFit(fit)}`
    console.info('[hair-config]', text)
  }

  return (
    <section className="rounded-xl bg-neutral-50 p-3 text-xs ring-1 ring-neutral-200">
      <p className="font-medium text-neutral-700">Hair debug · {appearance.body} {appearance.hair}</p>
      <p className="mt-1 truncate text-neutral-400">{fit.file}</p>
      <div className="mt-3 space-y-2">
        <Field label="scale" min={0.2} max={2.5} step={0.01} value={fit.scale} onChange={(scale) => patch({ scale })} />
        <Field label="off X" min={-0.4} max={0.4} step={0.005} value={fit.offset[0]} onChange={(n) => setOffset(0, n)} />
        <Field label="off Y" min={-0.4} max={0.4} step={0.005} value={fit.offset[1]} onChange={(n) => setOffset(1, n)} />
        <Field label="off Z" min={-0.4} max={0.4} step={0.005} value={fit.offset[2]} onChange={(n) => setOffset(2, n)} />
        <Field label="rot X" min={-180} max={180} step={1} value={degrees[0]} onChange={(n) => setRotationDeg(0, n)} />
        <Field label="rot Y" min={-180} max={180} step={1} value={degrees[1]} onChange={(n) => setRotationDeg(1, n)} />
        <Field label="rot Z" min={-180} max={180} step={1} value={degrees[2]} onChange={(n) => setRotationDeg(2, n)} />
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" className="rounded-full bg-neutral-900 px-3 py-1 text-[11px] font-medium text-white" onClick={logValues}>
          Log values
        </button>
        <button type="button" className="rounded-full bg-neutral-100 px-3 py-1 text-[11px] font-medium text-neutral-700" onClick={() => onChange(null)}>
          Reset
        </button>
      </div>
    </section>
  )
}
