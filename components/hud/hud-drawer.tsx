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
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
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
      snapPoints={[0.4, 0.9]}
      fadeFromIndex={0}
    >
      <Drawer.Portal>
        <Drawer.Overlay className={styles.overlay} />
        <Drawer.Content className={styles.content}>
          <div className={styles.handle} aria-hidden="true" />
          <div className={styles.header}>
            <Drawer.Title className={styles.title}>{title}</Drawer.Title>
            {description ? (
              <Drawer.Description className={styles.description}>{description}</Drawer.Description>
            ) : (
              <Drawer.Description className="sr-only">{title}</Drawer.Description>
            )}
          </div>
          <div className={styles.body}>{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
