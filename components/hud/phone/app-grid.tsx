'use client'

import {
  Briefcase,
  CalendarDays,
  Gamepad2,
  GraduationCap,
  Headphones,
  House,
  Landmark,
  LifeBuoy,
  Map as MapIcon,
  MessageCircle,
  Podcast,
  Newspaper,
  Settings,
  ShoppingBag,
  TrendingUp,
  UserRound,
  VenetianMask,
  AudioLines,
  Bike,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { DOCK_MAX, loadLayout, moveApp, pinApp, saveLayout, unpinApp, type PhoneLayout } from '@/lib/game/phone-layout'
import { PHONE_APPS, type PhoneAppId, type PhoneState } from '@/lib/game/phone'
import styles from './phone.module.css'

/* Soft pastel tiles with a 3D icon on top (Fluent Emoji 3D, MIT, public/apps/icons); a line icon if the picture can't load. */
const ICONS: Partial<Record<PhoneAppId, { Icon: LucideIcon; from: string; to: string }>> = {
  messages: { Icon: MessageCircle, from: '#bff0cd', to: '#8fe0a8' },
  jobs: { Icon: Briefcase, from: '#fff1dc', to: '#ffe0b5' },
  invest: { Icon: TrendingUp, from: '#dcfaf0', to: '#b8f0dd' },
  bank: { Icon: Landmark, from: '#e3ecff', to: '#c9d9ff' },
  houses: { Icon: House, from: '#ffe6e1', to: '#ffcfc6' },
  eta: { Icon: AudioLines, from: '#ffe4f1', to: '#ffcae3' },
  gist: { Icon: Newspaper, from: '#eef0f4', to: '#dde1e9' },
  market: { Icon: ShoppingBag, from: '#ffe3ee', to: '#ffc9dd' },
  ride: { Icon: Bike, from: '#fff6cf', to: '#ffe999' },
  map: { Icon: MapIcon, from: '#dcf7f3', to: '#b9ede5' },
  calendar: { Icon: CalendarDays, from: '#ffe5e5', to: '#ffcccc' },
  profile: { Icon: UserRound, from: '#e1f2ff', to: '#c4e4ff' },
  games: { Icon: Gamepad2, from: '#ece6ff', to: '#d9ceff' },
  spaces: { Icon: Podcast, from: '#f1e6ff', to: '#e2ccff' },
  anonymous: { Icon: VenetianMask, from: '#e9e1ff', to: '#cbbcf5' },
  settings: { Icon: Settings, from: '#eef1f5', to: '#dce2ea' },
  support: { Icon: LifeBuoy, from: '#dbeafe', to: '#bfdbfe' },
  portal: { Icon: GraduationCap, from: '#e6e9ff', to: '#cdd3ff' },
  music: { Icon: Headphones, from: '#ffe3ea', to: '#ffc8d5' },
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
          <TileArt id={app.id} Icon={look.Icon} />
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

/** The app's 3D icon (public/apps/icons/<id>.webp, rendered in Blender); the line icon if it can't load. */
function TileArt({ id, Icon }: { id: string; Icon: LucideIcon }) {
  const [broken, setBroken] = useState(false)
  if (broken) return <Icon aria-hidden="true" size={28} strokeWidth={2.2} color="#374151" />
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny static render
    <img
      src={`/apps/icons/${id}.webp?v=1`}
      alt=""
      aria-hidden="true"
      width={46}
      height={46}
      draggable={false}
      onError={() => setBroken(true)}
      style={{ width: '82%', height: '82%', objectFit: 'contain', filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.12))' }}
    />
  )
}
