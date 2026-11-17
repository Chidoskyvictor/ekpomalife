'use client'

import { useSyncExternalStore } from 'react'

/*
 * A hired decorator inside the owner's house: while set, Buy mode works on the OWNER's furniture
 * through the job-key endpoints (/gigs/:id/home/…), pays from the job's item budget and can only
 * move or store pieces (never sell). The room screen sets it when the player holds an open key.
 */
export type GigHouse = { gigId: string; ownerUsername: string; budgetLeft: number }

let current: GigHouse | null = null
const listeners = new Set<() => void>()

export const gigHouse = () => current

export function setGigHouse(next: GigHouse | null) {
  current = next
  listeners.forEach((fn) => fn())
}

export const patchGigBudget = (budgetLeft: number) => {
  if (current) setGigHouse({ ...current, budgetLeft })
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}

export function useGigHouse(): GigHouse | null {
  return useSyncExternalStore(subscribe, gigHouse, () => null)
}
