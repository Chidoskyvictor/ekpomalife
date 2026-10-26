import { useSyncExternalStore } from 'react'

/*
 * What the player is busy doing right now (sleeping, cooking, dancing…) and what's lined up next.
 * The HUD shows it Sims-style: square tiles at the left edge (the running one fills up, ✕ cancels),
 * and a countdown bubble floats over the character's head. Only one thing runs at a time.
 */

export type Activity = {
  emoji: string
  title: string
  /** Real seconds it takes. */
  seconds: number
  startedAt: number
  /** Called when the player taps the pill to stop early. */
  onCancel?: () => void
}

/** An action waiting its turn (Sims-style queue): shown as a dim tile after the running one. */
export type QueuedActivity = { key: string; emoji: string; title: string; onRemove: () => void }

let current: Activity | null = null
let queue: QueuedActivity[] = []
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

/** Replace the waiting list (the screen that runs the actions owns the order). */
export function setActivityQueue(next: QueuedActivity[]) {
  queue = next
  emit()
}

export function useActivityQueue() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => queue,
    () => EMPTY,
  )
}
const EMPTY: QueuedActivity[] = []

export function startActivity(activity: Omit<Activity, 'startedAt'>) {
  current?.onCancel?.()
  current = { ...activity, startedAt: Date.now() }
  emit()
}

/** Clear the pill (finished, or the thing that started it stopped on its own). */
export function endActivity() {
  if (!current) return
  current = null
  emit()
}

export function cancelActivity() {
  const was = current
  current = null
  emit()
  was?.onCancel?.()
}

export function useActivity() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => current,
    () => null,
  )
}

/**
 * Run a timed action: show the pill for `seconds`, then call `onDone`. Resolves true when it
 * finished, false when the player cancelled or something else started.
 */
export function runTimed(activity: Omit<Activity, 'startedAt' | 'onCancel'>, onDone: () => void | Promise<void>) {
  return new Promise<boolean>((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    startActivity({
      ...activity,
      onCancel: () => {
        clearTimeout(timer)
        resolve(false)
      },
    })
    const mine = current
    timer = setTimeout(async () => {
      if (current !== mine) return
      endActivity()
      await onDone()
      resolve(true)
    }, activity.seconds * 1000)
  })
}

/** Real seconds for an action that used to be measured in game minutes (sleep 4 h → 11 s). */
export function actionSeconds(minutes: number) {
  return Math.min(15, Math.max(3, Math.round(3 + minutes / 30)))
}
