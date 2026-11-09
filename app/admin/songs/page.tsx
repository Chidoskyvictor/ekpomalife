'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import {
  adminAddSong,
  adminDeleteSong,
  adminListSongs,
  adminSaveSong,
  type AdminSong,
  type AdminSongInput,
} from '@/lib/game/admin-songs-api'

const EMPTY: AdminSongInput = {
  title: '',
  artist: '',
  linkUrl: '',
  coverUrl: null,
  active: true,
  sortOrder: 0,
  weight: 1,
  startsAt: null,
  endsAt: null,
}

/** <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm" in local time. */
const toLocal = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const fromLocal = (value: string) => (value ? new Date(value).toISOString() : null)

const field = 'min-h-11 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm'

/**
 * Songs promoted on the club LED screens. Admin only (ADMIN_USERNAMES); players cannot add songs.
 * Links and covers must be https. Weight = how many 25-second slots the song gets per cycle.
 */
export default function AdminSongsPage() {
  const [songs, setSongs] = useState<AdminSong[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [form, setForm] = useState<AdminSongInput>(EMPTY)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const res = await adminListSongs()
    if (!res.ok) {
      setError(res.status === 403 ? 'Admins only.' : res.status === 401 ? 'Log in first.' : res.error)
      setSongs([])
      return
    }
    setError(null)
    setSongs(res.songs)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const edit = (song: AdminSong | null) => {
    setError(null)
    if (!song) {
      setEditing('new')
      setForm(EMPTY)
      return
    }
    setEditing(song.id)
    const { id: _id, ...rest } = song
    setForm(rest)
  }

  async function save() {
    setBusy(true)
    const payload = { ...form, coverUrl: form.coverUrl?.trim() || null }
    const res = editing === 'new' ? await adminAddSong(payload) : await adminSaveSong(editing!, payload)
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setEditing(null)
    await load()
  }

  async function remove(song: AdminSong) {
    if (!window.confirm(`Delete "${song.title}"? This cannot be undone.`)) return
    const res = await adminDeleteSong(song.id)
    if (!res.ok) setError(res.error)
    await load()
  }

  async function toggle(song: AdminSong) {
    const { id: _id, ...rest } = song
    const res = await adminSaveSong(song.id, { ...rest, active: !song.active })
    if (!res.ok) setError(res.error)
    await load()
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-lg overflow-x-hidden bg-white px-4 py-10 text-neutral-900">
      <Link href="/admin" className="inline-flex min-h-11 items-center text-sm text-neutral-600">
        Back to admin
      </Link>
      <h1 className="mt-4 text-[clamp(1.35rem,5vw,1.5rem)] font-medium">Club songs</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Shown on the LED screen in Sazza and Forbes, with a Listen button. Links must be https. Placeholder rows
        (example.com) are test data: delete them before launch.
      </p>
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}

      {editing ? (
        <form
          className="mt-4 flex flex-col gap-3 rounded-2xl bg-neutral-100 p-3"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <input className={field} placeholder="Song title" maxLength={120} required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <input className={field} placeholder="Artist" maxLength={120} required value={form.artist} onChange={(e) => setForm({ ...form, artist: e.target.value })} />
          <input className={field} type="url" placeholder="Link (https://open.spotify.com/…)" maxLength={500} required value={form.linkUrl} onChange={(e) => setForm({ ...form, linkUrl: e.target.value })} />
          <input className={field} type="url" placeholder="Cover image URL (optional, https)" maxLength={500} value={form.coverUrl ?? ''} onChange={(e) => setForm({ ...form, coverUrl: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-neutral-600">
              Sort order
              <input className={field} type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) || 0 })} />
            </label>
            <label className="text-xs text-neutral-600">
              Weight (1-10)
              <input className={field} type="number" min={1} max={10} value={form.weight} onChange={(e) => setForm({ ...form, weight: Number(e.target.value) || 1 })} />
            </label>
            <label className="text-xs text-neutral-600">
              Starts (optional)
              <input className={field} type="datetime-local" value={toLocal(form.startsAt)} onChange={(e) => setForm({ ...form, startsAt: fromLocal(e.target.value) })} />
            </label>
            <label className="text-xs text-neutral-600">
              Ends (optional)
              <input className={field} type="datetime-local" value={toLocal(form.endsAt)} onChange={(e) => setForm({ ...form, endsAt: fromLocal(e.target.value) })} />
            </label>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            Active
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="min-h-11 flex-1 rounded-xl bg-neutral-900 px-4 text-sm font-medium text-white disabled:opacity-50">
              {busy ? 'Saving…' : 'Save song'}
            </button>
            <button type="button" className="min-h-11 rounded-xl bg-white px-4 text-sm" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="mt-4 min-h-11 rounded-xl bg-neutral-900 px-4 text-sm font-medium text-white" onClick={() => edit(null)}>
          Add a song
        </button>
      )}

      {songs === null ? <p className="mt-4 text-sm text-neutral-500">Loading…</p> : null}
      {songs?.length === 0 && !error ? <p className="mt-4 text-sm text-neutral-500">No songs yet.</p> : null}
      <ul className="mt-4 flex flex-col gap-3">
        {songs?.map((song) => (
          <li key={song.id} className="rounded-2xl bg-neutral-100 p-3 break-words shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <strong className="min-w-0 truncate">{song.title}</strong>
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${song.active ? 'bg-emerald-600 text-white' : 'bg-neutral-400 text-white'}`}>
                {song.active ? 'Active' : 'Off'}
              </span>
            </div>
            <p className="text-sm text-neutral-600">
              {song.artist} · weight {song.weight} · order {song.sortOrder}
            </p>
            <p className="truncate text-xs text-neutral-500">{song.linkUrl}</p>
            <div className="mt-2 flex gap-2 text-sm">
              <button type="button" className="min-h-11 rounded-xl bg-white px-3" onClick={() => edit(song)}>
                Edit
              </button>
              <button type="button" className="min-h-11 rounded-xl bg-white px-3" onClick={() => void toggle(song)}>
                {song.active ? 'Turn off' : 'Turn on'}
              </button>
              <button type="button" className="min-h-11 rounded-xl bg-white px-3 text-red-700" onClick={() => void remove(song)}>
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </main>
  )
}
