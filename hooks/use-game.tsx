'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { clearSession, getSession, saveKey } from '@/lib/game/accounts'
import { checkDreamProgress, loadCharacter } from '@/lib/game/character-api'
import { AVATAR_COLORS } from '@/lib/game/content'
import { emptyDreamSnapshot, type DreamId } from '@/lib/game/dreams'
import { fetchGameState, postGameAction, type ServerGameState } from '@/lib/game/game-api'
import { type CharacterTypeId, type LodgingId } from '@/lib/game/live'
import { type Appearance } from '@/lib/game/look'
import type { GameActionId } from '@/lib/game/places'
import { applyDreamReward, createInitialState, resetDreamProgress, resolveEvent } from '@/lib/game/rules'
import type { TraitId } from '@/lib/game/traits'
import type { ActionId, EventChoice, GameEvent, GameState, TimePeriod, TravelMode } from '@/lib/game/types'

export type Toast = { id: number; text: string; ok: boolean }

type GameContextValue = {
  state: GameState | null
  selectedId: string | null
  pendingEvent: GameEvent | null
  toast: Toast | null
  serverVersion: number
  select: (id: string | null) => void
  act: (actionId: ActionId | GameActionId) => void
  travelTo: (locationId: string, mode: TravelMode) => void
  chooseEvent: (choice: EventChoice) => void
  resetGame: () => void
  changeDream: (dreamId: DreamId) => void
  dismissDreamCelebration: () => void
  logOut: () => void
  refreshServer: () => Promise<void>
  /** Apply cash/needs/time from a server (or economy) response — never invent numbers. */
  applyServerState: (server: ServerGameState) => void
  notifyToast: (text: string, ok?: boolean) => void
}

const GameContext = createContext<GameContextValue | null>(null)

const randomAvatarColor = () => AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]!

const LEGACY_TO_SERVER: Partial<Record<ActionId, GameActionId>> = {
  eat: 'eat',
  rest: 'sleep',
  study: 'study',
  socialize: 'hangout',
  night_class: 'study',
  workout: 'hangout',
  buy_snack: 'eat',
  market_run: 'eat',
  pos_shift: 'work-placeholder',
  errand: 'work-placeholder',
  watch_match: 'hangout',
  pray: 'hangout',
  feedback: 'hangout',
  buy_phone: 'work-placeholder',
}

function isServerAction(id: string): id is GameActionId {
  return (
    id === 'eat' ||
    id === 'sleep' ||
    id === 'shower' ||
    id === 'study' ||
    id === 'hangout' ||
    id === 'travel' ||
    id === 'work-placeholder'
  )
}

export function startNewLife(
  name: string,
  username: string,
  appearance?: Appearance,
  traits?: TraitId[],
  dreamId?: DreamId | null,
  extras?: {
    characterType?: CharacterTypeId
    lodgingId?: LodgingId
    courseId?: string
    startingCash?: number
  },
) {
  const color = appearance ? appearance.topColor : randomAvatarColor()
  const state = createInitialState(name, username, color, appearance, traits, dreamId, extras)
  /** Local shell only — cash/needs are overwritten from GET /game/state. */
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
    hunger: raw.hunger ?? 72,
    hygiene: raw.hygiene ?? 80,
    fun: raw.fun ?? 65,
    social: raw.social ?? Math.min(100, (raw.reputation ?? 0) + 40),
    xp: raw.xp ?? Math.max(0, (raw.day - 1) * 20),
  }
}

