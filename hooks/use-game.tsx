'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { clearSession, getAccount, getSession, saveKey } from '@/lib/game/accounts'
import { AVATAR_COLORS } from '@/lib/game/content'
import { createInitialState, performAction, resolveEvent, travel } from '@/lib/game/rules'
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
  logOut: () => void
}

const GameContext = createContext<GameContextValue | null>(null)

const randomAvatarColor = () => AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]!

export function startNewLife(name: string, username: string) {
  const state = createInitialState(name, username, randomAvatarColor())
  window.localStorage.setItem(saveKey(username), JSON.stringify(state))
  return state
}

function loadState(): GameState | null {
  try {
    const username = getSession()
    if (!username) return null
    const raw = window.localStorage.getItem(saveKey(username))
    if (raw) return JSON.parse(raw) as GameState
    const account = getAccount(username)
    return account ? startNewLife(account.name, account.username) : null
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
    if (state) window.localStorage.setItem(saveKey(state.username), JSON.stringify(state))
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
      act,
      travelTo,
      chooseEvent,
      resetGame: () => {
        if (!state) return
        setState(startNewLife(state.characterName, state.username))
        setSelectedId(null)
        setPendingEvent(null)
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
