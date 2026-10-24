'use client'

import { useEffect } from 'react'
import { Footprints, X } from 'lucide-react'
import { AuthLinks } from '@/components/hud/auth-links'
import { JobsPanel } from '@/components/hud/jobs-panel'
import { ShopGrid } from '@/components/hud/shop-grid'
import { useEconomy } from '@/hooks/use-economy'
import { useGame } from '@/hooks/use-game'
import { TYPE_META } from '@/lib/game/content'
import {
  ACTION_LABELS,
  getPlace,
  getPlaceByZone,
  type GameActionId,
  type Place,
  type PlaceType,
} from '@/lib/game/places'
import type { GameState } from '@/lib/game/types'
import { cn } from '@/lib/utils'
import econStyles from './economy.module.css'

const TYPE_EMOJI: Record<PlaceType, string> = {
  campus: '🎓',
  hostel: '🛏️',
  food: '🍲',
  shop: '🛍️',
  transport: '🛺',
  leisure: '⚽',
  worship: '🙏',
  community: '💡',
}

function resolvePlace(id: string | null): Place | null {
  if (!id) return null
  return getPlace(id) ?? getPlaceByZone(id)
}

function SheetHeader({ place, onClose, subtitle }: { place: Place; onClose: () => void; subtitle: string }) {
  const typeMeta = TYPE_META[place.type] ?? { label: place.type, color: '#F0EEE5' }
  return (
    <div className="flex items-start gap-3">
      <span
        className="flex size-11 shrink-0 items-center justify-center rounded-2xl text-2xl"
        style={{ backgroundColor: typeMeta.color }}
        aria-hidden="true"
      >
        {TYPE_EMOJI[place.type]}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{subtitle}</p>
        <h2 className="truncate text-lg font-bold leading-tight">{place.label}</h2>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="liquid-glass-chip flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-4 focus-visible:ring-primary/30 focus-visible:outline-none"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  )
}

function ActionButton({
  actionId,
  onAct,
}: {
  actionId: GameActionId
  onAct: (id: GameActionId) => void
}) {
  const meta = ACTION_LABELS[actionId] ?? { label: actionId, hint: '' }
  return (
    <button
      type="button"
      onClick={() => onAct(actionId)}
      className="flex flex-col items-start gap-0.5 rounded-2xl border p-3 text-left transition-colors liquid-glass-chip hover:border-primary/50 hover:bg-white/50 focus-visible:ring-4 focus-visible:ring-primary/30 focus-visible:outline-none"
    >
      <span className="text-sm font-semibold">{meta.label}</span>
      <span className="text-xs text-muted-foreground">{meta.hint}</span>
    </button>
  )
}

function TravelPicker({ state, place }: { state: GameState; place: Place }) {
  const { travelTo } = useGame()
  const here = resolvePlace(state.locationId)
  return (
    <div className="mt-3">
      <p className="text-sm text-muted-foreground">Travel here from {here?.label ?? 'your spot'}.</p>
      <div className="mt-2 grid grid-cols-1 gap-2">
        <button
          type="button"
          onClick={() => travelTo(place.id, 'keke')}
          className="flex items-center justify-center gap-2 rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:ring-4 focus-visible:ring-primary/30 focus-visible:outline-none"
        >
          <span aria-hidden="true">🛺</span>
          Go by keke
        </button>
        <button
          type="button"
          onClick={() => travelTo(place.id, 'walk')}
          className={cn(
            'liquid-glass-chip flex items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold transition-colors hover:border-primary/50 focus-visible:ring-4 focus-visible:ring-primary/30 focus-visible:outline-none',
          )}
        >
          <Footprints className="size-4" aria-hidden="true" />
          Walk (still uses travel stop)
        </button>
      </div>
    </div>
  )
}

const SHOP_PLACES = new Set(['town-shop-1', 'bukka'])

export function LocationSheet() {
  const { state, selectedId, select, act } = useGame()
  const { shopItems, loadShop, loading } = useEconomy()
  const place = resolvePlace(selectedId)
  const isShop = Boolean(
    place && (SHOP_PLACES.has(place.id) || place.type === 'shop' || place.type === 'food'),
  )

  useEffect(() => {
    if (!place || !isShop) return
    void loadShop(place.id)
  }, [isShop, place, loadShop])

  if (!place) return null

  const close = () => select(null)
  const typeMeta = TYPE_META[place.type] ?? { label: place.type, color: '#F0EEE5' }

  if (!state) {
    return (
      <section className="liquid-glass pointer-events-auto mx-auto w-full max-w-md rounded-3xl p-4 sm:p-5">
        <SheetHeader place={place} onClose={close} subtitle={typeMeta.label} />
        <p className="mt-3 text-sm text-muted-foreground">
          Sign up or log in to come to {place.label}.
        </p>
        <AuthLinks className="mt-4 justify-end" />
      </section>
    )
  }

  const isHere = state.locationId === place.id

  return (
    <section
      aria-label={`${place.label} details`}
      className="liquid-glass pointer-events-auto mx-auto max-h-[60dvh] w-full max-w-md overflow-y-auto rounded-3xl p-4 sm:p-5"
    >
      <SheetHeader
        place={place}
        onClose={close}
        subtitle={isHere ? `You are here · ${typeMeta.label}` : typeMeta.label}
      />
      {isHere ? (
        <>
          {place.actions.length > 0 ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {place.actions.map((actionId) => (
                <ActionButton key={actionId} actionId={actionId} onAct={(id) => act(id)} />
              ))}
            </div>
          ) : null}
          <JobsPanel placeId={place.id} />
          {isShop ? (
            <div className={econStyles.section}>
              <p className={econStyles.sectionTitle}>Shop</p>
              {loading && shopItems.length === 0 ? (
                <>
                  <div className={econStyles.skeleton} />
                  <div className={econStyles.skeleton} />
                </>
              ) : (
                <ShopGrid items={shopItems} />
              )}
            </div>
          ) : null}
          {place.actions.length === 0 && !isShop ? (
            <p className="liquid-glass-chip mt-3 rounded-2xl p-3 text-sm text-accent-foreground">
              Nothing to do here yet.
            </p>
          ) : null}
        </>
      ) : (
        <TravelPicker state={state} place={place} />
      )}
    </section>
  )
}
