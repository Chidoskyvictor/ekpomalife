'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { MessagesApp } from '@/components/hud/phone/apps/messages-app'
import { fetchAuthMe } from '@/lib/auth/fetch-auth-me'

/** The Support account's inbox: just Messages, full screen. Anyone else is sent home. */
export default function SupportPage() {
  const router = useRouter()
  const [ok, setOk] = useState(false)
  useEffect(() => {
    void fetchAuthMe({ force: true }).then((me) => {
      if (!me) router.replace('/login')
      else if (!me.support) router.replace('/')
      else setOk(true)
    })
  }, [router])
  if (!ok) return null
  return (
    <main style={{ position: 'fixed', inset: 0, background: '#fff', display: 'flex', flexDirection: 'column' }}>
      <MessagesApp onHome={() => {}} notifications={[]} onOpenApp={() => {}} supportMode />
    </main>
  )
}
