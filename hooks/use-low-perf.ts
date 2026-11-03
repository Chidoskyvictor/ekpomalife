'use client'

import { useSyncExternalStore } from 'react'

/**
 * Low-perf / low-data mode: cheap CPUs (≤ 4 cores), Data Saver on, or a slow
 * connection (slow-2g, 2g, 3g). In this mode we drop
 * blur/backdrop-filter. We never lower DPR, antialias or texture quality.
 *
 * First paint assumes capable so SSR and hydration stay stable.
 * While low, `<html data-low-perf>` is set so plain CSS can react too.
 */

type NetworkInformation = EventTarget & {
  saveData?: boolean
  effectiveType?: string
}

const SLOW_TYPES = new Set(['slow-2g', '2g', '3g'])

function connection(): NetworkInformation | undefined {
  if (typeof navigator === 'undefined') return undefined
  return (navigator as Navigator & { connection?: NetworkInformation }).connection
}

/** True when the network says data is scarce (Data Saver or a 3G-or-slower link). */
function isLowData(): boolean {
  const conn = connection()
  if (!conn) return false
  return conn.saveData === true || SLOW_TYPES.has(conn.effectiveType ?? '')
}

function readLowPerf(): boolean {
  if (typeof navigator === 'undefined') return false
  const cores = navigator.hardwareConcurrency || 8
  return cores <= 4 || isLowData()
}

function syncHtmlFlag(low: boolean) {
  const root = document.documentElement
  if (low) root.setAttribute('data-low-perf', '')
  else root.removeAttribute('data-low-perf')
}

const listeners = new Set<() => void>()
let current = false
let started = false

function onConnectionChange() {
  const next = readLowPerf()
  if (next === current) return
  current = next
  syncHtmlFlag(current)
  listeners.forEach((fn) => fn())
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  if (!started) {
    started = true
    current = readLowPerf()
    syncHtmlFlag(current)
    connection()?.addEventListener('change', onConnectionChange)
  }
  return () => {
    listeners.delete(fn)
    if (listeners.size === 0 && started) {
      started = false
      connection()?.removeEventListener('change', onConnectionChange)
    }
  }
}

const getSnapshot = () => (started ? current : readLowPerf())
const getServerSnapshot = () => false

/** Cheap device or low-data connection. Updates when the connection changes. */
export function useLowPerf() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
