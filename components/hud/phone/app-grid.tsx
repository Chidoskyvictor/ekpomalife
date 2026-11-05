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
  Mic,
  Newspaper,
  Settings,
  ShoppingBag,
  TrendingUp,
  UserRound,
  AudioLines,
  Bike,
  type LucideIcon,
} from 'lucide-react'
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
  spaces: { Icon: Mic, from: '#c084fc', to: '#7c2fe0' },
  settings: { Icon: Settings, from: '#a8b3c2', to: '#5d6878' },
  portal: { Icon: GraduationCap, from: '#7c8cff', to: '#3a3fc9' },
  music: { Icon: Headphones, from: '#ff5f7e', to: '#d0123f' },
}

const DOCK: PhoneAppId[] = ['messages', 'bank', 'ride', 'market']

type App = (typeof PHONE_APPS)[number]

function AppIcon({ app, phone, onOpen, dock }: { app: App; phone: PhoneState; onOpen: (id: PhoneAppId) => void; dock?: boolean }) {
  const unread = phone.unread[app.id] ?? 0
  const isNew = phone.newApps.includes(app.id)
  const soon = app.status === 'soon'
  const look = ICONS[app.id]
  const aria = unread > 0 ? `${app.label}, ${unread} new` : isNew ? `${app.label}, new` : soon ? `${app.label}, coming soon` : app.label

  return (
    <button type="button" className={styles.appBtn} aria-label={aria} onClick={() => onOpen(app.id)}>
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
  const docked = DOCK.map((id) => PHONE_APPS.find((a) => a.id === id)).filter((a): a is App => !!a)
  return (
    <>
      <div className={styles.grid} role="list" aria-label="Apps">
        {PHONE_APPS.filter((a) => !DOCK.includes(a.id)).map((app) => (
          <div key={app.id} role="listitem">
            <AppIcon app={app} phone={phone} onOpen={onOpen} />
          </div>
        ))}
      </div>
      <div className={styles.dock} role="list" aria-label="Dock">
        {docked.map((app) => (
          <div key={app.id} role="listitem">
            <AppIcon app={app} phone={phone} onOpen={onOpen} dock />
          </div>
        ))}
      </div>
    </>
  )
}
