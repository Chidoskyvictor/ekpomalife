'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { adminHideGig, adminResolveGig, fetchGigDisputes, type GigDisputeRow, type GigReportRow } from '@/lib/game/admin-api'

const naira = (n: number) => `₦${n.toLocaleString('en-NG')}`

/** Moderation: Gigs in dispute (decide who gets the held money) and reported posts or profiles. Admins only. */
export default function AdminGigsPage() {
  const [disputes, setDisputes] = useState<GigDisputeRow[] | null>(null)
  const [reports, setReports] = useState<GigReportRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetchGigDisputes()
    if (!res.ok) {
      setError(res.status === 403 ? 'Admins only.' : res.status === 401 ? 'Log in first.' : res.error)
      setDisputes([])
      return
    }
    setError(null)
    setDisputes(res.disputes)
    setReports(res.reports)
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  async function run(key: string, action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setBusy(key)
    const res = await action()
    setBusy(null)
    setConfirm(null)
    if (!res.ok) setError(res.error)
    await load()
  }

  return (
    <main className="app-wash mx-auto min-h-dvh w-full max-w-lg overflow-x-hidden px-4 py-10 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <Link href="/admin" className="inline-flex min-h-11 items-center text-sm text-neutral-600">
        Back to admin
      </Link>
      <h1 className="mt-4 text-[clamp(1.35rem,5vw,1.5rem)] font-medium">Gigs: disputes and reports</h1>
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}

      <h2 className="mt-6 text-sm font-bold uppercase tracking-wide text-neutral-500">Disputes (money held)</h2>
      {disputes === null ? <p className="mt-2 text-sm text-neutral-500">Loading…</p> : null}
      {disputes?.length === 0 && !error ? <p className="mt-2 text-sm text-neutral-500">No disputes.</p> : null}
      <ul className="mt-2 flex flex-col gap-3">
        {disputes?.map((d) => (
          <li key={d.id} className="rounded-2xl bg-white/80 p-3 break-words shadow-sm">
            <p className="font-semibold">{d.title}</p>
            <p className="text-sm text-neutral-600">
              {d.category} · fee {naira(d.fee)}
              {d.budget ? ` + items ${naira(d.budget)}` : ''} · held {naira(d.escrow)}
            </p>
            <p className="text-sm text-neutral-600">
              Owner @{d.owner} vs worker @{d.worker ?? '?'}
            </p>
            <p className="mt-1 text-sm">“{d.reason}”</p>
            {confirm?.startsWith(`${d.id}:`) ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <span>{confirm.endsWith('worker') ? `Pay @${d.worker} ${naira(d.fee)} (owner gets the item budget back)?` : `Refund @${d.owner} everything held?`}</span>
                <button
                  type="button"
                  className="min-h-11 rounded-full bg-neutral-900 px-4 font-semibold text-white disabled:opacity-50"
                  disabled={busy !== null}
                  onClick={() => void run(d.id, () => adminResolveGig(d.id, confirm.endsWith('worker') ? 'worker' : 'owner'))}
                >
                  Yes, do it
                </button>
                <button type="button" className="min-h-11 px-3 text-neutral-600" onClick={() => setConfirm(null)}>
                  No
                </button>
              </div>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className="min-h-11 rounded-full bg-green-700 px-4 text-sm font-semibold text-white" onClick={() => setConfirm(`${d.id}:worker`)}>
                  Pay worker
                </button>
                <button type="button" className="min-h-11 rounded-full bg-neutral-200 px-4 text-sm font-semibold" onClick={() => setConfirm(`${d.id}:owner`)}>
                  Refund owner
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <h2 className="mt-8 text-sm font-bold uppercase tracking-wide text-neutral-500">Reports</h2>
      {reports.length === 0 && !error ? <p className="mt-2 text-sm text-neutral-500">No reports.</p> : null}
      <ul className="mt-2 flex flex-col gap-3">
        {reports.map((r) => (
          <li key={r.id} className="rounded-2xl bg-white/80 p-3 break-words shadow-sm">
            <p className="font-semibold">{r.gigId ? `Post: ${r.gigTitle ?? r.gigId}` : `Profile: @${r.pro}`}</p>
            <p className="text-sm text-neutral-600">
              by @{r.reporter} · {new Date(r.createdAt).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
            </p>
            {r.reason ? <p className="mt-1 text-sm">“{r.reason}”</p> : null}
            {r.gigId ? (
              <button
                type="button"
                className="mt-2 min-h-11 rounded-full bg-neutral-200 px-4 text-sm font-semibold"
                disabled={busy !== null}
                onClick={() => void run(r.id, () => adminHideGig(r.gigId!, !r.hidden))}
              >
                {r.hidden ? 'Show post again' : 'Hide post'}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </main>
  )
}
