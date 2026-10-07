'use client'

import { BookOpen, Heart, Star, Zap } from 'lucide-react'
import type { GameState } from '@/lib/game/types'
import { cn } from '@/lib/utils'

const STATS = [
  { key: 'energy', label: 'Energy', icon: Zap, bar: 'bg-[#e2b63a]' },
  { key: 'health', label: 'Health', icon: Heart, bar: 'bg-[#e0565b]' },
  { key: 'reputation', label: 'Rep', icon: Star, bar: 'bg-[#7a5cc2]' },
  { key: 'academic', label: 'Academic', icon: BookOpen, bar: 'bg-primary' },
] as const

export function StatsPanel({ state }: { state: GameState }) {
  return (
    <section
      aria-label="Your stats"
      className="pointer-events-auto grid grid-cols-4 gap-2 rounded-2xl bg-white/95 p-2.5 shadow-lg ring-1 ring-black/5 backdrop-blur sm:w-52 sm:grid-cols-1 sm:gap-2.5 sm:p-3"
    >
      {STATS.map(({ key, label, icon: Icon, bar }) => {
        const value = state[key]
        return (
          <div key={key} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-1 text-[11px] font-semibold">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Icon className="size-3" aria-hidden="true" />
                {label}
              </span>
              <span className="tabular-nums">{value}</span>
            </div>
            <div
              className="h-1.5 overflow-hidden rounded-full bg-secondary"
              role="progressbar"
              aria-label={label}
              aria-valuenow={value}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className={cn('h-full rounded-full transition-[width] duration-500', bar)} style={{ width: `${value}%` }} />
            </div>
          </div>
        )
      })}
    </section>
  )
}
