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
  isZoneDebugEnabled,
  mergeZonePlacement,
  readZoneOverrides,
  writeZoneOverrides,
  type ZoneOverride,
  type ZonePlacement,
} from '@/lib/game/zone-debug'

type ZoneDebugContextValue = {
  enabled: boolean
  overrides: Record<string, ZoneOverride>
  setOverride: (zoneId: string, patch: Partial<ZoneOverride>) => void
  clearOverride: (zoneId: string) => void
  placementFor: (
    zoneId: string,
    base: {
      position: [number, number]
      rotation: number
      scale?: number
      modelY?: number
      scaleMul?: number
    },
  ) => ZonePlacement
}

const ZoneDebugContext = createContext<ZoneDebugContextValue | null>(null)

export function ZoneDebugProvider({ children }: { children: ReactNode }) {
  const enabled = isZoneDebugEnabled()
  const [overrides, setOverrides] = useState<Record<string, ZoneOverride>>(() =>
    enabled ? readZoneOverrides() : {},
  )

  const persist = useCallback((next: Record<string, ZoneOverride>) => {
    setOverrides(next)
    writeZoneOverrides(next)
  }, [])

  const setOverride = useCallback(
    (zoneId: string, patch: Partial<ZoneOverride>) => {
      persist({ ...overrides, [zoneId]: { ...overrides[zoneId], ...patch } })
    },
    [overrides, persist],
  )

  const clearOverride = useCallback(
    (zoneId: string) => {
      const next = { ...overrides }
      delete next[zoneId]
      persist(next)
    },
    [overrides, persist],
  )

  const placementFor = useCallback(
    (
      zoneId: string,
      base: {
        position: [number, number]
        rotation: number
        scale?: number
        modelY?: number
        scaleMul?: number
      },
    ) => mergeZonePlacement(zoneId, base, overrides),
    [overrides],
  )

  const value = useMemo(
    () => ({ enabled, overrides, setOverride, clearOverride, placementFor }),
    [enabled, overrides, setOverride, clearOverride, placementFor],
  )

  return <ZoneDebugContext.Provider value={value}>{children}</ZoneDebugContext.Provider>
}

export function useZoneDebug() {
  return useContext(ZoneDebugContext)
}

export function useZonePlacement(
  zoneId: string,
  base: {
    position: [number, number]
    rotation: number
    scale?: number
    modelY?: number
    scaleMul?: number
  },
): ZonePlacement {
  const ctx = useZoneDebug()
  if (!ctx) {
    return mergeZonePlacement(zoneId, base, {})
  }
  return ctx.placementFor(zoneId, base)
}

const ZoneExtrasContext = createContext({ modelY: 0, scaleMul: 1 })

export function ZoneExtrasProvider({
  modelY,
  scaleMul,
  children,
}: {
  modelY: number
  scaleMul: number
  children: ReactNode
}) {
  const value = useMemo(() => ({ modelY, scaleMul }), [modelY, scaleMul])
  return <ZoneExtrasContext.Provider value={value}>{children}</ZoneExtrasContext.Provider>
}

export function useZoneExtras() {
  return useContext(ZoneExtrasContext)
}
