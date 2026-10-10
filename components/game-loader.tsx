'use client'

import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { getSession, saveKey } from '@/lib/game/accounts'

const GameShell = dynamic(() => import('./game-shell'), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh w-full items-center justify-center bg-[#F4F7FB]">
      <p className="animate-pulse text-sm font-semibold text-neutral-500">Loading Ekpoma…</p>
    </div>
  ),
})

export function GameLoader() {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const username = getSession()
    if (username && !window.localStorage.getItem(saveKey(username))) {
      router.replace('/look')
      return
    }
    setReady(true)
  }, [router])

  if (!ready) {
    return (
      <div className="flex h-dvh w-full items-center justify-center bg-[#F4F7FB]">
        <p className="animate-pulse text-sm font-semibold text-neutral-500">Loading Ekpoma…</p>
      </div>
    )
  }

  return <GameShell />
}
