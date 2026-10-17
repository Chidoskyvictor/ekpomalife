'use client'

import { MoreHorizontal } from 'lucide-react'
import { getPlace, getPlaceByZone } from '@/lib/game/places'
import { contextActionFor, type ContextAction } from '@/lib/game/quests'
import type { GameState } from '@/lib/game/types'
import styles from './life-hud.module.css'

export function ContextDock({
  state,
  onMore,
  onAction,
}: {
  state: GameState
  onMore: () => void
  onAction: (action: ContextAction) => void
}) {
  const place = getPlace(state.locationId) ?? getPlaceByZone(state.locationId)
  const action = contextActionFor(state, place?.type)

  return (
    <div className={styles.cornerActions}>
      <button type="button" className={styles.moreBtn} aria-label="More" onClick={onMore}>
        <MoreHorizontal size={18} aria-hidden="true" />
      </button>
      <button type="button" className={styles.contextBtn} onClick={() => onAction(action)}>
        <span aria-hidden="true">{action.emoji}</span>
        {action.label}
      </button>
    </div>
  )
}
