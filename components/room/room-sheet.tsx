'use client'

import { ShoppingBag } from 'lucide-react'
import { useMemo, useState } from 'react'
import { PlaceAction, PlaceActions, PlaceSheet } from '@/components/hud/place-sheet'
import { useGame } from '@/hooks/use-game'
import { enterBuyMode } from '@/lib/game/home-buy-store'
import { FURNITURE, type FurnitureAction, type FurnitureId } from '@/lib/game/room-furniture'
import type { SpotKey } from '@/lib/game/room-layouts'

/** One thing you can do at home, and the piece of furniture you walk to for it. */
export type RoomChoice = { key: SpotKey; furniture: FurnitureId; action: FurnitureAction }

/**
 * Your room on the shared place sheet: everything you can do here (from the furniture you have),
 * each card walking you to the right piece. No "Players here" row: your room is private.
 * Tapping the furniture itself still opens its own small menu.
 */
export function RoomSheet({
  label,
  pieces,
  onPick,
}: {
  label: string
  /** Each spot in the room and what furniture it is. */
  pieces: { key: SpotKey; furniture: FurnitureId | null }[]
  onPick: (key: SpotKey, action: FurnitureAction) => void
}) {
  const { state } = useGame()
  const [expanded, setExpanded] = useState(false)

  // One card per action, from the first piece that offers it (two chairs → one "Sit down")
  const choices = useMemo(() => {
    const seen = new Set<string>()
    const out: RoomChoice[] = []
    for (const { key, furniture } of pieces) {
      const def = furniture ? FURNITURE[furniture] : null
      if (!def) continue
      for (const action of def.actions) {
        if (seen.has(action.id)) continue
        seen.add(action.id)
        out.push({ key, furniture: furniture!, action })
      }
    }
    return out
  }, [pieces])

  return (
    <PlaceSheet
      icon="🏠"
      title={`My ${label.toLowerCase()}`}
      subtitle={state?.username ? `@${state.username}'s place · tap furniture or pick below` : 'Tap furniture or pick below'}
      buttons={[{ icon: <ShoppingBag size={18} />, label: 'Buy furniture', onClick: () => enterBuyMode() }]}
      expanded={expanded}
      onExpandedChange={setExpanded}
    >
      <PlaceActions>
        {choices.map(({ key, action }) => (
          <PlaceAction
            key={action.id}
            emoji={action.emoji}
            title={action.title}
            price="Free"
            seconds={action.seconds}
            tags={action.gains.map((g) => ({ text: `+${g}`, tone: 'good' as const }))}
            onClick={() => {
              setExpanded(false)
              onPick(key, action)
            }}
          />
        ))}
      </PlaceActions>
    </PlaceSheet>
  )
}
