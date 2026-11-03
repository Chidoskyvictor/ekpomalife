'use client'

import { motion } from 'motion/react'
import { PHONE_APPS, type PhoneAppId, type PhoneState } from '@/lib/game/phone'
import styles from './phone.module.css'

function AppIcon({
  id,
  label,
  emoji,
  tint,
  image,
  unread,
  isNew,
  soon,
  onOpen,
}: {
  id: PhoneAppId
  label: string
  emoji: string
  tint: string
  image?: string
  unread: number
  isNew: boolean
  soon: boolean
  onOpen: (id: PhoneAppId) => void
}) {
  const aria =
    unread > 0
      ? `${label}, ${unread} new`
      : isNew
        ? `${label}, new`
        : soon
          ? `${label}, coming soon`
          : label

  return (
    <button type="button" className={styles.appBtn} aria-label={aria} onClick={() => onOpen(id)}>
      <motion.span
        layoutId={`app-${id}`}
        className={styles.appIcon}
        style={
          image
            ? { background: '#fff', overflow: 'hidden' }
            : { background: `linear-gradient(145deg, ${tint}, color-mix(in srgb, ${tint} 70%, #000))` }
        }
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- tiny static logo, no optimisation needed
          <img src={image} alt="" aria-hidden="true" width={52} height={52} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        ) : (
          <span aria-hidden="true">{emoji}</span>
        )}
        {unread > 0 ? (
          <span className={styles.badge} aria-hidden="true">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : isNew ? (
          <span className={styles.newPill} aria-hidden="true">
            NEW
          </span>
        ) : null}
        {soon ? <span className={styles.lockDot} aria-hidden="true" /> : null}
      </motion.span>
      <span className={styles.appLabel}>{label}</span>
    </button>
  )
}

export function AppGrid({
  phone,
  onOpen,
}: {
  phone: PhoneState
  onOpen: (id: PhoneAppId) => void
}) {
  return (
    <div className={styles.grid} role="list" aria-label="Apps">
      {PHONE_APPS.map((app) => (
        <div key={app.id} role="listitem">
          <AppIcon
            id={app.id}
            label={app.label}
            emoji={app.emoji}
            tint={app.tint}
            image={app.image}
            unread={phone.unread[app.id] ?? 0}
            isNew={phone.newApps.includes(app.id)}
            soon={app.status === 'soon'}
            onOpen={onOpen}
          />
        </div>
      ))}
    </div>
  )
}
