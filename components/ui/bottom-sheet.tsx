'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode, type Ref } from 'react'
import styles from './bottom-sheet.module.css'

/** Drag further than this (px) down to collapse / close, or up to expand. */
const DRAG_DOWN = 80
const DRAG_UP = 28
/** Matches the leave transition in the stylesheet. */
const LEAVE_MS = 200

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export type BottomSheetProps = {
  open: boolean
  onClose: () => void
  title: string
  /** Line under the title (text, or text with a status pill). */
  subtitle?: ReactNode
  /** Replaces the icon + title block (tabs, a wallet…). The handle and close button stay. */
  header?: ReactNode
  /** Left of the title: an emoji / sticker in a round badge. */
  icon?: ReactNode
  /** Left of the title, unstyled (e.g. an avatar). Wins over `icon`. */
  leading?: ReactNode
  /** Modal: backdrop (tap to close), focus trap, portal above the HUD. Off: sits over the map, map stays usable. */
  modal?: boolean
  /** Open at the tall stop straight away (dedicated screens such as a profile). */
  startExpanded?: boolean
  /** Keep the tall stop's full height even when the content is short. */
  fillHeight?: boolean
  /** Desktop: a centred card instead of spanning the window. */
  desktopCard?: boolean
  /** Hide the round close button (the handle, backdrop and Escape still close). */
  hideClose?: boolean
  /** Stays pinned under the scrolling body (primary action). */
  footer?: ReactNode
  /** Accessible name when it should differ from the title. */
  ariaLabel?: string
  /** The scrolling body (e.g. to scroll back to the top when the content changes). */
  bodyRef?: Ref<HTMLDivElement>
  /** Body as a plain block instead of a 10px-gap stack (for content that brings its own layout). */
  plainBody?: boolean
  bodyClassName?: string
  className?: string
  children: ReactNode
}

/**
 * The one bottom sheet (ekpoma-mobile-ui rule 5): slides up, drag handle, swipe down or tap the
 * backdrop to close, opens to at most 45% of the screen and grows to 85% when dragged up or
 * scrolled, content scrolls inside, footer stays pinned, safe areas respected.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  subtitle,
  icon,
  leading,
  modal = false,
  startExpanded = false,
  fillHeight = false,
  desktopCard = false,
  hideClose = false,
  footer,
  ariaLabel,
  bodyRef,
  plainBody = false,
  bodyClassName,
  header,
  className,
  children,
}: BottomSheetProps) {
  const [expanded, setExpanded] = useState(startExpanded)
  const [leaving, setLeaving] = useState(false)
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const drag = useRef<{ id: number; startY: number; dy: number } | null>(null)
  const leaveTimer = useRef<number | null>(null)

  // Every opening starts from the same stop
  useEffect(() => {
    if (open) {
      setExpanded(startExpanded)
      setLeaving(false)
    }
    return () => {
      if (leaveTimer.current !== null) window.clearTimeout(leaveTimer.current)
      leaveTimer.current = null
    }
  }, [open, startExpanded])

  const requestClose = useCallback(() => {
    if (prefersReducedMotion()) {
      onClose()
      return
    }
    setLeaving(true)
    if (leaveTimer.current !== null) window.clearTimeout(leaveTimer.current)
    leaveTimer.current = window.setTimeout(() => {
      leaveTimer.current = null
      onClose()
    }, LEAVE_MS)
  }, [onClose])

  // Non-modal sheets have no dialog primitive to catch Escape
  useEffect(() => {
    if (!open || modal) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, modal, requestClose])

  const setOffset = (dy: number) => {
    const el = sheetRef.current
    if (!el) return
    el.style.setProperty('--sheet-drag', `${Math.max(0, dy)}px`)
    el.toggleAttribute('data-dragging', dy !== 0)
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    if ((event.target as HTMLElement).closest('button, a, input, select, textarea')) return
    drag.current = { id: event.pointerId, startY: event.clientY, dy: 0 }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.id !== event.pointerId) return
    d.dy = event.clientY - d.startY
    setOffset(d.dy)
  }

  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.id !== event.pointerId) return
    drag.current = null
    setOffset(0)
    if (d.dy <= -DRAG_UP) setExpanded(true)
    else if (d.dy >= DRAG_DOWN) {
      // From the tall stop a swipe first drops back to the short one
      if (expanded && !startExpanded) setExpanded(false)
      else requestClose()
    }
  }

  if (!open) return null

  const classes = [
    styles.sheet,
    modal ? styles.modal : styles.inline,
    expanded ? styles.expanded : '',
    expanded && fillHeight ? styles.fill : '',
    desktopCard ? styles.desktopCard : '',
    leaving ? styles.leaving : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  const heading = modal ? <Dialog.Title className={styles.title}>{title}</Dialog.Title> : <h2 className={styles.title}>{title}</h2>

  const inner = (
    <>
      <div
        className={styles.grab}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <div className={styles.handle} aria-hidden="true" />
        <header className={styles.head}>
          {header ? (
            <div className={styles.custom}>{header}</div>
          ) : leading ? (
            <div className={styles.leading}>{leading}</div>
          ) : icon ? (
            <span className={styles.icon} aria-hidden="true">
              {icon}
            </span>
          ) : null}
          {header ? null : (
            <div className={styles.titles}>
              {heading}
              {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
            </div>
          )}
          {hideClose ? null : (
            <button type="button" className={styles.close} aria-label="Close" onClick={requestClose}>
              <X size={18} aria-hidden="true" />
            </button>
          )}
        </header>
      </div>
      <div
        ref={bodyRef}
        className={[styles.body, plainBody ? styles.bodyPlain : '', bodyClassName ?? ''].filter(Boolean).join(' ')}
        onScroll={(event) => {
          // Scrolling for more is the same wish as dragging up
          if (!expanded && event.currentTarget.scrollTop > 8) setExpanded(true)
        }}
      >
        {children}
      </div>
      {footer ? <div className={styles.footer}>{footer}</div> : null}
    </>
  )

  if (!modal) {
    return (
      <section ref={sheetRef} className={classes} aria-label={ariaLabel ?? title}>
        {inner}
      </section>
    )
  }

  return (
    <Dialog.Root
      open
      onOpenChange={(next) => {
        if (!next) requestClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={`${styles.backdrop} ${leaving ? styles.backdropLeaving : ''}`} />
        <Dialog.Content ref={sheetRef} className={classes} aria-label={header ? (ariaLabel ?? title) : ariaLabel} aria-describedby={undefined}>
          {inner}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** Small status pill for a sheet subtitle ("Open", "Under construction"). */
export function SheetPill({ tone = 'neutral', children }: { tone?: 'neutral' | 'ok' | 'warn'; children: ReactNode }) {
  return <span className={`${styles.pill} ${tone === 'ok' ? styles.pillOk : tone === 'warn' ? styles.pillWarn : ''}`}>{children}</span>
}
