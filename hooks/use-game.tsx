'use client'

import { useRouter } from 'next/navigation'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { fetchAuthMe } from '@/lib/auth/fetch-auth-me'
import { getPostAuthRoute } from '@/lib/auth/post-auth-redirect'
import { pathsEqual, replaceNavigation } from '@/lib/navigation/safe-nav'
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
  /** Logged-out visitor on / — map only, no authenticated game API. */
  isGuest: boolean
  state: GameState | null
  /** True until the first GET /game/state resolves (ok or error). */
  booting: boolean
  bootError: string | null
  selectedId: string | null
  pendingEvent: GameEvent | null
  toast: Toast | null
  serverVersion: number
  select: (id: string | null) => void
  act: (
    actionId: ActionId | GameActionId | string,
    opts?: { payload?: { amount?: number; answers?: number[]; questionIds?: string[] }; atHome?: boolean },
  ) => Promise<ServerGameState | null>
  travelTo: (locationId: string, mode: TravelMode) => void
  chooseEvent: (choice: EventChoice) => void
  resetGame: () => void
  changeDream: (dreamId: DreamId) => void
  /** Show a newly saved look straight away (the server already has it). */
  changeLook: (appearance: Appearance) => void
  dismissDreamCelebration: () => void
  logOut: () => void
  refreshServer: () => Promise<void>
  /** Re-run the initial /game/state load after a boot failure. */
  retryBoot: () => void
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

const SERVER_ACTIONS = new Set<string>([
  'eat',
  'sleep',
  'shower',
  'study',
  'hangout',
  'travel',
  'work-placeholder',
  'nap',
  'rest',
  'toilet',
  'bucket-bath',
  'cook',
  'pay-school-fees',
  'course-registration',
  'collect-matric-gown',
  'collect-id-card',
  'convocation-clearance',
  'convocation-gown',
  'convocation-ceremony',
  'check-result',
  'attend-lecture',
  'submit-assignment',
  'take-quiz',
  'night-class',
  'write-exam',
  'exams-pointer',
  'clinic-treat',
  'sports-train',
  'centre-hangout',
  'meet-hod',
  'faculty-notices',
  'shuttle-travel',
])

function isServerAction(id: string): id is GameActionId {
  return SERVER_ACTIONS.has(id)
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
    gameTime: server.gameTime,
    campus: server.campus ?? base.campus,
    dream: { ...base.dream, netWorth: server.cash },
  }
}

const POLL_MS = 30_000

