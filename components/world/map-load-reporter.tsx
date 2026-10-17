'use client'

import { useProgress } from '@react-three/drei'
import { useEffect, useRef } from 'react'

/**
 * Lives inside the R3F Canvas. Reports DefaultLoadingManager progress
 * (GLBs via useGLTF) up to the parent overlay.
 */
export function MapLoadReporter({
  onProgress,
}: {
  onProgress: (percent: number, done: boolean) => void
}) {
  const { active, progress } = useProgress()
  const onProgressRef = useRef(onProgress)
  onProgressRef.current = onProgress

  useEffect(() => {
    const pct = Math.max(0, Math.min(100, Math.round(progress)))
    onProgressRef.current(pct, !active && pct >= 100)
  }, [active, progress])

  return null
}
