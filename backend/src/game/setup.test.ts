import { describe, expect, it } from 'vitest'
import { AAU_COURSES, FEATURED_COURSE_IDS, departmentForCourse, getCourse, isCourseId } from './aau-courses.js'
import { setupBodySchema } from './setup.js'

describe('setupBodySchema', () => {
  it('accepts a graduate in an off-campus house with no course', () => {
    const parsed = setupBodySchema.safeParse({
      characterType: 'graduate',
      lodgingId: 'single-poultry',
      courseId: null,
    })
    expect(parsed.success).toBe(true)
  })

  it('needs a course for a student, in any house', () => {
    for (const lodgingId of ['hostel-poultry', 'single-poultry', 'selfcon-g2', 'onebed-ojo']) {
      expect(setupBodySchema.safeParse({ characterType: 'student', lodgingId }).success).toBe(false)
      expect(setupBodySchema.safeParse({ characterType: 'student', lodgingId, courseId: 'zoology' }).success).toBe(true)
    }
  })

  it('lets a student with a course live off campus', () => {
    const parsed = setupBodySchema.safeParse({
      characterType: 'student',
      lodgingId: 'onebed-ojo',
      courseId: 'computer-science',
    })
    expect(parsed.success).toBe(true)
  })

  it('keeps the AAU hostel for students only', () => {
    for (const characterType of ['graduate', 'lecturer', 'indigene', 'casual']) {
      const parsed = setupBodySchema.safeParse({ characterType, lodgingId: 'hostel-poultry', courseId: 'law' })
      expect(parsed.success).toBe(false)
    }
  })

  it('rejects a course that is not on the AAU list', () => {
    const parsed = setupBodySchema.safeParse({ characterType: 'student', lodgingId: 'single-poultry', courseId: 'witchcraft' })
    expect(parsed.success).toBe(false)
  })
})

describe('AAU courses', () => {
  it('lists the 72 undergraduate courses with unique ids', () => {
    expect(AAU_COURSES).toHaveLength(72)
    expect(new Set(AAU_COURSES.map((course) => course.id)).size).toBe(72)
  })

  it('keeps the old ids working and names the department after the course', () => {
    expect(isCourseId('engineering')).toBe(true)
    expect(isCourseId('education')).toBe(true)
    expect(departmentForCourse('mass-comm')).toBe('Mass Communication')
    expect(departmentForCourse('engineering')).toBe('Engineering')
    expect(departmentForCourse('nope')).toBeNull()
  })

  it('starts the list with Human Physiology and keeps every featured id real', () => {
    expect(FEATURED_COURSE_IDS[0]).toBe('human-physiology')
    for (const id of FEATURED_COURSE_IDS) expect(getCourse(id)).not.toBeNull()
  })

  it('files the medical courses under the College of Medicine', () => {
    const medical = AAU_COURSES.filter((course) => course.faculty.includes('Basic Medical Sciences'))
    expect(medical.map((course) => course.id).sort()).toEqual(
      ['anatomy', 'human-physiology', 'medical-laboratory-science', 'medicine-and-surgery', 'nursing'].sort(),
    )
    for (const course of medical) expect(course.faculty).toBe('College of Medicine / Basic Medical Sciences')
  })

  it('gives Nursing Science and Medical Laboratory Science five years', () => {
    expect(getCourse('nursing')?.years).toBe(5)
    expect(getCourse('medical-laboratory-science')?.years).toBe(5)
  })
})
