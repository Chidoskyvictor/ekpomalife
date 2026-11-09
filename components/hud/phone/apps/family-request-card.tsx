'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  announceFamilyChange,
  cancelFamilyRequest,
  FAMILY_EVENT,
  fetchFamilyRequest,
  respondFamilyRequest,
  type FamilyRequest,
} from '@/lib/game/family-api'
import styles from './family.module.css'

const ROLE_WORD: Record<string, string> = { sibling: 'sibling', cousin: 'cousin', parent: 'parent', uncle_aunt: 'uncle/aunt' }

/** Live request state: loads once, then follows answers made anywhere (chat card, Family app, notification). */
export function useFamilyRequest(id: string, initial?: FamilyRequest | null) {
  const [request, setRequest] = useState<FamilyRequest | null>(initial ?? null)
  const refresh = useCallback(async () => {
    const res = await fetchFamilyRequest(id)
    if (res.ok) setRequest(res.request)
  }, [id])
  useEffect(() => {
    void refresh()
    window.addEventListener(FAMILY_EVENT, refresh)
    return () => window.removeEventListener(FAMILY_EVENT, refresh)
  }, [refresh])
  const pending = request?.status === 'pending'
  useEffect(() => {
    if (!pending) return
    const t = window.setInterval(() => void refresh(), 6000)
    return () => window.clearInterval(t)
  }, [pending, refresh])
  return { request, setRequest }
}

export function requestHeadline(r: FamilyRequest): string {
  if (r.kind === 'bae') return r.mine ? `You asked @${r.to} to be your bae 💕` : `@${r.from} wants to be your bae 💕`
  const word = ROLE_WORD[r.relation ?? ''] ?? 'family'
  return r.mine ? `You asked @${r.to} to be your ${word} 👪` : `@${r.from} says you are their ${word} 👪`
}

/** The centred card in a direct chat, and the same rows inside the Family app's Requests tab. */
export function FamilyRequestCard({ id, initial, compact }: { id: string; initial?: FamilyRequest | null; compact?: boolean }) {
  const { request, setRequest } = useFamilyRequest(id, initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!request) return <div className={styles.card} aria-busy="true" />

  const act = async (run: () => ReturnType<typeof respondFamilyRequest>) => {
    setBusy(true)
    setError(null)
    const res = await run()
    setBusy(false)
    if (res.ok) {
      setRequest(res.request)
      announceFamilyChange()
    } else setError(res.error)
  }

  let end: ReactNode = null
  if (request.status === 'accepted') {
    end = <span className={styles.done}>{request.kind === 'bae' ? 'You’re now baes 💕' : 'You’re family now 👪'}</span>
  } else if (request.status === 'declined') end = <span className={`${styles.done} ${styles.doneMuted}`}>Declined</span>
  else if (request.status === 'cancelled') end = <span className={`${styles.done} ${styles.doneMuted}`}>Cancelled</span>
  else if (request.status === 'expired') end = <span className={`${styles.done} ${styles.doneMuted}`}>Expired</span>

  return (
    <div className={styles.card} role="group" aria-label="Request" style={compact ? { width: '100%', margin: 0, textAlign: 'left' } : undefined}>
      <p className={styles.cardText}>{requestHeadline(request)}</p>
      {end ?? (
        <>
          <p className={styles.cardSub}>Answer within 3 days</p>
          {request.mine ? (
            <div className={styles.row}>
              <button type="button" className={styles.ghost} disabled={busy} onClick={() => void act(() => cancelFamilyRequest(id))}>
                Cancel request
              </button>
            </div>
          ) : (
            <div className={styles.row}>
              <button type="button" className={styles.no} disabled={busy} onClick={() => void act(() => respondFamilyRequest(id, false))}>
                Decline
              </button>
              <button type="button" className={styles.yes} disabled={busy} onClick={() => void act(() => respondFamilyRequest(id, true))}>
                Accept
              </button>
            </div>
          )}
        </>
      )}
      {error ? <p className={styles.err}>{error}</p> : null}
    </div>
  )
}
