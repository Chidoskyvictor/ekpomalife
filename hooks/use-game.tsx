'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createInitialState, performAction, resolveEvent, travel } from '@/lib/game/rules'
import type { ActionId, EventChoice, Faculty, GameEvent, GameState, TravelMode } from '@/lib/game/types'

const STORAGE_KEY = 'ekpoma-life-save-v2'

export type Toast = { id: number; text: string; ok: boolean }

type GameContextValue = {
  state: GameState | null
  selectedId: string | null
  pendingEvent: GameEvent | null
  toast: Toast | null
  select: (id: string | null) => void
  startCharacter: (name: string, faculty: Faculty, avatarColor: string) => void
  act: (actionId: ActionId) => void
  travelTo: (locationId: string, mode: TravelMode) => void
  chooseEvent: (choice: EventChoice) => void
  resetGame: () => void
}

const GameContext = createContext<GameContextValue | null>(null)

function loadState(): GameState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as GameState) : null
  } catch {
    return null
  }
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GameState | null>(loadState)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pendingEvent, setPendingEvent] = useState<GameEvent | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)

  useEffect(() => {
    if (state) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 3200)
    return () => window.clearTimeout(timer)
  }, [toast])

  const notify = useCallback((text: string, ok: boolean) => setToast({ id: Date.now(), text, ok }), [])

  const act = useCallback(
    (actionId: ActionId) => {
      if (!state) return
      const result = performAction(state, actionId)
      setState(result.state)
      notify(result.message, result.ok)
    },
    [state, notify],
  )

  const travelTo = useCallback(
    (locationId: string, mode: TravelMode) => {
      if (!state) return
      const result = travel(state, locationId, mode)
      setState(result.state)
      notify(result.message, result.ok)
      if (result.event) setPendingEvent(result.event)
    },
    [state, notify],
  )

  const chooseEvent = useCallback(
    (choice: EventChoice) => {
      if (!state || !pendingEvent) return
      setState(resolveEvent(state, pendingEvent, choice))
      notify(choice.outcome, true)
      setPendingEvent(null)
    },
    [state, pendingEvent, notify],
  )

  const value = useMemo<GameContextValue>(
    () => ({
      state,
      selectedId,
      pendingEvent,
      toast,
      select: setSelectedId,
      startCharacter: (name, faculty, avatarColor) => {
        setState(createInitialState(name, faculty, avatarColor))
        setSelectedId(null)
      },
      act,
      travelTo,
      chooseEvent,
      resetGame: () => {
        window.localStorage.removeItem(STORAGE_KEY)
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
