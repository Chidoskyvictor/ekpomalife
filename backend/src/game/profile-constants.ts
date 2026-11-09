import { AAU_COURSES } from './aau-courses.js'

export const STUDY_LEVELS = ['100L', '200L', '300L', '400L', '500L'] as const
export type StudyLevel = (typeof STUDY_LEVELS)[number]



/** Every AAU course, plus the older broad names players may already have. */
export const PROFILE_DEPARTMENTS: readonly string[] = [
  ...new Set([
    'Engineering',
    'Education',
    'Theatre Arts',
    ...AAU_COURSES.map((course) => course.name).sort((a, b) => a.localeCompare(b)),
    'Undeclared',
  ]),
]

export const AVATAR_COLORS = [
  '#3d9ad6',
  '#16a34a',
  '#ea580c',
  '#db2777',
  '#7c3aed',
  '#0d9488',
  '#ca8a04',
  '#e11d48',
  '#64748b',
  '#2563eb',
] as const

export const AVATAR_EMOJIS = ['😊', '🎓', '✨', '🔥', '💫', '🌿', '🎤', '⚽', '📚', '🛡️'] as const

const ROLE_LABELS: Record<string, string> = { graduate: 'Graduate', lecturer: 'Lecturer', indigene: 'Indigene' }

/**
 * The department shown on a profile. Graduates, lecturers and indigenes have no course, so their
 * profile defaulted to "Undeclared": show their role instead (an edited department still wins).
 */
export function shownDepartment(department: string | null | undefined, characterType: string | null | undefined): string {
  const role = characterType ? ROLE_LABELS[characterType] : undefined
  if (role && (!department || department === 'Undeclared')) return role
  return department || 'Undeclared'
}
