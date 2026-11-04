'use client'

import { useSyncExternalStore } from 'react'

/** Is the phone open? The 3D map stops drawing while it is (the phone covers it). */
let open = false
const listeners = new Set<() => void>()

export function setPhoneOpenFlag(next: boolean) {
  if (next === open) return
  open = next
  listeners.forEach((l) => l())
}

export function usePhoneOpenFlag(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => open,
    () => false,
  )
}
