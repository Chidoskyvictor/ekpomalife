'use client'

import { CheckCircle2, MapPin, Target, XCircle } from 'lucide-react'
import { useState } from 'react'
import { CreateCharacterDialog } from '@/components/hud/create-character-dialog'
import { EventDialog } from '@/components/hud/event-dialog'
import { LocationSheet } from '@/components/hud/location-sheet'
import { PhoneDialog } from '@/components/hud/phone-dialog'
import { StatsPanel } from '@/components/hud/stats-panel'
import { TopBar } from '@/components/hud/top-bar'
import { WelcomeCard } from '@/components/hud/welcome-card'
import { WorldCanvas } from '@/components/world/world-canvas'
import { GameProvider, useGame } from '@/hooks/use-game'
import { getLocation } from '@/lib/game/content'
import { currentObjective } from '@/lib/game/rules'
import { cn } from '@/lib/utils'

function ObjectiveChip() {
  const { state, select } = useGame()
  if (!state) return null
  const objective = currentObjective(state)

  return (
    <button
      type="button"
      onClick={() => objective && select(objective.locationId)}
      className="pointer-events-auto mx-auto flex max-w-full items-center gap-2 rounded-full bg-[#1f7a4c] px-4 py-2 text-xs font-semibold text-white shadow-lg transition-colors hover:bg-[#1a6a42] focus-visible:ring-4 focus-visible:ring-primary/30 focus-visible:outline-none sm:text-sm"
    >
      <Target className="size-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{objective ? objective.label : 'Free roam — build your Ekpoma story'}</span>
    </button>
  )
}

function ToastBubble() {
  const { toast } = useGame()
  return (
    <div aria-live="polite" className="pointer-events-none flex justify-center">
      {toast ? (
        <p
          key={toast.id}
          className={cn(
            'flex animate-in items-center gap-2 rounded-full px-4 py-2 text-sm font-medium shadow-lg fade-in slide-in-from-top-2',
            toast.ok ? 'bg-foreground text-background' : 'bg-destructive text-white',
          )}
        >
          {toast.ok ? <CheckCircle2 className="size-4" aria-hidden="true" /> : <XCircle className="size-4" aria-hidden="true" />}
          {toast.text}
        </p>
      ) : null}
    </div>
  )
}

function CurrentLocationPill() {
  const { state, select } = useGame()
  if (!state) return null
  const location = getLocation(state.locationId)
  return (
    <button
      type="button"
      onClick={() => select(state.locationId)}
      className="pointer-events-auto mx-auto flex items-center gap-2 rounded-full bg-white/95 py-2 pr-4 pl-2 text-sm font-semibold shadow-xl ring-1 ring-black/5 backdrop-blur transition-transform hover:scale-[1.02] focus-visible:ring-4 focus-visible:ring-primary/30 focus-visible:outline-none"
    >
      <span className="flex size-8 items-center justify-center rounded-full bg-accent text-base" aria-hidden="true">
        {location?.emoji}
      </span>
      <MapPin className="size-4 text-laterite" aria-hidden="true" />
      <span>{location?.name}</span>
      <span className="text-muted-foreground">· What to do here?</span>
    </button>
  )
}

function Hud() {
  const { state, selectedId } = useGame()
  const [createOpen, setCreateOpen] = useState(false)
  const [phoneOpen, setPhoneOpen] = useState(false)
  const openCreate = () => setCreateOpen(true)

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-col gap-2 p-3 sm:p-4">
        <TopBar onCreate={openCreate} onOpenPhone={() => setPhoneOpen(true)} />
        <ObjectiveChip />
        <ToastBubble />
      </div>

      {state ? (
        <aside className="pointer-events-none absolute inset-x-3 top-[124px] z-30 sm:inset-x-auto sm:top-24 sm:left-4">
          <StatsPanel state={state} />
        </aside>
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 p-3 sm:p-4">
        {selectedId ? (
          <LocationSheet onCreate={openCreate} />
        ) : state ? (
          <CurrentLocationPill />
        ) : (
          <WelcomeCard onCreate={openCreate} />
        )}
      </div>

      <CreateCharacterDialog open={createOpen} onOpenChange={setCreateOpen} />
      <PhoneDialog open={phoneOpen} onOpenChange={setPhoneOpen} />
      <EventDialog />
    </>
  )
}

export default function GameShell() {
  return (
    <GameProvider>
      <main className="relative h-dvh w-full overflow-hidden">
        <h1 className="sr-only">Ekpoma Life</h1>
        <WorldCanvas />
        <Hud />
      </main>
    </GameProvider>
  )
}
