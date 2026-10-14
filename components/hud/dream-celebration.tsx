'use client'

import { useReducedMotion } from 'motion/react'
import { Button } from '@/components/arc/button/button'
import { Dialog, DialogClose, DialogContent } from '@/components/arc/dialog/dialog'
import { useGame } from '@/hooks/use-game'
import { getDream } from '@/lib/game/dreams'
import { shareDreamCard } from '@/lib/game/share-dream'
import styles from './dream-celebration.module.css'

const BITS = ['🎓', '✨', '🏠', '🎤', '💼', '🤝']

export function DreamCelebration() {
  const { state, dismissDreamCelebration } = useGame()
  const reduced = useReducedMotion() ?? false
  const dream = getDream(state?.dreamId)
  const open = Boolean(state?.dreamCompleted && !state?.dreamCelebrated && dream)

  if (!state || !dream) return null

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) dismissDreamCelebration()
      }}
    >
      <DialogContent title={`You did it, ${state.characterName}`} description={`${dream.title} is complete.`}>
        {!reduced ? (
          <div className={styles.confetti} aria-hidden="true">
            {BITS.map((bit, index) => (
              <span key={`${bit}-${index}`} className={styles.bit} style={{ animationDelay: `${index * 80}ms` }}>
                {bit}
              </span>
            ))}
          </div>
        ) : null}
        <p>
          Badge unlocked: {dream.reward.badge}
          {dream.reward.cash ? `. ₦${dream.reward.cash.toLocaleString()} added.` : '.'}
        </p>
        <div className={styles.actions}>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void shareDreamCard(state.characterName, dream)}
          >
            Share
          </Button>
          <DialogClose asChild>
            <Button type="button">Keep playing</Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  )
}
