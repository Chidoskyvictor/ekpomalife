'use client'

import { Lock } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useGame } from '@/hooks/use-game'
import { cn } from '@/lib/utils'

const TONE_DOT = { good: 'bg-primary', bad: 'bg-destructive', neutral: 'bg-[#e2b63a]' }

export function PhoneDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { state, select } = useGame()
  if (!state) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80dvh] overflow-hidden rounded-[2rem] border-4 border-foreground/90 p-0 sm:max-w-sm">
        <div className="flex items-center justify-center bg-foreground/90 py-1.5" aria-hidden="true">
          <span className="h-1.5 w-16 rounded-full bg-white/30" />
        </div>
        <div className="flex flex-col gap-3 overflow-y-auto px-5 pb-5">
          <DialogHeader>
            <DialogTitle className="text-lg font-extrabold">{state.hasPhone ? 'Gist feed' : 'No phone yet'}</DialogTitle>
            <DialogDescription>
              {state.hasPhone
                ? `${state.characterName} · Day ${state.day}, ${state.period}`
                : 'Buy a phone at Campus Shop to unlock messages and town events.'}
            </DialogDescription>
          </DialogHeader>
          {state.hasPhone ? (
            <ol className="flex flex-col gap-2">
              {state.feed.map((entry) => (
                <li key={entry.id} className="flex gap-2.5 rounded-2xl bg-secondary p-3">
                  <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', TONE_DOT[entry.tone])} aria-hidden="true" />
                  <div>
                    <p className="text-sm">{entry.text}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground capitalize">
                      Day {entry.day} · {entry.period}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <span className="flex size-14 items-center justify-center rounded-full bg-secondary">
                <Lock className="size-6 text-muted-foreground" aria-hidden="true" />
              </span>
              <button
                type="button"
                onClick={() => {
                  select('campus_shop')
                  onOpenChange(false)
                }}
                className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:ring-4 focus-visible:ring-primary/30 focus-visible:outline-none"
              >
                Show me Campus Shop
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
