'use client'

import { BodyPortal } from '@/components/ui/body-portal'
import { HudToast } from '@/components/hud/hud-toast'
import { IslandToast } from '@/components/hud/island-toast'
import { DailyMoments } from '@/components/hud/daily-moments'
import { FeesNotice } from '@/components/hud/fees-notice'
import { ForbesLive } from '@/components/hud/forbes-live'
import { InstallApp } from '@/components/hud/install-app'
import { CarTips } from '@/components/hud/car-tips'
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
        <HudToast toast={toast} />
      </div>
      {state ? <FeesNotice /> : null}
      {state ? <ForbesLive /> : null}
      {state ? <DailyMoments /> : null}
      {state ? <InstallApp /> : null}
      {state ? <CarTips /> : null}
    </BodyPortal>
  )
}