function loadLocalShell(): GameState | null {
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

function applyServer(shell: GameState | null, server: ServerGameState, username: string): GameState {
  const base =
    shell ??
    createInitialState('Player', username, randomAvatarColor(), undefined, undefined, null, {
      startingCash: server.cash,
    })
  const needs = server.needs
  return {
    ...base,
    cash: server.cash,
    hunger: needs.hunger,
    energy: needs.energy,
    hygiene: needs.hygiene,
    fun: needs.fun,
    social: needs.social,
    academic: needs.study,
    health: Math.round((needs.energy + needs.hygiene) / 2),
    locationId: server.locationId,
    day: server.day,
    period: (server.period as TimePeriod) || 'morning',
    timeLabel: server.timeLabel,
    dream: { ...base.dream, netWorth: server.cash },
  }
}

const POLL_MS = 30_000

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GameState | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pendingEvent, setPendingEvent] = useState<GameEvent | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [serverVersion, setServerVersion] = useState(1)
  const versionRef = useRef(1)
  const shellRef = useRef<GameState | null>(null)

  const notify = useCallback((text: string, ok: boolean) => setToast({ id: Date.now(), text, ok }), [])

  const mergeServer = useCallback((server: ServerGameState) => {
    const username = getSession() || shellRef.current?.username || 'player'
    const next = applyServer(shellRef.current, server, username)
    shellRef.current = next
    versionRef.current = server.version
    setServerVersion(server.version)
    setState(next)
    /** Persist shell without trusting it for cash — server wins on next load. */
    try {
      window.localStorage.setItem(saveKey(next.username), JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }, [])

  const refreshServer = useCallback(async () => {
    const result = await fetchGameState()
    if (!result.ok) return
    mergeServer(result)
  }, [mergeServer])

  useEffect(() => {
    const shell = loadLocalShell()
    shellRef.current = shell
    if (shell) setState(shell)
    void (async () => {
      const character = await loadCharacter()
      if (character.ok && shell) {
        shellRef.current = {
          ...shell,
          dreamId: (character.dreamId as DreamId) ?? shell.dreamId,
          appearance: character.appearance ?? shell.appearance,
          traits: character.traits.length ? character.traits : shell.traits,
          characterType: (character.characterType as CharacterTypeId) ?? shell.characterType,
          lodgingId: (character.lodgingId as LodgingId) ?? shell.lodgingId,
          courseId: character.courseId ?? shell.courseId,
          badges: character.badges.length ? character.badges : shell.badges,
        }
      }
      await refreshServer()
    })()
  }, [refreshServer])

  useEffect(() => {
    const id = window.setInterval(() => {
      void refreshServer()
    }, POLL_MS)
    return () => window.clearInterval(id)
  }, [refreshServer])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 3200)
    return () => window.clearTimeout(timer)
  }, [toast])

  const syncDream = useCallback(async () => {
    const result = await checkDreamProgress()
    if (!result.ok || !result.newlyCompleted || !result.reward) return
    setState((current) => (current ? applyDreamReward(current, result.reward!) : current))
  }, [])

  const act = useCallback(
    (actionId: ActionId | GameActionId) => {
      const serverId = isServerAction(actionId) ? actionId : LEGACY_TO_SERVER[actionId as ActionId]
      if (!serverId || !state) {
        notify('That action is not available yet.', false)
        return
      }
      void (async () => {
        const result = await postGameAction({
          actionId: serverId,
          targetPlaceId: selectedId && serverId === 'travel' ? selectedId : state.locationId,
          version: versionRef.current,
        })
        if (!result.ok) {
          notify(result.error, false)
          if (result.conflict) await refreshServer()
          return
        }
        mergeServer(result)
        notify(result.message || 'Done.', true)
        void syncDream()
      })()
    },
    [state, selectedId, notify, mergeServer, refreshServer, syncDream],
  )

  const travelTo = useCallback(
    (locationId: string, _mode: TravelMode) => {
      if (!state) return
      void (async () => {
        const atTransport =
          state.locationId === 'keke-park' || state.locationId === 'shuttle-park'
        if (!atTransport) {
          notify('Go to Keke Park or Shuttle Park to travel.', false)
          setSelectedId(locationId)
          return
        }
        const result = await postGameAction({
          actionId: 'travel',
          targetPlaceId: locationId,
          version: versionRef.current,
        })
        if (!result.ok) {
          notify(result.error, false)
          if (result.conflict) await refreshServer()
          return
        }
        mergeServer(result)
        notify(result.message || 'You arrived.', true)
        setSelectedId(locationId)
        void syncDream()
      })()
    },
    [state, notify, mergeServer, refreshServer, syncDream],
  )

  const chooseEvent = useCallback(
    (choice: EventChoice) => {
      if (!state || !pendingEvent) return
      const next = resolveEvent(state, pendingEvent, choice)
      setState(next)
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
      serverVersion,
      select: setSelectedId,
      act,
      travelTo,
      chooseEvent,
      resetGame: () => {
        if (!state) return
        setState(
          startNewLife(state.characterName, state.username, state.appearance, state.traits, state.dreamId, {
            characterType: state.characterType,
            lodgingId: state.lodgingId,
            courseId: state.courseId,
          }),
        )
        setSelectedId(null)
        setPendingEvent(null)
        void refreshServer()
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
      refreshServer,
      applyServerState: mergeServer,
      notifyToast: (text: string, ok = true) => notify(text, ok),
    }),
    [state, selectedId, pendingEvent, toast, serverVersion, act, travelTo, chooseEvent, refreshServer, mergeServer, notify],
  )

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}

export function useGame() {
  const context = useContext(GameContext)
  if (!context) throw new Error('useGame must be used inside GameProvider')
  return context
}
