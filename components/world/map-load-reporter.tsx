'use client'

import { useEffect, useRef } from 'react'
import { DefaultLoadingManager } from 'three'

/**
 * Lives inside the R3F Canvas. Reports DefaultLoadingManager progress
 * (GLBs via useGLTF) up to the parent overlay.
 *
 * Not drei's useProgress: its store updates synchronously when a model starts
 * loading *during another component's render*, which React reports as
 * "Cannot update a component (MapLoadReporter) while rendering KenneyPart".
 * Here the manager callbacks only record numbers; the parent hears about them
 * on the next task, after render.
 */
export function MapLoadReporter({
  onProgress,
}: {
  onProgress: (percent: number, done: boolean) => void
}) {
  const onProgressRef = useRef(onProgress)
  onProgressRef.current = onProgress

  useEffect(() => {
    const manager = DefaultLoadingManager
    const prev = {
      onStart: manager.onStart,
      onProgress: manager.onProgress,
      onLoad: manager.onLoad,
    }
    let loaded = 0
    let total = 0
    let active = false
    let timer = 0

    const flush = () => {
      timer = 0
      const pct = total > 0 ? Math.max(0, Math.min(100, Math.round((loaded / total) * 100))) : 100
      onProgressRef.current(pct, !active && pct >= 100)
    }
    // setTimeout, not rAF: it still runs in a background tab
    const schedule = () => {
      if (!timer) timer = window.setTimeout(flush, 0)
    }

    manager.onStart = (url, itemsLoaded, itemsTotal) => {
      prev.onStart?.(url, itemsLoaded, itemsTotal)
      active = true
      loaded = itemsLoaded
      total = itemsTotal
      schedule()
    }
    manager.onProgress = (url, itemsLoaded, itemsTotal) => {
      prev.onProgress?.(url, itemsLoaded, itemsTotal)
      active = true
      loaded = itemsLoaded
      total = itemsTotal
      schedule()
    }
    manager.onLoad = () => {
      prev.onLoad?.()
      active = false
      loaded = total
      schedule()
    }

    return () => {
      if (timer) window.clearTimeout(timer)
      manager.onStart = prev.onStart
      manager.onProgress = prev.onProgress
      manager.onLoad = prev.onLoad
    }
  }, [])

  return null
}
