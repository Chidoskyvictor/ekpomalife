'use client'

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useGame } from '@/hooks/use-game'
import type { StatKey } from '@/lib/game/types'

const EFFECT_LABEL: Record<StatKey, string> = {
  cash: '₦',
  energy: 'Energy',
  health: 'Health',
  reputation: 'Rep',
  academic: 'Academic',
}

function describe(effects: Partial<Record<StatKey, number>>) {
  return Object.entries(effects)
    .map(([key, value]) => {
      const label = EFFECT_LABEL[key as StatKey]
      const sign = (value ?? 0) > 0 ? '+' : '-'
      return key === 'cash' ? `${sign}₦${Math.abs(value ?? 0)}` : `${sign}${Math.abs(value ?? 0)} ${label}`
    })
    .join(' · ')
}

export function EventDialog() {
  const { pendingEvent, chooseEvent } = useGame()

  return (
    <Dialog open={pendingEvent !== null} onOpenChange={() => undefined} disablePointerDismissal>
      <DialogContent showCloseButton={false} className="rounded-3xl p-5 sm:max-w-md">
        {pendingEvent ? (
          <>
            <DialogHeader>
              <p className="text-xs font-semibold tracking-wide text-laterite uppercase">Town event</p>
              <DialogTitle className="text-xl font-extrabold">{pendingEvent.title}</DialogTitle>
              <DialogDescription>{pendingEvent.description}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              {pendingEvent.choices.map((choice) => (
                <button
                  key={choice.label}
                  type="button"
                  onClick={() => chooseEvent(choice)}
                  className="flex flex-col items-start rounded-2xl border border-border p-3 text-left transition-colors hover:border-primary hover:bg-accent focus-visible:ring-4 focus-visible:ring-primary/30 focus-visible:outline-none"
                >
                  <span className="text-sm font-semibold">{choice.label}</span>
                  <span className="text-xs text-muted-foreground">{describe(choice.effects)}</span>
                </button>
              ))}
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
