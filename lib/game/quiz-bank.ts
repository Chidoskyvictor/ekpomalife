export type QuizQuestion = {
  id: string
  prompt: string
  choices: [string, string, string, string]
  /** Index 0–3 — never sent to client in real API; mock grades server-side. */
  answerIndex: number
}

/** Small banks by faculty / hall flavour. Server owns scoring; client only shows prompts. */
export const QUIZ_BANKS: Record<string, QuizQuestion[]> = {
  general: [
    {
      id: 'g1',
      prompt: 'AAU Ekpoma is in which state?',
      choices: ['Edo', 'Delta', 'Lagos', 'Ondo'],
      answerIndex: 0,
    },
    {
      id: 'g2',
      prompt: 'What do students call the early morning lecture?',
      choices: ['Night class', 'Morning devotion', 'First period', 'Chat hour'],
      answerIndex: 2,
    },
    {
      id: 'g3',
      prompt: 'ICT is mainly used for…',
      choices: ['Parties', 'Computer-based exams', 'Hostel allocation', 'Kekes'],
      answerIndex: 1,
    },
    {
      id: 'g4',
      prompt: 'Which need drops when you skip sleep to chat?',
      choices: ['Reputation', 'Energy', 'Cash', 'GPA title'],
      answerIndex: 1,
    },
    {
      id: 'g5',
      prompt: 'Baba Landlord collects…',
      choices: ['School fees', 'Rent', 'Matric gown', 'Exam scripts'],
      answerIndex: 1,
    },
  ],
  medicine: [
    {
      id: 'm1',
      prompt: 'MLS often stands for…',
      choices: ['Medical Lab Science', 'Mass Life Seminar', 'Main Lecture Square', 'Matric Level Study'],
      answerIndex: 0,
    },
    {
      id: 'm2',
      prompt: 'Anatomy is closest to which campus corner?',
      choices: ['Shuttle Park', 'College of Medicine side', 'Cattle Market', 'Law faculty'],
      answerIndex: 1,
    },
    {
      id: 'm3',
      prompt: 'Before clinicals, you still need…',
      choices: ['A keke licence', 'Paid fees + registration', 'Convocation gown', 'Hostel deed'],
      answerIndex: 1,
    },
  ],
  science: [
    {
      id: 's1',
      prompt: 'Physical Science covers…',
      choices: ['Only Law', 'Physics, chem, maths vibe', 'Only agriculture', 'Only mass comm'],
      answerIndex: 1,
    },
    {
      id: 's2',
      prompt: 'Lab coats are for…',
      choices: ['Fashion week', 'Safe lab work', 'Rent payment', 'Keke park'],
      answerIndex: 1,
    },
  ],
  arts: [
    {
      id: 'a1',
      prompt: 'Mass Comm students live for…',
      choices: ['Silent libraries only', 'Stories, mics, and news', 'Only coding', 'Cattle market'],
      answerIndex: 1,
    },
    {
      id: 'a2',
      prompt: 'Education faculty trains…',
      choices: ['Pilots', 'Teachers', 'Bankers only', 'Landlords'],
      answerIndex: 1,
    },
  ],
}

export function pickQuiz(bankId: string, count: number): QuizQuestion[] {
  const bank = QUIZ_BANKS[bankId] ?? QUIZ_BANKS.general!
  const pool = [...bank, ...QUIZ_BANKS.general!]
  return pool.slice(0, Math.max(3, Math.min(count, pool.length)))
}

export function publicQuiz(questions: QuizQuestion[]) {
  return questions.map(({ id, prompt, choices }) => ({ id, prompt, choices }))
}
