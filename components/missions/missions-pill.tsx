'use client'

import { ChevronDown, ChevronUp } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useGame } from '@/hooks/use-game'
import { getPlace } from '@/lib/game/places'
import type { MissionsView } from '@/lib/game/missions-api'
import { pushNavigation } from '@/lib/navigation/safe-nav'
import styles from './missions.module.css'

const KEY = 'ekpoma-missions-pill-collapsed'

/** Slim pill under the status bar: the next unfinished mission and a Go button; the chevron collapses it. */
export function MissionsPill({ view, onOpen }: { view: MissionsView; onOpen: () => void }) {
  const router = useRouter()
  const { select } = useGame()
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(KEY) === '1')
    } catch {
      /* storage blocked: stay expanded */
    }
  }, [])

  const toggle = () => {
    setCollapsed((c) => {
      try {
        window.localStorage.setItem(KEY, c ? '0' : '1')
      } catch {
        /* ignore */
      }
      return !c
    })
  }

  const next = view.missions.find((m) => !m.done)
  const total = view.missions.length
  const count = `${view.doneCount}/${total}`

  if (collapsed) {
    return (
      <div className={styles.topPill}>
        <button type="button" className={styles.topText} aria-label={`Today's missions: ${count} done. Open`} onClick={onOpen}>
          🎯 {count}
        </button>
        <button type="button" className={styles.topChevron} aria-label="Show mission" aria-expanded="false" onClick={toggle}>
          <ChevronDown size={16} aria-hidden="true" />
        </button>
      </div>
    )
  }

  const go = () => {
    const place = next?.places[0]
    // Auto missions (lecture / bond) and ones with no place open the sheet instead
    if (!next || !place || next.auto) {
      onOpen()
      return
    }
    select(place)
    pushNavigation(router, '/')
  }

  return (
    <div className={`${styles.topPill} ${styles.topPillOpen}`}>
      <button type="button" className={styles.topText} onClick={onOpen} aria-label="Open today's missions">
        {next ? (
          <>
            {next.emoji} {next.title}
            {next.auto ? '' : ` · ${getPlace(next.places[0])?.label ?? ''}`}
          </>
        ) : (
          '🎁 All missions done'
        )}{' '}
        <span className={styles.topCount}>{count}</span>
      </button>
      {next ? (
        <button type="button" className={styles.topGo} onClick={go}>
          Go
        </button>
      ) : null}
      <button type="button" className={styles.topChevron} aria-label="Hide mission" aria-expanded="true" onClick={toggle}>
        <ChevronUp size={16} aria-hidden="true" />
      </button>
    </div>
  )
}
