'use client'

import { PlaceAction, PlaceActions, type PlaceTag } from '@/components/hud/place-sheet'
import { useGame } from '@/hooks/use-game'
import { isBuildingOpen, type BuildingActionDef, type BuildingDef } from '@/lib/game/buildings'
import { emptyCampus } from '@/lib/game/campus'

/** An activity's chips → the card's big line and its tags. */
export function cardInfo(action: BuildingActionDef): { price: string; tags: PlaceTag[] } {
  let price = 'Free'
  const tags: PlaceTag[] = []
  for (const chip of action.chips) {
    if (chip.kind === 'cash') price = `₦${Math.abs(chip.amount).toLocaleString()}`
    if (chip.kind === 'time') tags.push({ text: `${chip.minutes} min`, tone: 'info' })
    if (chip.kind === 'energy') tags.push({ text: `${chip.amount > 0 ? '+' : '−'}${Math.abs(chip.amount)} energy`, tone: chip.amount > 0 ? 'good' : 'bad' })
    if (chip.kind === 'reward') tags.push({ text: chip.text, tone: 'good' })
  }
  return { price, tags }
}

/**
 * A building's activities as place-sheet cards, with the same rules as before (you're here, it's
 * open, and each action's own lock). `onRun` hands the action to a headless BuildingPanel, which
 * runs it with its quiz / fees / results screens.
 */
export function BuildingActionCards({
  building,
  placeId,
  onRun,
  before,
}: {
  building: BuildingDef
  placeId: string
  onRun: (action: BuildingActionDef) => void
  /** Extra cards first (e.g. the hall's "Take a seat"). */
  before?: React.ReactNode
}) {
  const { state } = useGame()
  const gameTime = state?.gameTime ?? 10 * 60
  const gameHour = Math.floor((((gameTime % 1440) + 1440) % 1440) / 60)
  const campus = state?.campus ?? emptyCampus(100)
  const isHere = state?.locationId === placeId
  const open = isBuildingOpen(building, gameTime).open
  const closedNote =
    building.openHours && !open ? `Opens at ${building.openHours.open % 12 || 12}${building.openHours.open < 12 ? 'am' : 'pm'}` : null
  const lockOf = (action: BuildingActionDef) =>
    !isHere ? 'Come here first' : (closedNote ?? action.lock?.({ campus, gameHour, traits: state?.traits ?? [], placeId }) ?? null)

  return (
    <PlaceActions>
      {before}
      {building.actions.map((action) => {
        const { price, tags } = cardInfo(action)
        const locked = lockOf(action)
        return (
          <PlaceAction
            key={action.id}
            emoji={action.emoji}
            title={action.title}
            price={price}
            tags={tags}
            note={locked ?? undefined}
            disabled={Boolean(locked)}
            onClick={() => onRun(action)}
          />
        )
      })}
    </PlaceActions>
  )
}