export function GameProvider({
  children,
  guest: guestProp = false,
}: {
  children: ReactNode
  guest?: boolean
}) {
  const router = useRouter()
  const [isGuest, setIsGuest] = useState(guestProp)
  const [state, setState] = useState<GameState | null>(null)
  const [booting, setBooting] = useState(true)
  const [bootError, setBootError] = useState<string | null>(null)
  const [bootKey, setBootKey] = useState(0)
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
    setBooting(false)
    setBootError(null)
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

  const retryBoot = useCallback(() => {
    setBootError(null)
    setBooting(true)
    setBootKey((key) => key + 1)
  }, [])

  useEffect(() => {
    setIsGuest(guestProp)
  }, [guestProp])

  useEffect(() => {
    if (isGuest) {
      setState(null)
      shellRef.current = null
      setBooting(false)
      setBootError(null)
      setSelectedId(null)
      return
    }

    // Never paint localStorage cash as final truth — merge GET /game/state as soon as it
    // returns. Do not wait on /character (that was blocking the balance for a long beat).
    let cancelled = false
    void (async () => {
      setBooting(true)
      setBootError(null)
      // Show last local shell immediately (bank-style) while the server confirms cash.
      const shell = loadLocalShell()
      if (shell && !cancelled) {
        shellRef.current = shell
        setState(shell)
      }
      const result = await fetchGameState()
      if (cancelled) return
      if (!result.ok) {
        if (result.error === 'SETUP_INCOMPLETE' || result.code === 'SETUP_INCOMPLETE') {
          setState(null)
          shellRef.current = null
          setBooting(false)
          const me = await fetchAuthMe()
          if (!cancelled) {
            const dest = getPostAuthRoute(me)
            if (!pathsEqual(dest, window.location.pathname)) {
              replaceNavigation(router, dest, window.location.pathname)
            }
          }
          return
        }
        if (result.code === 'UNAUTHORIZED' || result.status === 401) {
          const me = await fetchAuthMe({ force: true })
          if (!cancelled && !me) {
            clearSession()
            setIsGuest(true)
            setState(null)
            shellRef.current = null
            setBooting(false)
            setBootError(null)
            return
          }
          setBooting(false)
          if (!cancelled) {
            setBootError('Session hiccup. Tap retry.')
          }
          return
        }
        setBooting(false)
        setBootError(
          result.network
            ? "Can't reach the server, retrying…"
            : result.error || 'Could not load your life.',
        )
        return
      }
      shellRef.current = shellRef.current ?? loadLocalShell()
      mergeServer(result)
      // Enrich look/traits after cash is already on screen.
      void loadCharacter().then((character) => {
        if (cancelled || !character.ok) return
        setState((current) => {
          if (!current) return current
          const next = {
            ...current,
            dreamId: (character.dreamId as DreamId) ?? current.dreamId,
            appearance: character.appearance ?? current.appearance,
            traits: character.traits.length ? character.traits : current.traits,
            characterType: (character.characterType as CharacterTypeId) ?? current.characterType,
            lodgingId: (character.lodgingId as LodgingId) ?? current.lodgingId,
            courseId: character.courseId ?? current.courseId,
            badges: character.badges.length ? character.badges : current.badges,
          }
          shellRef.current = next
          return next
        })
      })
    })()
    return () => {
      cancelled = true
    }
  }, [mergeServer, bootKey, isGuest, router])

  // Hard stop — never leave the balance shimmer spinning past 12s.
  useEffect(() => {
    if (!booting || isGuest) return
    const timer = window.setTimeout(() => {
      setBooting(false)
      setBootError((prev) => prev ?? 'Balance is taking too long. Tap retry.')
    }, 12_000)
    return () => window.clearTimeout(timer)
  }, [booting, bootKey, isGuest])

  useEffect(() => {
    if (isGuest) return
    const id = window.setInterval(() => {
      void refreshServer()
    }, POLL_MS)
    return () => window.clearInterval(id)
  }, [refreshServer, isGuest])

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
    async (
      actionId: ActionId | GameActionId | string,
      opts?: { payload?: { amount?: number; answers?: number[]; questionIds?: string[] }; atHome?: boolean },
    ) => {
      const serverId = isServerAction(actionId) ? actionId : LEGACY_TO_SERVER[actionId as ActionId]
      if (!serverId || !state) {
        notify('That action is not available yet.', false)
        return null
      }
      const result = await postGameAction({
        actionId: serverId,
        targetPlaceId: selectedId ?? state.locationId,
        version: versionRef.current,
        payload: opts?.payload,
        traits: state.traits,
        atHome: opts?.atHome,
      })
      if (!result.ok) {
        const { handleApiFail } = await import('@/lib/api/handle-fail')
        await handleApiFail(result, {
          toast: (text, ok) => notify(text, ok ?? false),
          refreshServer,
        })
        return null
      }
      mergeServer(result)
      notify(result.message || 'Done.', true)
      void syncDream()
      return result
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
          const { handleApiFail } = await import('@/lib/api/handle-fail')
          await handleApiFail(result, {
            toast: (text, ok) => notify(text, ok ?? false),
            refreshServer,
          })
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
      isGuest,
      state,
      booting,
      bootError,
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
      changeLook: (appearance: Appearance) => {
        // Server refreshes rebuild state from shellRef, so the new look must land there too
        if (shellRef.current) shellRef.current = { ...shellRef.current, appearance }
        setState((current) => (current ? { ...current, appearance } : current))
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
      retryBoot,
      applyServerState: mergeServer,
      notifyToast: (text: string, ok = true) => notify(text, ok),
    }),
    [
      isGuest,
      state,
      booting,
      bootError,
      selectedId,
      pendingEvent,
      toast,
      serverVersion,
      act,
      travelTo,
      chooseEvent,
      refreshServer,
      retryBoot,
      mergeServer,
      notify,
    ],
  )

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}

export function useGame() {
  const context = useContext(GameContext)
  if (!context) throw new Error('useGame must be used inside GameProvider')
  return context
}
