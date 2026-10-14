'use client'

import { getDream, dreamProgress, snapshotFromLife } from '@/lib/game/dreams'
import { useGame } from '@/hooks/use-game'

export function DreamTracker({ onChangeDream }: { onChangeDream: () => void }) {
  const { state } = useGame()
  if (!state) return null
  const dream = getDream(state.dreamId)

  if (!dream) {
    return (
      <button
        type="button"
        onClick={onChangeDream}
        className="pointer-events-auto mx-auto liquid-glass rounded-full px-4 py-2 text-xs sm:text-sm"
      >
        Pick a big dream
      </button>
    )
  }

  const progress = dreamProgress(dream, snapshotFromLife(state.cash, state.dream))

  return (
    <div className="pointer-events-auto mx-auto flex max-w-full items-center gap-2">
      <p className="liquid-glass flex min-w-0 items-center gap-2 rounded-full py-2 pr-3 pl-3 text-xs sm:text-sm">
        <span aria-hidden="true">{dream.emoji}</span>
        <span className="truncate tabular-nums">{progress.label}</span>
      </p>
      <button
        type="button"
        onClick={onChangeDream}
        className="liquid-glass-chip shrink-0 rounded-full px-3 py-2 text-xs text-foreground/70 hover:text-foreground"
      >
        Change
      </button>
    </div>
  )
}
