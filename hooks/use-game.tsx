'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { clearSession, getSession, saveKey } from '@/lib/game/accounts'
import { checkDreamProgress } from '@/lib/game/character-api'
import { AVATAR_COLORS } from '@/lib/game/content'
import { emptyDreamSnapshot, snapshotFromLife, type DreamId } from '@/lib/game/dreams'
import { type Appearance } from '@/lib/game/look'
import { applyDreamReward, createInitialState, performAction, resetDreamProgress, resolveEvent, travel } from '@/lib/game/rules'
import type { TraitId } from '@/lib/game/traits'
import type { ActionId, EventChoice, GameEvent, GameState, TravelMode } from '@/lib/game/types'

export type Toast = { id: number; text: string; ok: boolean }

type GameContextValue = {
  state: GameState | null
  selectedId: string | null
  pendingEvent: GameEvent | null
  toast: Toast | null
  select: (id: string | null) => void
  act: (actionId: ActionId) => void
  travelTo: (locationId: string, mode: TravelMode) => void
  chooseEvent: (choice: EventChoice) => void
  resetGame: () => void
  changeDream: (dreamId: DreamId) => void
  dismissDreamCelebration: () => void
  logOut: () => void
}

const GameContext = createContext<GameContextValue | null>(null)

const randomAvatarColor = () => AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]!

export function startNewLife(
  name: string,
  username: string,
  appearance?: Appearance,
  traits?: TraitId[],
  dreamId?: DreamId | null,
) {
  const color = appearance ? appearance.topColor : randomAvatarColor()
  const state = createInitialState(name, username, color, appearance, traits, dreamId)
  window.localStorage.setItem(saveKey(username), JSON.stringify(state))
  return state
}

function normalizeState(raw: GameState): GameState {
  return {
    ...raw,
    dreamId: raw.dreamId ?? null,
    dream: { ...emptyDreamSnapshot(), ...raw.dream, netWorth: raw.cash },
    badges: raw.badges ?? [],
    dreamCompleted: Boolean(raw.dreamCompleted),
    dreamCelebrated: Boolean(raw.dreamCelebrated),
  }
}

function loadState(): GameState | null {
  try {
    const username = getSession()
    if (!username) return null
    const raw = window.localStorage.getItem(saveKey(username))
    if (raw) return normalizeState(JSON.parse(raw) as GameState)
    return null
  } catch {
    return null
  }
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GameState | null>(null)

  useEffect(() => {
    setState(loadState())
  }, [])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pendingEvent, setPendingEvent] = useState<GameEvent | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)

  useEffect(() => {
    if (state) window.localStorage.setItem(saveKey(state.username), JSON.stringify(state))
  }, [state])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 3200)
    return () => window.clearTimeout(timer)
  }, [toast])

  const notify = useCallback((text: string, ok: boolean) => setToast({ id: Date.now(), text, ok }), [])

  const syncDream = useCallback(async (next: GameState) => {
    if (!next.dreamId || next.dreamCompleted) return
    const result = await checkDreamProgress(snapshotFromLife(next.cash, next.dream))
    if (!result.ok || !result.newlyCompleted || !result.reward) return
    setState((current) => (current ? applyDreamReward(current, result.reward!) : current))
  }, [])

  const act = useCallback(
    (actionId: ActionId) => {
      if (!state) return
      const result = performAction(state, actionId)
      setState(result.state)
      notify(result.message, result.ok)
      void syncDream(result.state)
    },
    [state, notify, syncDream],
  )

  const travelTo = useCallback(
    (locationId: string, mode: TravelMode) => {
      if (!state) return
      const result = travel(state, locationId, mode)
      setState(result.state)
      notify(result.message, result.ok)
      if (result.event) setPendingEvent(result.event)
      void syncDream(result.state)
    },
    [state, notify, syncDream],
  )

  const chooseEvent = useCallback(
    (choice: EventChoice) => {
      if (!state || !pendingEvent) return
      const next = resolveEvent(state, pendingEvent, choice)
      setState(next)
      notify(choice.outcome, true)
      setPendingEvent(null)
      void syncDream(next)
    },
    [state, pendingEvent, notify, syncDream],
  )

  const value = useMemo<GameContextValue>(
    () => ({
      state,
      selectedId,
      pendingEvent,
      toast,
      select: setSelectedId,
      act,
      travelTo,
      chooseEvent,
      resetGame: () => {
        if (!state) return
        setState(startNewLife(state.characterName, state.username, state.appearance, state.traits, state.dreamId))
        setSelectedId(null)
        setPendingEvent(null)
      },
      changeDream: (dreamId: DreamId) => {
        if (!state) return
        setState(resetDreamProgress(state, dreamId))
      },
      dismissDreamCelebration: () => {
        setState((current) => (current ? { ...current, dreamCelebrated: true } : current))
      },
      logOut: () => {
        clearSession()
        setState(null)
        setSelectedId(null)
        setPendingEvent(null)
      },
    }),
    [state, selectedId, pendingEvent, toast, act, travelTo, chooseEvent],
  )

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}

export function useGame() {
  const context = useContext(GameContext)
  if (!context) throw new Error('useGame must be used inside GameProvider')
  return context
}
