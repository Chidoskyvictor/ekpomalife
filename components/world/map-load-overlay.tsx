'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import styles from './map-load-overlay.module.css'

/**
 * White “Loading map · N%” over the blue ground while assets boot.
 * Percent eases toward the real LoadingManager value so it counts on screen.
 */
export function MapLoadOverlay({
  targetPercent,
  assetsDone,
}: {
  targetPercent: number
  assetsDone: boolean
}) {
  const [shown, setShown] = useState(0)
  const [visible, setVisible] = useState(true)
  const [gone, setGone] = useState(false)
  const shownRef = useRef(0)
  const targetRef = useRef(targetPercent)
  const doneRef = useRef(assetsDone)
  targetRef.current = targetPercent
  doneRef.current = assetsDone

  // Soft count toward the reported target (caps at 99 until assetsDone).
  useEffect(() => {
    if (!visible) return
    const id = window.setInterval(() => {
      const goal = doneRef.current ? 100 : Math.min(99, Math.max(targetRef.current, 3))
      const n = shownRef.current
      if (n >= goal && !doneRef.current) return
      const step = doneRef.current ? 4 : goal - n > 25 ? 3 : 1
      const next = Math.min(goal, n + step)
      if (next === n) return
      shownRef.current = next
      setShown(next)
    }, 45)
    return () => window.clearInterval(id)
  }, [visible])

  useEffect(() => {
    if (!assetsDone || shown < 100) return
    setVisible(false)
    const hide = window.setTimeout(() => setGone(true), 380)
    return () => window.clearTimeout(hide)
  }, [assetsDone, shown])

  // Hard failsafe so a stuck loader never covers the map forever.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      shownRef.current = 100
      setShown(100)
      setVisible(false)
      window.setTimeout(() => setGone(true), 380)
    }, 16_000)
    return () => window.clearTimeout(timer)
  }, [])

  if (gone) return null

  return (
    <div
      className={styles.overlay}
      data-done={visible ? 'false' : 'true'}
      aria-live="polite"
      aria-busy={visible || undefined}
    >
      <p className={styles.copy}>
        Loading map <span className={styles.pct}>{shown}%</span>
      </p>
    </div>
  )
}

export function useMapLoadProgress() {
  const [targetPercent, setTargetPercent] = useState(0)
  const [assetsDone, setAssetsDone] = useState(false)
  const sawProgress = useRef(false)

  const onProgress = useCallback((percent: number, done: boolean) => {
    if (percent > 0) sawProgress.current = true
    setTargetPercent((prev) => Math.max(prev, percent))
    if (done) setAssetsDone(true)
  }, [])

  // Cached / empty scene: nothing reports after a short wait → finish.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!sawProgress.current) {
        setTargetPercent(100)
        setAssetsDone(true)
      }
    }, 2200)
    return () => window.clearTimeout(timer)
  }, [])

  return { targetPercent, assetsDone, onProgress }
}
