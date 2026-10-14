'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { TextShimmer } from '@/components/arc/text-shimmer/text-shimmer'
import { getSession, loadDraft, saveKey } from '@/lib/game/accounts'
import GameShell from './game-shell'
import styles from './game-loader.module.css'

const SPLASH_MS = 1400

export function GameLoader() {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const username = getSession()
    if (username && !window.localStorage.getItem(saveKey(username))) {
      const draft = loadDraft(username)
      router.replace(draft?.appearance ? '/traits' : '/look')
      return
    }

    const timer = window.setTimeout(() => setReady(true), SPLASH_MS)
    return () => window.clearTimeout(timer)
  }, [router])

  if (!ready) {
    return (
      <div className={styles.loading} aria-busy="true" aria-live="polite">
        <img src="/logo.png" alt="" className={styles.crest} width={88} height={88} />
        <h1 className={styles.mark}>
          <TextShimmer>Ekpoma Life</TextShimmer>
        </h1>
      </div>
    )
  }

  return <GameShell />
}
