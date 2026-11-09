import { describe, expect, it } from 'vitest'
import { shownDepartment } from './profile-constants.js'

describe('shownDepartment', () => {
  it('shows the role for graduates, lecturers and indigenes with no course', () => {
    expect(shownDepartment('Undeclared', 'graduate')).toBe('Graduate')
    expect(shownDepartment('Undeclared', 'lecturer')).toBe('Lecturer')
    expect(shownDepartment(null, 'indigene')).toBe('Indigene')
  })
  it('keeps a real department, and students stay as they are', () => {
    expect(shownDepartment('Law', 'graduate')).toBe('Law')
    expect(shownDepartment('Undeclared', 'student')).toBe('Undeclared')
    expect(shownDepartment('Mass Communication', null)).toBe('Mass Communication')
  })
})
