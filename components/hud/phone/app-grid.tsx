'use client'

import {
  Briefcase,
  CalendarDays,
  Gamepad2,
  GraduationCap,
  Headphones,
  House,
  Landmark,
  Map as MapIcon,
  MessageCircle,
  Podcast,
  Newspaper,
  Settings,
  ShoppingBag,
  TrendingUp,
  UserRound,
  AudioLines,
  Bike,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { DOCK_MAX, loadLayout, moveApp, pinApp, saveLayout, unpinApp, type PhoneLayout } from '@/lib/game/phone-layout'
import { PHONE_APPS, type PhoneAppId, type PhoneState } from '@/lib/game/phone'
import styles from './phone.module.css'

/* One iOS-style look: white glyph on a bright two-tone gradient tile. */
const ICONS: Partial<Record<PhoneAppId, { Icon: LucideIcon; from: string; to: string }>> = {
  messages: { Icon: MessageCircle, from: '#5ef27a', to: '#14b84a' },
  jobs: { Icon: Briefcase, from: '#ffb547', to: '#f2731c' },
  invest: { Icon: TrendingUp, from: '#3ee0b0', to: '#0b8f6e' },
  bank: { Icon: Landmark, from: '#4f8cff', to: '#1d3fbf' },
  houses: { Icon: House, from: '#ff8a70', to: '#e2453a' },
  eta: { Icon: AudioLines, from: '#ff6fb5', to: '#c21e7a' },
  gist: { Icon: Newspaper, from: '#ff9f43', to: '#e8541b' },
  market: { Icon: ShoppingBag, from: '#ff6b9d', to: '#d6246a' },
  ride: { Icon: Bike, from: '#ffd84a', to: '#f0a100' },
  map: { Icon: MapIcon, from: '#5ee0d0', to: '#0f9488' },
  calendar: { Icon: CalendarDays, from: '#ff6b6b', to: '#e02f2f' },
  profile: { Icon: UserRound, from: '#62c6ff', to: '#1683e0' },
  games: { Icon: Gamepad2, from: '#9b7bff', to: '#5b33e0' },
  spaces: { Icon: Podcast, from: '#c084fc', to: '#7c2fe0' },
  settings: { Icon: Settings, from: '#a8b3c2', to: '#5d6878' },
  portal: { Icon: GraduationCap, from: '#7c8cff', to: '#3a3fc9' },
  music: { Icon: Headphones, from: '#ff5f7e', to: '#d0123f' },
}

type App = (typeof PHONE_APPS)[number]

const LONG_PRESS_MS = 500

function AppIcon({
  app,
  phone,
  onOpen,
  dock,
  editing,
  selected,
  onLongPress,
}: {
  app: App
  phone: PhoneState
  onOpen: (id: PhoneAppId) => void
  dock?: boolean
  editing?: boolean
  selected?: boolean
  onLongPress?: () => void
}) {
  const timer = useRef<number | null>(null)
  const fired = useRef(false)
  const cancel = () => {
    if (timer.current != null) window.clearTimeout(timer.current)
    timer.current = null
  }
  useEffect(() => cancel, [])
  const unread = phone.unread[app.id] ?? 0
  const isNew = phone.newApps.includes(app.id)
  const soon = app.status === 'soon'
  const look = ICONS[app.id]
  const aria = unread > 0 ? `${app.label}, ${unread} new` : isNew ? `${app.label}, new` : soon ? `${app.label}, coming soon` : app.label

  return (
    <button
      type="button"
      className={`${styles.appBtn} ${editing ? styles.appEditing : ''} ${selected ? styles.appSelected : ''}`}
      aria-label={aria}
      aria-pressed={editing ? !!selected : undefined}
      onPointerDown={() => {
        fired.current = false
        if (editing || !onLongPress) return
        cancel()
        timer.current = window.setTimeout(() => {
          fired.current = true
          onLongPress()
        }, LONG_PRESS_MS)
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (fired.current) {
          fired.current = false
          return
        }
        onOpen(app.id)
      }}
    >
      <span
        className={`${styles.appIcon} ${app.image ? styles.appIconLogo : ''}`}
        style={look && !app.image ? { background: `linear-gradient(160deg, ${look.from}, ${look.to})` } : undefined}
      >
        {app.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- tiny static logo
          <img src={app.image} alt="" aria-hidden="true" width={52} height={52} />
        ) : look ? (
          <look.Icon aria-hidden="true" size={28} strokeWidth={2.2} color="#fff" />
        ) : (
          <span aria-hidden="true">{app.emoji}</span>
        )}
        {unread > 0 ? (
          <span className={styles.badge} aria-hidden="true">{unread > 9 ? '9+' : unread}</span>
        ) : isNew ? (
          <span className={styles.newPill} aria-hidden="true">NEW</span>
        ) : null}
        {soon ? <span className={styles.lockDot} aria-hidden="true" /> : null}
      </span>
      {dock ? null : <span className={styles.appLabel}>{app.label}</span>}
    </button>
  )
}

