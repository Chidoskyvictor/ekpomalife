'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { adminBanHost, adminEndSpace, fetchSpaceReports, type SpaceReportRow } from '@/lib/game/admin-api'
import { whenLabel } from '@/lib/game/spaces-api'

/** Moderation: Spaces that players reported. Only usernames in the backend's ADMIN_USERNAMES get in. */
export default function AdminSpacesPage() {
  const [rows, setRows] = useState<SpaceReportRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmBan, setConfirmBan] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetchSpaceReports()
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

  async function run(key: string, action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setBusy(key)
    const res = await action()
    setBusy(null)
    setConfirmBan(null)
    if (!res.ok) setError(res.error)
    await load()
  }

  return (
    <main className="app-wash mx-auto min-h-dvh w-full max-w-lg overflow-x-hidden px-4 py-10 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <Link href="/" className="inline-flex min-h-11 items-center text-sm text-neutral-600">
        Back to game
      </Link>
      <h1 className="mt-4 text-[clamp(1.35rem,5vw,1.5rem)] font-medium">Reported Spaces</h1>

      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      {rows === null ? <p className="mt-4 text-sm text-neutral-500">Loading…</p> : null}
      {rows?.length === 0 && !error ? <p className="mt-4 text-sm text-neutral-500">No reports.</p> : null}

      <ul className="mt-4 flex flex-col gap-3">
        {rows?.map((row) => {
          const open = row.status !== 'ended'
          return (
            <li key={row.spaceId} className="rounded-2xl bg-white/80 p-3 break-words shadow-sm">
              <div className="flex items-center gap-2 text-xs">
                <span
                  className={`rounded-full px-2 py-0.5 font-bold ${
                    row.status === 'live' ? 'bg-red-600 text-white' : 'bg-neutral-200 text-neutral-700'
                  }`}
                >
                  {row.status === 'live' ? 'LIVE' : row.status === 'scheduled' ? 'Scheduled' : 'Ended'}
                </span>
                <span className="font-bold text-red-700">
                  {row.reportCount} report{row.reportCount === 1 ? '' : 's'}
                </span>
                <span className="ml-auto text-neutral-500">{whenLabel(row.lastReportAt)}</span>
              </div>
              <p className="mt-1 font-semibold">{row.title}</p>
              <p className="text-sm text-neutral-600">
                @{row.host.username}
                {row.hostBanned ? ' · banned from hosting' : ''}
              </p>
              <ul className="mt-2 list-disc pl-5 text-sm text-neutral-700">
                {row.reasons.map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={!open || busy !== null}
                  className="min-h-11 rounded-full bg-neutral-200 text-sm font-bold disabled:opacity-40"
                  onClick={() => void run(`end-${row.spaceId}`, () => adminEndSpace(row.spaceId))}
                >
                  {busy === `end-${row.spaceId}` ? 'Ending…' : 'End room'}
                </button>
                {confirmBan === row.spaceId ? (
                  <button
                    type="button"
                    disabled={busy !== null}
                    className="min-h-11 rounded-full bg-red-600 text-sm font-bold text-white disabled:opacity-40"
                    onClick={() => void run(`ban-${row.spaceId}`, () => adminBanHost(row.spaceId))}
                  >
                    {busy === `ban-${row.spaceId}` ? 'Banning…' : `Confirm ban @${row.host.username}`}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={row.hostBanned || busy !== null}
                    className="min-h-11 rounded-full bg-red-100 text-sm font-bold text-red-700 disabled:opacity-40"
                    onClick={() => setConfirmBan(row.spaceId)}
                  >
                    {row.hostBanned ? 'Host banned' : 'Ban host'}
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </main>
  )
}
