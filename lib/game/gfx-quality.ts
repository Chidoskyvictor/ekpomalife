'use client'

import { useSyncExternalStore } from 'react'

/**
 * 3D quality tier for the home scenes.
 *  low    – cheap phones: no shadows, 2 lamp lights, small textures, lower pixel ratio, no MSAA
 *  medium – typical phones: baked-look AO, 4 lamp lights, no realtime shadows
 *  high   – desktop / strong phones: adds one soft sun shadow map
 * Auto-detected from the device; the player can override it (Settings → Graphics) and
 * `?quality=low|medium|high` overrides for one visit (handy for testing).
 */
export type GfxTier = 'low' | 'medium' | 'high'
export type GfxPref = 'auto' | GfxTier

export const GFX_KEY = 'ekp:gfxQuality'
const TIERS: GfxTier[] = ['low', 'medium', 'high']
const listeners = new Set<() => void>()

export function isGfxPref(v: unknown): v is GfxPref {
  return v === 'auto' || v === 'low' || v === 'medium' || v === 'high'
}

export function readGfxPref(): GfxPref {
  if (typeof window === 'undefined') return 'auto'
  try {
    const q = new URLSearchParams(window.location.search).get('quality')
    if (isGfxPref(q)) return q
    const v = window.localStorage.getItem(GFX_KEY)
    return isGfxPref(v) ? v : 'auto'
  } catch {
    return 'auto'
  }
}

export function setGfxPref(value: GfxPref) {
  try {
    window.localStorage.setItem(GFX_KEY, value)
  } catch {
    /* private mode */
  }
  listeners.forEach((l) => l())
}

/** Pick a tier from what the browser tells us about the device. */
export function detectGfxTier(): GfxTier {
  if (typeof navigator === 'undefined') return 'medium'
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } }
  const cores = nav.hardwareConcurrency || 4
  const memory = nav.deviceMemory ?? 4
  const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
  if (nav.connection?.saveData || memory <= 2 || cores <= 4) return 'low'
  if (!touch && cores >= 8 && memory >= 8) return 'high'
  return 'medium'
}

export function resolveGfxTier(pref: GfxPref): GfxTier {
  return pref === 'auto' ? detectGfxTier() : pref
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  window.addEventListener('storage', fn)
  return () => {
    listeners.delete(fn)
    window.removeEventListener('storage', fn)
  }
}

/** The tier the scene should render at ('medium' until the client has mounted, for stable hydration). */
export function useGfxTier(): GfxTier {
  const pref = useSyncExternalStore(subscribe, readGfxPref, () => 'auto' as GfxPref)
  return resolveGfxTier(pref)
}

export function useGfxPref(): [GfxPref, (v: GfxPref) => void] {
  const pref = useSyncExternalStore(subscribe, readGfxPref, () => 'auto' as GfxPref)
  return [pref, setGfxPref]
}

export type GfxSettings = {
  dpr: [number, number]
  antialias: boolean
  shadows: boolean
  shadowMap: number
  maxLamps: number
  textureSize: number
  anisotropy: number
}

export const GFX: Record<GfxTier, GfxSettings> = {
  low: { dpr: [1, 1.25], antialias: false, shadows: false, shadowMap: 0, maxLamps: 2, textureSize: 128, anisotropy: 1 },
  medium: { dpr: [1, 1.5], antialias: true, shadows: false, shadowMap: 0, maxLamps: 4, textureSize: 256, anisotropy: 2 },
  high: { dpr: [1, 1.85], antialias: true, shadows: true, shadowMap: 1024, maxLamps: 4, textureSize: 256, anisotropy: 4 },
}

export { TIERS as GFX_TIERS }
