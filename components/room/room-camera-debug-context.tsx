'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  clearRoomCameraOverride,
  isRoomCameraDebugEnabled,
  mergeRoomCamera,
  readRoomCameraOverride,
  type RoomCameraLive,
  type RoomCameraOverride,
  writeRoomCameraOverride,
} from '@/lib/game/room-camera-debug'
import type { RoomCameraPlacement } from '@/lib/game/room-camera'

type Ctx = {
  enabled: boolean
  placement: RoomCameraPlacement
  live: RoomCameraLive | null
  hasOverride: boolean
  setOverride: (patch: RoomCameraOverride) => void
  applyLive: () => void
  reset: () => void
  resetGeneration: number
  reportLive: (live: RoomCameraLive) => void
}

const RoomCameraDebugContext = createContext<Ctx | null>(null)

export function RoomCameraDebugProvider({ children }: { children: ReactNode }) {
  const enabled = isRoomCameraDebugEnabled()
  const [override, setOverrideState] = useState<RoomCameraOverride>(() =>
    enabled ? readRoomCameraOverride() : {},
  )
  const [live, setLive] = useState<RoomCameraLive | null>(null)
  const [resetGeneration, setResetGeneration] = useState(0)

  const placement = useMemo(() => mergeRoomCamera(override), [override])
  const hasOverride = useMemo(() => Object.keys(override).length > 0, [override])

  const setOverride = useCallback((patch: RoomCameraOverride) => {
    setOverrideState((prev) => {
      const next = { ...prev, ...patch }
      writeRoomCameraOverride(next)
      return next
    })
  }, [])

  const reset = useCallback(() => {
    clearRoomCameraOverride()
    setOverrideState({})
    setLive(null)
    setResetGeneration((n) => n + 1)
  }, [])

  const applyLive = useCallback(() => {
    if (!live) return
    setOverride({
      position: live.position,
      target: live.target,
      fov: live.fov,
      minDistance: live.minDistance,
      maxDistance: live.maxDistance,
    })
  }, [live, setOverride])

  const reportLive = useCallback((next: RoomCameraLive) => {
    setLive((prev) => {
      if (!prev) return next
      const same =
        Math.abs(prev.distance - next.distance) < 0.02 &&
        prev.position.every((v, i) => Math.abs(v - next.position[i]!) < 0.01) &&
        prev.target.every((v, i) => Math.abs(v - next.target[i]!) < 0.01) &&
        Math.abs(prev.fov - next.fov) < 0.05
      return same ? prev : next
    })
  }, [])

  const value = useMemo(
    () => ({
      enabled,
      placement,
      live,
      hasOverride,
      setOverride,
      applyLive,
      reset,
      resetGeneration,
      reportLive,
    }),
    [enabled, placement, live, hasOverride, setOverride, applyLive, reset, resetGeneration, reportLive],
  )

  return <RoomCameraDebugContext.Provider value={value}>{children}</RoomCameraDebugContext.Provider>
}

export function useRoomCameraDebug() {
  return useContext(RoomCameraDebugContext)
}
