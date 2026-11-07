'use client'

import { BodyPortal } from '@/components/ui/body-portal'
import { HudToast } from '@/components/hud/hud-toast'
import { IslandToast } from '@/components/hud/island-toast'
import { PitchDayPill } from '@/components/hud/pitch-day-pill'
import { TakeawayPill } from '@/components/hud/takeaway-pill'
import type { Toast } from '@/hooks/use-game'
import type { GameState } from '@/lib/game/types'
import styles from './toast-layer.module.css'

export function ToastLayer({
  toast,
  state,
}: {
  toast: Toast | null
  state: GameState | null
}) {
  if (!toast && !state) return null
  return (
    <BodyPortal>
      <div className={styles.root} aria-live="polite">
        {state ? <IslandToast state={state} /> : null}
        {state ? <PitchDayPill /> : null}
        {state ? <TakeawayPill /> : null}
        <HudToast toast={toast} />
      </div>
    </BodyPortal>
  )
}
