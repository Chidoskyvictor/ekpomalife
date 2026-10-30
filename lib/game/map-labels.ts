'use client'

import { useCallback, useSyncExternalStore } from 'react'

/** UI pref: always show place names beside map stickers (default on). */
export const MAP_LABELS_KEY = 'ekp:showMapLabels'

const listeners = new Set<() => void>()

function read(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(MAP_LABELS_KEY) !== '0'
  } catch {
    return true
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const onStorage = (e: StorageEvent) => {
    if (e.key === MAP_LABELS_KEY) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export function setShowMapLabels(value: boolean) {
  try {
    window.localStorage.setItem(MAP_LABELS_KEY, value ? '1' : '0')
  } catch {
    /* ignore quota / private mode */
  }
  listeners.forEach((l) => l())
}

export function useShowMapLabels(): [boolean, (value: boolean) => void] {
  const shown = useSyncExternalStore(subscribe, read, () => true)
  const set = useCallback((value: boolean) => setShowMapLabels(value), [])
  return [shown, set]
}
