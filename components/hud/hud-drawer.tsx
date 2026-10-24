'use client'

import type { ReactNode } from 'react'
import { Drawer } from 'vaul'
import { hapticTap } from './haptic'
import styles from './hud-drawer.module.css'

export function HudDrawer({
  open,
  onOpenChange,
  title,
  description,
  leading,
  tall = false,
  fit = false,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  /** Shown left of the title (e.g. the player's avatar). */
  leading?: ReactNode
  /** Open straight to near full height (no half-height stop). */
  tall?: boolean
  /** Short sheet: size to its content instead of snapping to screen-height stops. */
  fit?: boolean
  children: ReactNode
}) {
  return (
    <Drawer.Root
      open={open}
      onOpenChange={(next) => {
        if (next) hapticTap()
        onOpenChange(next)
      }}
      shouldScaleBackground={false}
      {...(fit ? {} : { snapPoints: tall ? [0.92] : [0.4, 0.9], fadeFromIndex: 0 as const })}
    >
      <Drawer.Portal>
        <Drawer.Overlay className={styles.overlay} />
        <Drawer.Content className={`${styles.content} ${tall ? styles.contentTall : ''}`}>
          <div className={styles.handle} aria-hidden="true" />
          <div className={`${styles.header} ${leading ? styles.headerWithLeading : ''}`}>
            {leading ? <div className={styles.leading}>{leading}</div> : null}
            <div className={styles.headerText}>
            <Drawer.Title className={styles.title}>{title}</Drawer.Title>
            {description ? (
              <Drawer.Description className={styles.description}>{description}</Drawer.Description>
            ) : (
              <Drawer.Description className="sr-only">{title}</Drawer.Description>
            )}
            </div>
          </div>
          <div className={styles.body}>{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
