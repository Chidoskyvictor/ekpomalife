'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useGame } from '@/hooks/use-game'
import { apiGet, apiPost } from '@/lib/api/client'
import { HudDrawer } from './hud-drawer'
import economy from './economy.module.css'
import styles from './topup-sheet.module.css'

type Pack = {
  id: string
  name: string
  emoji: string
  naira: number
  game_money: number
  tag: string | null
  highlight: boolean
}

type PacksResponse = { ok: true; packs: Pack[] }
type InitResponse = { ok: true; reference: string; access_code: string; authorization_url: string }
type VerifyResponse = {
  ok: true
  status: 'pending' | 'success' | 'failed'
  credited: boolean
  reference: string
  naira: number
  game_money: number
}

const naira = (value: number) => `₦${Math.round(value).toLocaleString('en-NG')}`

/** Drops ?topup= from the address bar without a navigation. */
function stripTopupParam() {
  const url = new URL(window.location.href)
  if (!url.searchParams.has('topup')) return
  url.searchParams.delete('topup')
  url.searchParams.delete('trxref')
  url.searchParams.delete('reference')
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
}

export function TopUpSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { refreshServer, notifyToast, isGuest } = useGame()
  const [packs, setPacks] = useState<Pack[]>([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const busyRef = useRef(false)
  const checkedReturn = useRef(false)

  const verify = useCallback(
    async (reference: string) => {
      // Webhook may land a moment later; poll verify a few times.
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const result = await apiGet<VerifyResponse>(`/wallet/topup/verify/${encodeURIComponent(reference)}`)
        if (!result.ok) {
          notifyToast(result.error || 'Could not confirm payment.', false)
          return
        }
        if (result.status === 'success') {
          await refreshServer()
          notifyToast(`+${naira(result.game_money)} added`, true)
          return
        }
        if (result.status === 'failed') {
          notifyToast('Payment failed. You were not charged.', false)
          return
        }
        await new Promise((resolve) => window.setTimeout(resolve, 2000))
      }
      notifyToast('Payment still processing. Your balance will update soon.', false)
    },
    [notifyToast, refreshServer],
  )

  // Back from Paystack redirect: /?topup=<reference>
  useEffect(() => {
    if (checkedReturn.current || isGuest) return
    checkedReturn.current = true
    const reference = new URL(window.location.href).searchParams.get('topup')
    if (!reference) return
    stripTopupParam()
    void verify(reference)
  }, [verify, isGuest])

  useEffect(() => {
    if (!open || packs.length) return
    let cancelled = false
    setLoading(true)
    void apiGet<PacksResponse>('/wallet/packs').then((result) => {
      if (cancelled) return
      setLoading(false)
      if (result.ok) setPacks(result.packs)
      else notifyToast(result.error || 'Could not load packs.', false)
    })
    return () => {
      cancelled = true
    }
  }, [open, packs.length, notifyToast])

  const buy = async (pack: Pack) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusyId(pack.id)
    const done = () => {
      busyRef.current = false
      setBusyId(null)
    }
    try {
      const init = await apiPost<InitResponse>('/wallet/topup/init', { pack_id: pack.id })
      if (!init.ok) {
        notifyToast(init.error || 'Could not start payment.', false)
        done()
        return
      }
      const publicKey = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY
      if (!publicKey) {
        window.location.assign(init.authorization_url)
        return
      }
      try {
        const { default: PaystackPop } = await import('@paystack/inline-js')
        const popup = new PaystackPop()
        onOpenChange(false)
        popup.resumeTransaction(init.access_code, {
          onSuccess: () => {
            done()
            void verify(init.reference)
          },
          onCancel: () => done(),
          onError: () => {
            window.location.assign(init.authorization_url)
          },
        })
      } catch {
        window.location.assign(init.authorization_url)
      }
    } catch {
      notifyToast('Could not start payment.', false)
      done()
    }
  }

  return (
    <HudDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Top up wallet"
      description="Buy game money with Naira."
      // #half-sheet fix: open to full content height, no half-way snap stop
      fit
      desktopCard
    >
      <div className={economy.section}>
        <div className={styles.currency} role="group" aria-label="Currency">
          <button type="button" className={`${styles.currencyBtn} ${styles.currencyActive}`} aria-pressed="true">
            Naira
          </button>
          <button type="button" className={styles.currencyBtn} disabled title="Coming soon">
            $USD<span className={styles.soon}>coming soon</span>
          </button>
        </div>

        {loading && packs.length === 0 ? (
          <>
            <div className={economy.skeleton} />
            <div className={economy.skeleton} />
          </>
        ) : (
          <div className={styles.grid}>
            {/* Best value (highlighted) pack first and full width, right under the currency toggle */}
            {[...packs.filter((p) => p.highlight), ...packs.filter((p) => !p.highlight)].map((pack) => {
              const busy = busyId === pack.id
              return (
                <button
                  key={pack.id}
                  type="button"
                  className={[
                    styles.pack,
                    pack.highlight ? `${styles.packHighlight} ${styles.packFeatured}` : '',
                    busyId && !busy ? styles.packBusyOther : '',
                  ].join(' ')}
                  disabled={busyId !== null}
                  aria-busy={busy}
                  onClick={() => void buy(pack)}
                >
                  {pack.tag ? <span className={styles.tag}>{pack.tag}</span> : null}
                  <span className={styles.emoji} aria-hidden="true">
                    {pack.emoji}
                  </span>
                  <span className={styles.name}>{pack.name}</span>
                  <span className={styles.money}>{naira(pack.game_money)} game money</span>
                  <span className={styles.price}>
                    {busy ? <span className={styles.spinner} aria-label="Loading" /> : naira(pack.naira)}
                  </span>
                </button>
              )
            })}
          </div>
        )}
        <p className={styles.note}>Payments are processed securely by Paystack.</p>
      </div>
    </HudDrawer>
  )
}
