'use client'

import { useEffect, useState } from 'react'
import { PlaceAction, PlaceActions, type PlaceTag } from '@/components/hud/place-sheet'
import { useGame } from '@/hooks/use-game'
import { isBuildingOpen, type BuildingActionDef, type BuildingDef } from '@/lib/game/buildings'
import { emptyCampus } from '@/lib/game/campus'
import { isSchoolCard, schoolCardLock, schoolCardPrice, useSchool } from '@/lib/game/school-api'

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
  const { state, isGuest } = useGame()
  const { school } = useSchool(!isGuest)
  // Re-check school locks every second (class cooldown countdown, hours)
  const hasSchool = building.actions.some((action) => isSchoolCard(action.id))
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!hasSchool) return
    const id = window.setInterval(() => setTick((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [hasSchool])
  const gameTime = state?.gameTime ?? 10 * 60
  const gameHour = Math.floor((((gameTime % 1440) + 1440) % 1440) / 60)
  const campus = state?.campus ?? emptyCampus(100)
  const isHere = state?.locationId === placeId
  const open = isBuildingOpen(building, gameTime).open
  const closedNote =
    building.openHours && !open ? `Opens at ${building.openHours.open % 12 || 12}${building.openHours.open < 12 ? 'am' : 'pm'}` : null
  const lockOf = (action: BuildingActionDef) => {
    if (!isHere) return 'Come here first'
    // School cards follow the school day (class and exam hours), not the building's hours
    if (isSchoolCard(action.id)) return schoolCardLock(school, action.id, placeId, Date.now())
    return closedNote ?? action.lock?.({ campus, gameHour, traits: state?.traits ?? [], placeId }) ?? null
  }

  return (
    <PlaceActions>
      {before}
      {building.actions.map((action) => {
        const info = cardInfo(action)
        const fee = schoolCardPrice(school, action.id)
        const price = fee != null ? `₦${fee.toLocaleString()}` : info.price
        const tags = info.tags
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
