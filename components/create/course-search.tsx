'use client'

import { Search, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { AAU_COURSES, FEATURED_COURSE_IDS, getCourse, type AauCourse } from '@/lib/game/aau-courses'
import styles from './course-search.module.css'

const years = (count: number) => `${count} ${count === 1 ? 'year' : 'years'}`

/** Every word typed has to appear in the name, faculty or degree. */
function matches(course: AauCourse, query: string) {
  const hay = `${course.name} ${course.faculty} ${course.degree}`.toLowerCase()
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => hay.includes(word))
}

/**
 * Pick your AAU course: a few common ones to start with, and a search for the other 60-odd.
 * On a phone the search is an icon that opens the box; on a wide screen the box is always there.
 */
export function CourseSearch({ value, onChange }: { value: string | null; onChange: (id: string) => void }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const chosen = getCourse(value)

  const featured = useMemo(
    () => FEATURED_COURSE_IDS.map((id) => getCourse(id)).filter((course): course is AauCourse => Boolean(course)),
    [],
  )
  const found = useMemo(() => (query.trim() ? AAU_COURSES.filter((course) => matches(course, query)) : []), [query])
  const searching = query.trim().length > 0

  const pick = (id: string) => {
    onChange(id)
    setQuery('')
    setOpen(false)
  }

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (!next) setQuery('')
    else window.setTimeout(() => input.current?.focus(), 0)
  }

  return (
    <div className={styles.root}>
      <div className={styles.head}>
        <h3 className={styles.label}>Your course</h3>
        <button
          type="button"
          className={styles.iconBtn}
          aria-label={open ? 'Close course search' : 'Search for your course'}
          aria-expanded={open}
          onClick={toggle}
        >
          {open ? <X size={18} aria-hidden="true" /> : <Search size={18} aria-hidden="true" />}
        </button>
      </div>

      <label className={styles.search} data-open={open}>
        <Search size={16} aria-hidden="true" />
        <input
          ref={input}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search your course, e.g. Law or Zoology"
          aria-label="Search your course"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
        />
      </label>

      {chosen && !searching ? (
        <p className={styles.chosen} role="status">
          <strong>{chosen.name}</strong>
          <span>
            {years(chosen.years)} · {chosen.faculty}
          </span>
        </p>
      ) : null}

      {searching ? (
        found.length > 0 ? (
          <ul className={styles.results} role="listbox" aria-label="Courses">
            {found.map((course) => (
              <li key={course.id} role="option" aria-selected={value === course.id}>
                <button type="button" className={styles.row} onClick={() => pick(course.id)}>
                  <span className={styles.name}>{course.name}</span>
                  <span className={styles.meta}>
                    {course.faculty} · {course.degree}
                  </span>
                  <span className={styles.years}>{years(course.years)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.none}>No course matches “{query.trim()}”.</p>
        )
      ) : (
        <div className={styles.grid} role="group" aria-label="Common courses">
          {featured.map((course) => (
            <button
              key={course.id}
              type="button"
              className={styles.chip}
              aria-pressed={value === course.id}
              onClick={() => pick(course.id)}
            >
              <span className={styles.name}>{course.name}</span>
              <span className={styles.years}>{years(course.years)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
