export const STUDY_LEVELS = ['100L', '200L', '300L', '400L', '500L'] as const
export type StudyLevel = (typeof STUDY_LEVELS)[number]

export const PROFILE_DEPARTMENTS = [
  'Computer Science',
  'Engineering',
  'Mass Communication',
  'Law',
  'Accounting',
  'Theatre Arts',
  'Nursing Science',
  'Education',
  'Undeclared',
] as const

export const COURSE_ID_TO_DEPARTMENT: Record<string, string> = {
  'computer-science': 'Computer Science',
  engineering: 'Engineering',
  'mass-comm': 'Mass Communication',
  law: 'Law',
  accounting: 'Accounting',
  'theatre-arts': 'Theatre Arts',
  nursing: 'Nursing Science',
  education: 'Education',
}

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
