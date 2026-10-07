'use client'

import { Coins, Moon, RotateCcw, Smartphone, Sun, Sunrise, Sunset } from 'lucide-react'
import { useGame } from '@/hooks/use-game'
import type { TimePeriod } from '@/lib/game/types'
import { cn } from '@/lib/utils'

const PERIOD_ICON: Record<TimePeriod, typeof Sun> = {
  morning: Sunrise,
  afternoon: Sun,
  evening: Sunset,
  night: Moon,
}

export function Logo() {
  return (
    <div className="flex items-center gap-2">
      <span className="flex size-8 items-center justify-center rounded-xl bg-primary text-sm font-extrabold text-primary-foreground shadow-sm">
        EL
      </span>
      <span className="text-base font-extrabold tracking-tight">Ekpoma Life</span>
    </div>
  )
}

export function TopBar({ onCreate, onOpenPhone }: { onCreate: () => void; onOpenPhone: () => void }) {
  const { state, resetGame } = useGame()

  if (!state) {
    return (
      <header className="pointer-events-auto mx-auto flex w-full max-w-3xl items-center justify-between gap-3 rounded-full bg-white/95 py-2 pr-2 pl-4 shadow-lg ring-1 ring-black/5 backdrop-blur">
        <div className="flex items-center gap-3">
          <Logo />
          <span className="hidden items-center gap-1.5 text-xs font-semibold text-primary sm:flex">
            <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
            AAU · Edo State
          </span>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:ring-4 focus-visible:ring-primary/30 focus-visible:outline-none"
        >
          Start playing
        </button>
      </header>
    )
  }

  const PeriodIcon = PERIOD_ICON[state.period]

  return (
    <header className="pointer-events-auto mx-auto flex w-full max-w-3xl items-center justify-between gap-2 rounded-full bg-white/95 py-1.5 pr-1.5 pl-3 shadow-lg ring-1 ring-black/5 backdrop-blur sm:pl-4">
      <div className="flex min-w-0 items-center gap-3">
        <Logo />
        <span className="hidden truncate text-xs text-muted-foreground md:inline">
          {state.characterName} · {state.faculty}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold capitalize">
          <PeriodIcon className="size-3.5 text-laterite" aria-hidden="true" />
          <span>
            Day {state.day}
            <span className="hidden sm:inline"> · {state.period}</span>
          </span>
        </span>
        <span className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-bold tabular-nums">
          <Coins className="size-3.5 text-[#c9951a]" aria-hidden="true" />
          <span className="sr-only">Cash:</span>₦{state.cash.toLocaleString()}
        </span>
        <button
          type="button"
          onClick={onOpenPhone}
          aria-label={state.hasPhone ? 'Open phone' : 'Phone locked — buy one at Campus Shop'}
          className={cn(
            'relative flex size-9 items-center justify-center rounded-full transition-colors focus-visible:ring-4 focus-visible:ring-primary/30 focus-visible:outline-none',
            state.hasPhone ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-secondary text-muted-foreground',
          )}
        >
          <Smartphone className="size-4" aria-hidden="true" />
          {state.hasPhone ? (
            <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-laterite ring-2 ring-white" aria-hidden="true" />
          ) : null}
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm('Start a new life? Your current progress will be lost.')) resetGame()
          }}
          aria-label="Start a new character"
          className="hidden size-9 items-center justify-center rounded-full bg-secondary text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-4 focus-visible:ring-primary/30 focus-visible:outline-none sm:flex"
        >
          <RotateCcw className="size-4" aria-hidden="true" />
        </button>
      </div>
    </header>
  )
}
