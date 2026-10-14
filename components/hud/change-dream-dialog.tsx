'use client'

import { Button } from '@/components/arc/button/button'
import { Dialog, DialogClose, DialogContent } from '@/components/arc/dialog/dialog'
import { RadioCards } from '@/components/arc/radio-cards/radio-cards'
import { dreamRadioOptions } from '@/components/dreams/dream-options'
import { useGame } from '@/hooks/use-game'
import { saveCharacterDream } from '@/lib/game/character-api'
import type { DreamId } from '@/lib/game/dreams'

export function ChangeDreamDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { state, changeDream } = useGame()
  if (!state) return null

  const pick = async (id: DreamId) => {
    if (id === state.dreamId) {
      onOpenChange(false)
      return
    }
    await saveCharacterDream(id)
    changeDream(id)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Change your big dream?"
        description="Progress on the current dream resets. Your cash and stats stay."
      >
        <RadioCards
          aria-label="Big dream"
          layout="list"
          value={state.dreamId ?? null}
          onValueChange={(value) => void pick(value as DreamId)}
          options={dreamRadioOptions()}
        />
        <DialogClose asChild>
          <Button type="button" variant="secondary">
            Keep this dream
          </Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  )
}
