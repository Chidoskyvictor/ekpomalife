'use client'

import { Footprints, MessageCircle, X } from 'lucide-react'
import { useGame } from '@/hooks/use-game'
import { ACTIONS, getLocation, TYPE_META } from '@/lib/game/content'
import { travelQuote } from '@/lib/game/rules'
import type { ActionId, GameState, LocationRecord } from '@/lib/game/types'
import { cn } from '@/lib/utils'

function SheetHeader({ location, onClose, subtitle }: { location: LocationRecord; onClose: () => void; subtitle: string }) {
  return (
    <div className="flex items-start gap-3">
      <span
        className="flex size-11 shrink-0 items-center justify-center rounded-2xl text-2xl"
        style={{ backgroundColor: TYPE_META[location.type].color }}
        aria-hidden="true"
      >
        {location.emoji}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{subtitle}</p>
        <h2 className="truncate text-lg font-bold leading-tight">{location.name}</h2>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="flex size-8 items-center justify-center rounded-full bg-secondary text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-4 focus-visible:ring-primary/30 focus-visible:outline-none"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  )
}

function ActionButton({ actionId, state, onAct }: { actionId: ActionId; state: GameState; onAct: (id: ActionId) => void }) {
  const action = ACTIONS[actionId]
  const tooPoor = action.cost !== undefined && state.cash < action.cost
  const tooTired = action.energyCost !== undefined && state.energy < action.energyCost
  const owned = actionId === 'buy_phone' && state.hasPhone
  const disabled = tooPoor || tooTired || owned
  const meta = [
    action.cost ? `₦${action.cost.toLocaleString()}` : null,
    action.energyCost ? `-${action.energyCost} energy` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onAct(actionId)}
      className={cn(
        'flex flex-col items-start gap-0.5 rounded-2xl border p-3 text-left transition-colors focus-visible:ring-4 focus-visible:ring-primary/30 focus-visible:outline-none',
        disabled ? 'cursor-not-allowed border-border bg-muted/60 opacity-60' : 'border-border bg-white hover:border-primary hover:bg-accent',
      )}
    >
      <span className="text-sm font-semibold">{owned ? 'Phone owned' : action.label}</span>
      <span className="text-xs text-muted-foreground">{action.hint}</span>
      {meta ? <span className="mt-0.5 text-[11px] font-semibold text-laterite">{meta}</span> : null}
    </button>
  )
}

function TravelOptions({ state, location }: { state: GameState; location: LocationRecord }) {
  const { travelTo } = useGame()
  const quote = travelQuote(state.locationId, location.id)
  const canWalk = state.energy >= quote.walkEnergy
  const canKeke = state.cash >= quote.kekeFare
  const from = getLocation(state.locationId)

  return (
    <div className="mt-3">
      <p className="text-sm text-muted-foreground">{location.description}</p>
      <p className="mt-2 text-xs text-muted-foreground">From {from?.name ?? 'here'}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={!canWalk}
          onClick={() => travelTo(location.id, 'walk')}
          className="flex items-center justify-center gap-2 rounded-full border border-border bg-white py-3 text-sm font-semibold transition-colors hover:border-primary disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-4 focus-visible:ring-primary/30 focus-visible:outline-none"
        >
          <Footprints className="size-4" aria-hidden="true" />
          Walk · -{quote.walkEnergy}⚡
        </button>
        <button
          type="button"
          disabled={!canKeke}
          onClick={() => travelTo(location.id, 'keke')}
          className="flex items-center justify-center gap-2 rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-4 focus-visible:ring-primary/30 focus-visible:outline-none"
        >
          <span aria-hidden="true">🛺</span>
          Keke · ₦{quote.kekeFare}
        </button>
      </div>
    </div>
  )
}

export function LocationSheet({ onCreate }: { onCreate: () => void }) {
  const { state, selectedId, select, act } = useGame()
  const location = selectedId ? getLocation(selectedId) : undefined
  if (!location) return null

  const close = () => select(null)

  if (!state) {
    return (
      <section className="pointer-events-auto mx-auto w-full max-w-md rounded-3xl bg-white p-4 shadow-2xl ring-1 ring-black/5 sm:p-5">
        <SheetHeader location={location} onClose={close} subtitle={TYPE_META[location.type].label} />
        <p className="mt-3 text-sm text-muted-foreground">
          {`Create your character to hang out at ${location.name}. ${location.description}`}
        </p>
        <button
          type="button"
          onClick={onCreate}
          className="mt-4 w-full rounded-full bg-primary py-3 text-base font-semibold text-primary-foreground shadow-md transition-colors hover:bg-primary/90 focus-visible:ring-4 focus-visible:ring-primary/30 focus-visible:outline-none"
        >
          Create your character · free
        </button>
      </section>
    )
  }

  const isHere = state.locationId === location.id

  return (
    <section
      aria-label={`${location.name} details`}
      className="pointer-events-auto mx-auto max-h-[60dvh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-4 shadow-2xl ring-1 ring-black/5 sm:p-5"
    >
      <SheetHeader
        location={location}
        onClose={close}
        subtitle={isHere ? `You are here · ${TYPE_META[location.type].label}` : TYPE_META[location.type].label}
      />
      {isHere ? (
        <>
          {location.npc ? (
            <div className="mt-3 flex gap-2 rounded-2xl bg-secondary p-3">
              <MessageCircle className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <p className="text-sm">
                <span className="font-semibold">
                  {location.npc.name} <span className="font-normal text-muted-foreground">({location.npc.role})</span>
                </span>
                <br />
                <span className="text-muted-foreground">{`"${location.npc.line}"`}</span>
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">{location.description}</p>
          )}
          {location.actions.length > 0 ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {location.actions.map((actionId) => (
                <ActionButton key={actionId} actionId={actionId} state={state} onAct={act} />
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded-2xl bg-accent p-3 text-sm text-accent-foreground">
              Tap any place on the map and choose Keke to ride there fast.
            </p>
          )}
        </>
      ) : (
        <TravelOptions state={state} location={location} />
      )}
    </section>
  )
}
