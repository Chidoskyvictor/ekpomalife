'use client'

import { MessageCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { useGame } from '@/hooks/use-game'
import { plotFromSelectId } from '@/lib/game/estates'
import { openDirectChat } from '@/lib/game/hostels-api'
import { useHouses } from '@/lib/game/houses-api'
import { requestOpenChat } from '@/lib/game/open-chat'
import { pushNavigation } from '@/lib/navigation/safe-nav'
import styles from './house-sheet.module.css'

/**
 * Tap a house in the estates (Lagos Life style): whose house it is, what kind and where, whether
 * they're home, how much furniture, and Visit (only while they're home) or Message.
 * Your own house opens your usual home sheet instead.
 */
export function HouseSheet({ hidden = false }: { hidden?: boolean }) {
  const router = useRouter()
  const { isGuest, selectedId, select, notifyToast } = useGame()
  const { houses, myPlot } = useHouses(!isGuest)
  const plot = plotFromSelectId(selectedId)
  const house = plot === null ? null : (houses.find((h) => h.plot === plot) ?? null)
  const [busy, setBusy] = useState(false)

  // Your own house: the normal "My Home" sheet (address, Go home)
  useEffect(() => {
    if (plot !== null && plot === myPlot) select('home')
  }, [plot, myPlot, select])

  if (!house || hidden || plot === myPlot) return null

  const message = async () => {
    setBusy(true)
    try {
      const res = await openDirectChat(house.userId)
      if (!res.ok) {
        notifyToast(res.error ?? 'Could not open the chat', false)
        return
      }
      select(null)
      requestOpenChat(res.chat)
    } finally {
      setBusy(false)
    }
  }

  const visit = () => {
    select(null)
    pushNavigation(router, `/room/${encodeURIComponent(house.username)}`)
  }

  return (
    <BottomSheet
      open
      onClose={() => select(null)}
      title={`@${house.username}'s house`}
      icon="🏠"
      subtitle={`${house.kind} · ${house.area}`}
    >
      <div className={styles.status}>
        <span className={`${styles.dot} ${house.home ? styles.dotHome : ''}`} aria-hidden="true" />
        <span>{house.home ? 'Home right now' : 'Not around right now'}</span>
        <small>
          {house.items} {house.items === 1 ? 'item' : 'items'}
        </small>
      </div>

      <div className={styles.buttons}>
        <button type="button" className={styles.btn} disabled={!house.home} onClick={visit}>
          🏠 Visit
        </button>
        <button type="button" className={styles.btn} disabled={busy} onClick={() => void message()}>
          <MessageCircle size={16} aria-hidden="true" />
          Message
        </button>
      </div>
      {house.home ? null : <p className={styles.hint}>You can only drop by when they&apos;re home.</p>}
    </BottomSheet>
  )
}
