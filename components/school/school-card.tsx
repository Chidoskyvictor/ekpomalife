'use client'

import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useGame } from '@/hooks/use-game'
import { nextStep, useSchool } from '@/lib/game/school-api'
import { CLASSES_PER_DAY, EXAM_PLACE, FEES_PLACE, LECTURE_BUILDINGS } from '@/lib/game/school-rules'
import { StudentPortal } from './student-portal'
import styles from './school.module.css'

const SCHOOL_PLACES = new Set<string>([...LECTURE_BUILDINGS, EXAM_PLACE, FEES_PLACE])

/**
 * AAU school card at the top while you're at a school building: level and semester, CGPA, the
 * exam prep bar, today's classes as dots and what to do next. ✕ shrinks it to a small pill.
 */
export function SchoolCard() {
  const { state, isGuest } = useGame()
  const placeId = state?.locationId ?? ''
  const atSchool = SCHOOL_PLACES.has(placeId)
  const { school, now, refresh } = useSchool(!isGuest && atSchool)
  const [small, setSmall] = useState(false)
  const [portal, setPortal] = useState(false)
  const [, setTick] = useState(0)

  // Fresh numbers each time you arrive, and the "next step" line follows the clock
  useEffect(() => {
    if (!atSchool || isGuest) return
    void refresh()
    const id = window.setInterval(() => setTick((n) => n + 1), 30_000)
    return () => window.clearInterval(id)
  }, [atSchool, isGuest, placeId, refresh])

  if (!atSchool || isGuest || !school) return null
  const r = school.record
  if (!r.isStudent || !r.courseId) return null

  const t = now()
  const classesToday = r.countsDay === t.day ? r.lecturesToday : 0
  const cgpa = school.cgpa == null ? '—' : school.cgpa.toFixed(2)

  return (
    <>
      {small ? (
        <button type="button" className={styles.mini} onClick={() => setSmall(false)}>
          🎓 {r.level}L · {r.prep}% · {classesToday}/{CLASSES_PER_DAY}
        </button>
      ) : (
        <section className={styles.card} aria-label="School">
          <div className={styles.top}>
            <span className={styles.icon} aria-hidden="true">
              🎓
            </span>
            <div className={styles.titles}>
              <p className={styles.title}>{r.graduated ? 'Graduated' : `${r.level}L · Semester ${r.semester}`}</p>
              <p className={styles.sub}>AAU · {school.courseName ?? 'Student'}</p>
            </div>
            <div className={styles.cgpa}>
              <strong>{cgpa}</strong>
              <span>CGPA</span>
            </div>
            <button type="button" className={styles.close} aria-label="Shrink" onClick={() => setSmall(true)}>
              <X size={16} aria-hidden="true" />
            </button>
          </div>

          <div className={styles.stats}>
            <div
              className={styles.bar}
              role="progressbar"
              aria-valuenow={r.prep}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Exam prep"
            >
              <div className={styles.barFill} style={{ width: `${r.prep}%` }} />
            </div>
            <span className={styles.prep}>Prep {r.prep}%</span>
            <span className={styles.dots} aria-label={`Classes today ${classesToday} of ${CLASSES_PER_DAY}`}>
              {Array.from({ length: CLASSES_PER_DAY }, (_, i) => (
                <span key={i} className={`${styles.dot} ${i < classesToday ? styles.dotOn : ''}`} />
              ))}
            </span>
          </div>

          <div className={styles.foot}>
            <p className={styles.next}>{nextStep(r, t)}</p>
            <button type="button" className={styles.portalBtn} onClick={() => setPortal(true)}>
              Portal
            </button>
          </div>
        </section>
      )}
      {portal ? <StudentPortal onClose={() => setPortal(false)} /> : null}
    </>
  )
}
