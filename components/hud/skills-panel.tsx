'use client'

import { useEffect, useState } from 'react'
import { SKILL_INFO, fetchSkills, type SkillView } from '@/lib/game/skills-api'
import styles from './skills-panel.module.css'

/** Profile → Skills: each skill's level (0–10) as a 10-step bar, progress to the next, and how to train it. */
export function SkillsPanel() {
  const [skills, setSkills] = useState<SkillView[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stop = false
    void fetchSkills().then((res) => {
      if (stop) return
      if (res.ok) setSkills(res.skills)
      else setError(res.error || 'Could not load your skills.')
    })
    return () => {
      stop = true
    }
  }, [])

  if (error) return <p className={styles.note}>{error}</p>
  if (!skills) return <p className={styles.note}>Loading your skills…</p>

  return (
    <div className={styles.list}>
      {skills.map((s) => {
        const info = SKILL_INFO[s.id]
        const part = s.next === null ? 1 : (s.xp - s.floor) / Math.max(1, s.next - s.floor)
        return (
          <section key={s.id} className={styles.card}>
            <div className={styles.top}>
              <span className={styles.icon} aria-hidden="true">
                {info.emoji}
              </span>
              <span className={styles.name}>{s.label}</span>
              <span className={styles.level}>Level {s.level}</span>
            </div>
            <div className={styles.bar} role="meter" aria-valuemin={0} aria-valuemax={10} aria-valuenow={s.level} aria-label={`${s.label} level ${s.level} of 10`}>
              {Array.from({ length: 10 }, (_, i) => (
                <span key={i} className={styles.step}>
                  <span className={styles.fill} style={{ width: i < s.level ? '100%' : i === s.level ? `${Math.round(part * 100)}%` : '0%' }} />
                </span>
              ))}
            </div>
            <p className={styles.how}>{s.level >= 10 ? 'Maxed out.' : info.how}</p>
          </section>
        )
      })}
      <p className={styles.note}>Everyone starts at 0. Some actions and jobs need a skill level: their card tells you which.</p>
    </div>
  )
}
