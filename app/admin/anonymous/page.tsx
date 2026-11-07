'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { adminAnonAction, adminFetchAnonReports, type AdminAnonRow } from '@/lib/game/anonymous-api'

/** Moderation queue for the Anonymous app. Admins see the author's username; students never do. */
export default function AdminAnonymousPage() {
  const [rows, setRows] = useState<AdminAnonRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await adminFetchAnonReports()
    if (!res.ok) {
      setError(res.status === 403 ? 'Admins only.' : res.status === 401 ? 'Log in first.' : res.error)
      setRows([])
      return
    }
    setError(null)
    setRows(res.reports)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function act(row: AdminAnonRow, action: 'dismiss' | 'remove' | 'warn' | 'ban') {
    if (action === 'ban' && !window.confirm(`Ban @${row.author.username} from posting in Anonymous?`)) return
    setBusy(row.id)
    const res = await adminAnonAction(row.type, row.id, action)
    setBusy(null)
    if (!res.ok) setError(res.error)
    await load()
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-lg overflow-x-hidden bg-white px-4 py-10 text-neutral-900">
      <Link href="/admin" className="inline-flex min-h-11 items-center text-sm text-neutral-600">
        Back to admin
      </Link>
      <h1 className="mt-4 text-[clamp(1.35rem,5vw,1.5rem)] font-medium">Anonymous reports</h1>
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      {rows === null ? <p className="mt-4 text-sm text-neutral-500">Loading…</p> : null}
      {rows?.length === 0 && !error ? <p className="mt-4 text-sm text-neutral-500">No open reports.</p> : null}
      <ul className="mt-4 flex flex-col gap-3">
        {rows?.map((row) => (
          <li key={`${row.type}:${row.id}`} className="rounded-2xl bg-neutral-100 p-3 break-words shadow-sm">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-neutral-800 px-2 py-0.5 font-bold text-white">{row.type}</span>
              <span
                className={`rounded-full px-2 py-0.5 font-bold ${row.status === 'hidden' ? 'bg-red-600 text-white' : 'bg-neutral-200'}`}
              >
                {row.status === 'hidden' ? 'auto-hidden' : row.status}
              </span>
              <span>{row.reportCount} report{row.reportCount === 1 ? '' : 's'}</span>
              {row.wall ? <span>wall: {row.wall}</span> : null}
            </div>
            <p className="mt-2 text-sm whitespace-pre-wrap">{row.body}</p>
            <p className="mt-2 text-xs text-neutral-600">Reasons: {row.reasons.join(', ')}</p>
            <p className="mt-1 text-xs text-neutral-600">
              Author: @{row.author.username} · {row.author.warnings} warning{row.author.warnings === 1 ? '' : 's'}
              {row.author.banned ? ' · banned' : ''}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(['dismiss', 'remove', 'warn', 'ban'] as const).map((action) => (
                <button
                  key={action}
                  type="button"
                  disabled={busy === row.id}
                  onClick={() => void act(row, action)}
                  className={`min-h-11 rounded-xl px-3 text-sm font-semibold capitalize disabled:opacity-50 ${
                    action === 'ban' ? 'bg-red-600 text-white' : 'bg-white text-neutral-900'
                  }`}
                >
                  {action}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-neutral-500">Warn and ban also take the item down.</p>
          </li>
        ))}
      </ul>
    </main>
  )
}
