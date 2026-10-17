'use client'

import { useEffect, useState } from 'react'

/** Cheap devices skip blur. First paint assumes capable so SSR stays stable. */
export function useLowPerf() {
  const [lowPerf, setLowPerf] = useState(false)

  useEffect(() => {
    const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 8 : 8
    setLowPerf(cores <= 4)
  }, [])

  return lowPerf
}
