'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { ADS } from '@/lib/game/billboard-ads'
import { fetchAdClicks, type AdAction, type AdClickRow, type AdTotals } from '@/lib/game/admin-api'

const LABEL: Record<AdAction, string> = {
  open: 'Opened',
  whatsapp: 'WhatsApp',
  call: 'Call',
  group: 'Join group',
  share: 'Shared',
}
const ORDER: AdAction[] = ['open', 'whatsapp', 'call', 'group', 'share']

const adName = (id: string) => ADS[id]?.advertiser ?? id

/** Billboard ad tracking: how many opened each ad and tapped its buttons, and who. */
export default function AdminBillboardsPage() {
  const [data, setData] = useState<{ totals: AdTotals[]; recent: AdClickRow[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<AdAction | 'all'>('all')

  const load = useCallback(async () => {
    const res = await fetchAdClicks()
    if (!res.ok) {
      setError(res.status === 403 ? 'Admins only.' : res.status === 401 ? 'Log in first.' : res.error)
      return
    }
    setError(null)
    setData({ totals: res.totals, recent: res.recent })
  }, [])

  useEffect(() => {
    void load()
    const id = window.setInterval(() => void load(), 30_000)
    return () => window.clearInterval(id)
  }, [load])

  // Group totals by ad (all its boards together)
  const byAd = new Map<string, Map<AdAction, { total: number; players: number; guests: number }>>()
  for (const t of data?.totals ?? []) {
    const row = byAd.get(t.adId) ?? new Map()
    const cur = row.get(t.action) ?? { total: 0, players: 0, guests: 0 }
    row.set(t.action, { total: cur.total + t.total, players: cur.players + t.players, guests: cur.guests + t.guests })
    byAd.set(t.adId, row)
  }
  const recent = (data?.recent ?? []).filter((r) => filter === 'all' || r.action === filter)

  return (
    <main className="mx-auto min-h-dvh w-full max-w-lg overflow-x-hidden bg-white px-4 py-10 text-neutral-900">
      <Link href="/admin" className="inline-flex min-h-11 items-center text-sm text-neutral-600">
        Back to admin
      </Link>
      <h1 className="mt-4 text-[clamp(1.35rem,5vw,1.5rem)] font-medium">Billboards</h1>
      <p className="mt-1 text-sm text-neutral-500">Ad opens and button taps. Updates every 30 seconds.</p>
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      {!data && !error ? <p className="mt-4 text-sm text-neutral-500">Loading…</p> : null}
      {data && byAd.size === 0 ? <p className="mt-4 text-sm text-neutral-500">No clicks yet.</p> : null}

      <ul className="mt-4 flex flex-col gap-3">
        {[...byAd].map(([adId, actions]) => (
          <li key={adId} className="rounded-2xl bg-neutral-100 p-3 shadow-sm">
            <p className="font-semibold break-words">{adName(adId)}</p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ORDER.filter((a) => actions.has(a)).map((a) => {
                const v = actions.get(a)!
                return (
                  <div key={a} className="rounded-xl bg-white p-2">
                    <p className="text-xs text-neutral-500">{LABEL[a]}</p>
                    <p className="text-lg font-bold">{v.total.toLocaleString()}</p>
                    <p className="text-[11px] text-neutral-500">
                      {v.players} player{v.players === 1 ? '' : 's'}
                      {v.guests ? ` · ${v.guests} guest` : ''}
                    </p>
                  </div>
                )
              })}
            </div>
          </li>
        ))}
      </ul>

      {data && data.recent.length ? (
        <section className="mt-8">
          <h2 className="text-base font-bold">Who clicked (latest 200)</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {(['all', ...ORDER] as const).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setFilter(a)}
                className={`min-h-11 rounded-full px-3 text-sm font-semibold ${filter === a ? 'bg-neutral-900 text-white' : 'bg-neutral-100'}`}
              >
                {a === 'all' ? 'All' : LABEL[a]}
              </button>
            ))}
          </div>
          <ul className="mt-3 divide-y divide-neutral-200">
            {recent.map((r, i) => (
              <li key={`${r.at}-${i}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate">
                  {r.username ? `@${r.username}` : <span className="text-neutral-500">Guest</span>}
                  <span className="text-neutral-500"> · {LABEL[r.action]} · board {r.board}</span>
                </span>
                <span className="shrink-0 text-xs text-neutral-500">
                  {new Date(r.at).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  )
}
