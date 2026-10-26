'use client'

import { ItemMenu } from '@/components/hud/item-menu'
import { PlaceAction, PlaceActions } from '@/components/hud/place-sheet'
import { FURNITURE, type FurnitureAction, type FurnitureId } from '@/lib/game/room-furniture'

/** Each gain as a tag on the action card (Energy, Hygiene…). */
const tagsFor = (action: FurnitureAction) => action.gains.map((gain) => ({ text: `+${gain}`, tone: 'good' as const }))

/**
 * Tap a piece of furniture at home: a small menu pops up with what you can do with it. Every
 * action takes a few real seconds and shows the busy pill while it runs. (At home there's no
 * place sheet at the bottom: the room itself is the menu.)
 */
export function FurnitureSheet({
  furniture,
  onClose,
  onPick,
}: {
  furniture: FurnitureId | null
  onClose: () => void
  onPick: (furniture: FurnitureId, action: FurnitureAction) => void
}) {
  const item = furniture ? FURNITURE[furniture] : null
  return (
    <ItemMenu open={!!item?.actions.length} icon={item?.emoji} title={item?.label ?? ''} blurb={item?.blurb} onClose={onClose}>
      {item ? (
        <PlaceActions>
          {item.actions.map((action) => (
            <PlaceAction
              key={action.id + action.title}
              emoji={action.emoji}
              seconds={action.seconds}
              price={action.cost ? `₦${action.cost.toLocaleString()}` : 'Free'}
              title={action.title}
              tags={tagsFor(action)}
              onClick={() => onPick(item.id, action)}
            />
          ))}
        </PlaceActions>
      ) : null}
    </ItemMenu>
  )
}
