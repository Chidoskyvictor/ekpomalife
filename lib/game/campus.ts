/** Server-owned campus / academic progress (display only on the client). */

export type GpaRow = {
  semester: string
  gpa: number
  label?: string
}

export type CampusState = {
  /** 100 | 200 | 300 | 400 | 500 */
  level: number
  feesDue: number
  feesPaid: number
  registered: boolean
  hasMatricGown: boolean
  hasIdCard: boolean
  examSeason: boolean
  /** 0–100 per course key */
  attendance: Record<string, number>
  knowledge: Record<string, number>
  gpaHistory: GpaRow[]
  /** ISO deadline when an assignment is outstanding */
  assignmentDueAt: string | null
  clearanceDone: boolean
  convocationReady: boolean
  convocationDone: boolean
  /** Last exam score pending reveal at Student Affairs (0–100), or null */
  pendingExamScore: number | null
  facultyNotices: string[]
}

export function emptyCampus(level = 100): CampusState {
  return {
    level,
    feesDue: feeAmountForLevel(level),
    feesPaid: 0,
    registered: false,
    hasMatricGown: false,
    hasIdCard: false,
    /** Live server toggles this. Mock defaults on so ICT can be smoked after fees + registration. */
    examSeason: true,
    attendance: { general: 40 },
    knowledge: { general: 35 },
    gpaHistory: [],
    assignmentDueAt: new Date(Date.now() + 3 * 86400000).toISOString(),
    clearanceDone: false,
    convocationReady: false,
    convocationDone: false,
    pendingExamScore: null,
    facultyNotices: ['Welcome to AAU Ekpoma. Pay your fees early.'],
  }
}

export function feeAmountForLevel(level: number): number {
  if (level >= 500) return 95_000
  if (level >= 400) return 85_000
  if (level >= 300) return 75_000
  if (level >= 200) return 65_000
  return 55_000
}

export function feesBalance(campus: CampusState): number {
  return Math.max(0, campus.feesDue - campus.feesPaid)
}

export function feesCleared(campus: CampusState): boolean {
  return feesBalance(campus) <= 0
}
