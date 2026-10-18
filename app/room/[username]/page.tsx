'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { AuthGate } from '@/components/auth/auth-gate'
import styles from '@/components/room/room.module.css'
import { fetchVisitRoom } from '@/lib/game/room-api'

function VisitBody() {
  const params = useParams<{ username: string }>()
  const router = useRouter()
  const [message, setMessage] = useState('Checking the room…')

  useEffect(() => {
    const username = params.username
    if (!username) return
    void fetchVisitRoom(username).then((result) => {
      if (!result.ok) {
        setMessage(result.error || 'Room visits come with friends — soon!')
        return
      }
      setMessage(`${result.room.ownerUsername}'s room is view only for now.`)
    })
  }, [params.username])

  return (
    <div className={styles.root}>
      <header className={styles.topBar}>
        <button type="button" className={styles.backBtn} aria-label="Back to map" onClick={() => router.push('/')}>
          ←
        </button>
        <h1 className={styles.title}>Visit</h1>
      </header>
      <article className={styles.visitCard}>
        <p className={styles.title}>Coming with friends in Phase 4</p>
        <p className={styles.sub}>{message}</p>
      </article>
    </div>
  )
}

export default function VisitRoomPage() {
  return (
    <AuthGate mode="home">
      <VisitBody />
    </AuthGate>
  )
}
