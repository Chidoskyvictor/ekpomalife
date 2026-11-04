'use client'

import { BodyPortal } from '@/components/ui/body-portal'
import { useGame } from '@/hooks/use-game'
import { useSchool } from '@/lib/game/school-api'
import panel from '@/components/buildings/building-panel.module.css'
import styles from './school.module.css'

const naira = (n: number) => `₦${n.toLocaleString()}`

/** AAU student portal: course, level, this session's fees, results and CGPA. */
export function StudentPortal({ onClose }: { onClose: () => void }) {
  const { isGuest } = useGame()
  const { school } = useSchool(!isGuest)
  const r = school?.record

  return (
    // Rendered on <body>: the HUD it's opened from ignores taps and would swallow Close
    <BodyPortal>
    <div className={panel.modal} role="dialog" aria-modal="true" aria-label="Student portal" onClick={onClose}>
      <div className={panel.modalCard} onClick={(event) => event.stopPropagation()}>
        <p className={panel.modalTitle}>🖥️ Student Portal</p>
        {!school || !r ? (
          <p className={panel.modalMeta}>Loading your record…</p>
        ) : !r.isStudent || !r.courseId ? (
          <p className={panel.modalMeta}>Only students have a portal.</p>
        ) : (
          <>
            <p className={panel.modalMeta}>
              {school.courseName} ·{' '}
              {r.graduated ? 'Graduated' : `${r.level}L of ${school.finalLevel}L, semester ${r.semester}`}
              {school.cgpa != null
                ? ` · CGPA ${school.cgpa.toFixed(2)}${school.classOfDegree ? ` (${school.classOfDegree})` : ''}`
                : ''}
            </p>
            <div className={styles.portalList}>
              <div className={styles.row}>
                <span>Acceptance fee</span>
                <strong>{r.acceptancePaid ? 'Paid ✅' : naira(school.fees.acceptance)}</strong>
              </div>
              <div className={styles.row}>
                <span>{r.level}L 1st installment</span>
                <strong>{r.paid1 ? 'Paid ✅' : naira(school.fees.installment1)}</strong>
              </div>
              <div className={styles.row}>
                <span>{r.level}L 2nd installment</span>
                <strong>{r.paid2 ? 'Paid ✅' : naira(school.fees.installment2)}</strong>
              </div>
              <p className={styles.muted} style={{ marginTop: 6 }}>
                Results
              </p>
              {r.results.length === 0 ? (
                <p className={styles.muted}>No results yet. Attend lectures, then write your exam at ICT.</p>
              ) : (
                [...r.results].reverse().map((res) => (
                  <div key={`${res.level}-${res.semester}-${res.day}`} className={styles.row}>
                    <span>
                      {res.level}L · Semester {res.semester}
                    </span>
                    <strong>
                      {res.grade} · {res.prep}%
                    </strong>
                  </div>
                ))
              )}
            </div>
          </>
        )}
        <button type="button" className={panel.btn} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
    </BodyPortal>
  )
}