export function AppGrid({ phone, onOpen }: { phone: PhoneState; onOpen: (id: PhoneAppId) => void }) {
  const allIds = useMemo(() => PHONE_APPS.map((a) => a.id), [])
  const [layout, setLayout] = useState<PhoneLayout>(() => loadLayout(allIds))
  const [editing, setEditing] = useState(false)
  const [selected, setSelected] = useState<PhoneAppId | null>(null)
  const [hint, setHint] = useState<string | null>(null)

  // Saved arrangement lives in localStorage; read it after mount so SSR and the first paint match.
  useEffect(() => {
    setLayout(loadLayout(allIds))
  }, [allIds])

  const apply = (next: PhoneLayout | null) => {
    if (!next) {
      setHint(`Dock is full (${DOCK_MAX}). Unpin one first.`)
      return
    }
    setHint(null)
    setLayout(next)
    saveLayout(next)
  }
  const find = (id: PhoneAppId) => PHONE_APPS.find((a) => a.id === id)
  const gridApps = layout.grid.map(find).filter((a): a is App => !!a)
  const dockApps = layout.dock.map(find).filter((a): a is App => !!a)
  const inDock = selected ? layout.dock.includes(selected) : false

  const startEdit = (id: PhoneAppId) => {
    setEditing(true)
    setSelected(id)
    setHint(null)
  }
  const tap = (id: PhoneAppId) => {
    if (editing) setSelected(id)
    else onOpen(id)
  }
  const done = () => {
    setEditing(false)
    setSelected(null)
    setHint(null)
  }
  const icon = (app: App, dock?: boolean) => (
    <AppIcon
      app={app}
      phone={phone}
      onOpen={tap}
      dock={dock}
      editing={editing}
      selected={editing && selected === app.id}
      onLongPress={() => startEdit(app.id)}
    />
  )

  return (
    <>
      {editing ? (
        <div className={styles.editBar} role="toolbar" aria-label="Arrange apps">
          <p className={styles.editHint}>{hint ?? (selected ? `${find(selected)?.label}` : 'Tap an app')}</p>
          <div className={styles.editBtns}>
            <button type="button" className={styles.editBtn} disabled={!selected} aria-label="Move earlier" onClick={() => selected && apply(moveApp(layout, selected, -1))}>◀</button>
            <button type="button" className={styles.editBtn} disabled={!selected} aria-label="Move later" onClick={() => selected && apply(moveApp(layout, selected, 1))}>▶</button>
            <button
              type="button"
              className={styles.editBtn}
              disabled={!selected}
              onClick={() => selected && apply(inDock ? unpinApp(layout, selected) : pinApp(layout, selected))}
            >
              {inDock ? 'Unpin' : 'Pin'}
            </button>
            <button type="button" className={`${styles.editBtn} ${styles.editDone}`} onClick={done}>Done</button>
          </div>
        </div>
      ) : null}
      <div className={styles.grid} role="list" aria-label="Apps">
        {gridApps.map((app) => (
          <div key={app.id} role="listitem">{icon(app)}</div>
        ))}
      </div>
      <div className={styles.dock} role="list" aria-label="Dock">
        {dockApps.map((app) => (
          <div key={app.id} role="listitem">{icon(app, true)}</div>
        ))}
      </div>
    </>
  )
}
