'use client'

import { useState } from 'react'
import { useGame } from '@/hooks/use-game'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { closeTipSheet, reactToTip, TIP_AMOUNTS, tipBoy, useStreetBoy } from '@/lib/game/street-boy'
import styles from './tip-sheet.module.css'

const naira = (n: number) => `₦${n.toLocaleString('en-NG')}`

/** Tip the street boy: big amount tiles, a custom amount, your cash shown. Money leaves through the server. */
export function TipSheet({ word }: { word: string }) {
  const { open } = useStreetBoy()
  const { state, applyServerState, notifyToast } = useGame()
  const [custom, setCustom] = useState('')
  const [busy, setBusy] = useState(false)
  const cash = state?.cash ?? 0
  const customAmount = Math.floor(Number(custom.replace(/[^\d]/g, '')) || 0)
  const customBad = custom !== '' && (customAmount < 50 || customAmount > cash)

  const give = async (amount: number) => {
    if (busy) return
    setBusy(true)
    try {
      const res = await tipBoy(amount)
      if (!res.ok) {
        notifyToast(res.error ?? 'Something went wrong. Try again.', false)
        return
      }
      applyServerState(res.state)
      reactToTip(res.big)
      setCustom('')
      closeTipSheet()
    } finally {
      setBusy(false)
    }
  }

  return (
    <BottomSheet
      open={open}
      onClose={closeTipSheet}
      title="Tip the street boy"
      subtitle={`Your cash ${naira(cash)}`}
      icon={<span aria-hidden="true">🙏</span>}
    >
      <div className={styles.tiles}>
        {TIP_AMOUNTS.map((a) => (
          <button key={a} type="button" className={styles.tile} disabled={busy || a > cash} onClick={() => void give(a)}>
            <span className={styles.coin} aria-hidden="true">💸</span>
            <span className={styles.amt}>{naira(a)}</span>
            {a >= 1000 ? <span className={styles.hint}>Big tip</span> : null}
          </button>
        ))}
      </div>
      <form
        className={styles.custom}
        onSubmit={(e) => {
          e.preventDefault()
          if (!customBad && customAmount >= 50) void give(customAmount)
        }}
      >
        <label className={styles.field}>
          <span className={styles.naira}>₦</span>
          <input
            inputMode="numeric"
            placeholder="Other amount"
            aria-label="Other amount"
            value={custom}
            onChange={(e) => setCustom(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
            aria-invalid={customBad}
          />
        </label>
        <button type="submit" className={styles.send} disabled={busy || customAmount < 50 || customBad}>
          Give
        </button>
      </form>
      {customBad ? <p className={styles.err}>{customAmount > cash ? "You don't have that much cash." : 'Smallest tip is ₦50.'}</p> : null}
      <p className={styles.note}>{word}, ₦1,000 or more makes his day.</p>
    </BottomSheet>
  )
}
