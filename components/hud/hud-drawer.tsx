'use client'

import { useEffect, type ReactNode } from 'react'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { hapticTap } from './haptic'
import { playSfx } from '@/lib/audio/sfx'

/**
 * Modal HUD sheet (profile, top up, buy, today, settings…): the shared BottomSheet with a
 * backdrop and focus trap, plus the open tap + sound.
 */
export function HudDrawer({
  open,
  onOpenChange,
  title,
  description,
  leading,
  tall = false,
  desktopCard = false,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  /** Shown left of the title (e.g. the player's avatar). */
  leading?: ReactNode
  /** Open straight to the tall stop at full height (no short stop). */
  tall?: boolean
  /** Kept for callers: every sheet now sizes to its content up to the short stop. */
  fit?: boolean
  /** Desktop: a bottom sheet centred on screen (like the map place sheet), height capped, inner scroll. */
  desktopCard?: boolean
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    hapticTap()
    playSfx('open')
  }, [open])

  return (
    <BottomSheet
      modal
      open={open}
      onClose={() => onOpenChange(false)}
      title={title}
      subtitle={description}
      leading={leading}
      startExpanded={tall}
      fillHeight={tall}
      desktopCard={desktopCard}
      plainBody
    >
      {children}
    </BottomSheet>
  )
}
