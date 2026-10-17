'use client'

import { motion, useReducedMotion } from 'framer-motion'
import Image from 'next/image'
import type { ReactNode } from 'react'
import styles from './studio-panel.module.css'

const ease = [0.22, 1, 0.36, 1] as const

export function StudioPanel({
  toast,
  children,
  action,
}: {
  toast?: string | null
  children: ReactNode
  action: ReactNode
}) {
  return (
    <aside className={styles.shell}>
      <div className={styles.panel}>
        {toast ? (
          <p className={styles.toast} role="status">
            {toast}
          </p>
        ) : null}
        <div className={styles.scroll}>{children}</div>
        <div className={styles.footer}>{action}</div>
      </div>
    </aside>
  )
}

export function NameField({ username }: { username: string }) {
  return (
    <div className={styles.identity}>
      <p className={styles.identityName}>@{username}</p>
      <p className={styles.identityHint}>your Sim's name</p>
    </div>
  )
}

export function PanelPrompt({ children }: { children: ReactNode }) {
  return <p className={styles.prompt}>{children}</p>
}

export function PanelSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.label}>{label}</h2>
      {children}
    </section>
  )
}

export function PanelGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className={styles.group}>
      <h2 className={styles.label}>{label}</h2>
      {children}
    </section>
  )
}

export function Emoji3D({ src, size }: { src: string; size: 32 | 40 }) {
  return <Image className={styles.emoji} src={src} alt="" width={size} height={size} aria-hidden="true" />
}

export function Selectable({
  index,
  pressed,
  className,
  children,
  onClick,
  ariaLabel,
  style,
  role,
}: {
  index: number
  pressed: boolean
  className: string
  children?: ReactNode
  onClick: () => void
  ariaLabel?: string
  style?: { backgroundColor?: string }
  role?: 'radio'
}) {
  const reduce = useReducedMotion()

  return (
    <motion.button
      type="button"
      className={className}
      role={role}
      aria-pressed={role === 'radio' ? undefined : pressed}
      aria-checked={role === 'radio' ? pressed : undefined}
      aria-label={ariaLabel}
      style={style}
      onClick={onClick}
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.22, delay: reduce ? 0 : index * 0.03, ease }}
      whileTap={reduce ? undefined : { scale: 0.98 }}
    >
      {children}
    </motion.button>
  )
}

export function PillRow({
  split,
  compact,
  children,
}: {
  split?: boolean
  compact?: boolean
  children: ReactNode
}) {
  const className = compact ? styles.pillsCompact : split ? styles.pillsSplit : styles.pills
  return <div className={className}>{children}</div>
}

export function pillClass(compact?: boolean) {
  return compact ? `${styles.pill} ${styles.pillCompact}` : styles.pill
}

export function traitCardClass() {
  return styles.card
}

export function dreamCardClass() {
  return `${styles.card} ${styles.dream}`
}

export function TraitGrid({ children }: { children: ReactNode }) {
  return (
    <div className={styles.traitGrid} role="group" aria-label="Character traits">
      {children}
    </div>
  )
}

export function DreamList({ children, label = 'Big dream' }: { children: ReactNode; label?: string }) {
  return (
    <div className={styles.dreamList} role="radiogroup" aria-label={label}>
      {children}
    </div>
  )
}

export function lodgeCardClass(picked?: boolean) {
  return [styles.card, styles.lodge, styles.lodgeShell, picked ? styles.lodgePicked : '']
    .filter(Boolean)
    .join(' ')
}

export function lodgeHitClass() {
  return styles.lodgeHit
}

export function courseChipClass() {
  return styles.course
}

export function LodgeHead({
  title,
  badge,
  icon,
  photo,
  badgeTone,
}: {
  title: string
  badge: string
  icon: string
  photo?: boolean
  badgeTone?: 'student' | 'onebed'
}) {
  return (
    <span className={styles.lodgeHead}>
      {photo ? (
        <Image className={styles.photo} src={icon} alt="" width={40} height={40} aria-hidden="true" />
      ) : (
        <Emoji3D src={icon} size={40} />
      )}
      <span className={styles.title}>{title}</span>
      <span
        className={
          badgeTone === 'student'
            ? `${styles.badge} ${styles.badgeStudent}`
            : badgeTone === 'onebed'
              ? `${styles.badge} ${styles.badgeOnebed}`
              : styles.badge
        }
      >
        {badge}
      </span>
    </span>
  )
}

export function Blurb({ children }: { children: ReactNode }) {
  return <span className={styles.blurb}>{children}</span>
}

export function LodgeDetails({
  perks,
  coursesLabel,
  courses,
  courseId,
  onCourse,
}: {
  perks: string[]
  coursesLabel: string
  courses: { id: string; label: string; years: string; icon: string }[]
  courseId: string | null
  onCourse: (id: string) => void
}) {
  return (
    <div className={styles.details}>
      <ul className={styles.perks}>
        {perks.map((perk) => (
          <li key={perk} className={styles.perk}>
            {perk}
          </li>
        ))}
      </ul>
      <h3 className={styles.label}>{coursesLabel}</h3>
      <div className={styles.courseGrid} role="group" aria-label={coursesLabel}>
        {courses.map((course, index) => (
          <Selectable
            key={course.id}
            index={index}
            pressed={courseId === course.id}
            className={styles.course}
            onClick={() => onCourse(course.id)}
          >
            <span className={styles.courseName}>
              <span aria-hidden="true">{course.icon}</span>
              {course.label}
            </span>
            <span className={styles.courseYears}>{course.years}</span>
          </Selectable>
        ))}
      </div>
    </div>
  )
}

export function LodgeMoney({ rent }: { rent: string }) {
  return (
    <span className={styles.money}>
      <span className={styles.rent}>Rent {rent}/wk</span>
    </span>
  )
}

export function CardCopy({ title, description }: { title: string; description: string }) {
  return (
    <span className={styles.copy}>
      <span className={styles.title}>{title}</span>
      <span className={styles.blurb}>{description}</span>
    </span>
  )
}

export function ColorSwatches({
  label,
  colors,
  value,
  onChange,
}: {
  label: string
  colors: readonly string[]
  value: string
  onChange: (color: string) => void
}) {
  const current = value.toUpperCase()

  return (
    <PanelSection label={label}>
      <div className={styles.swatches}>
        {colors.map((color, index) => {
          const selected = color.toUpperCase() === current
          return (
            <Selectable
              key={color}
              index={index}
              pressed={selected}
              className={styles.swatch}
              ariaLabel={`${label} ${color}`}
              style={{ backgroundColor: color }}
              onClick={() => onChange(color.toUpperCase())}
            />
          )
        })}
      </div>
    </PanelSection>
  )
}
