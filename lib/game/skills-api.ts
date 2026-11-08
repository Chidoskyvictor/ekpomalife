import { apiGet } from '@/lib/api/client'

/* Mirrors backend/src/game/skills.ts */
export type SkillId = 'academics' | 'charisma' | 'hustle' | 'fitness' | 'cooking' | 'tech' | 'dance' | 'music' | 'comedy'
export type SkillView = { id: SkillId; label: string; level: number; xp: number; next: number | null; floor: number }

export const fetchSkills = () => apiGet<{ ok: true; skills: SkillView[] }>('/skills')

/** Icon and how to train each skill (shown under its bar). */
export const SKILL_INFO: Record<SkillId, { emoji: string; how: string }> = {
  academics: { emoji: '📚', how: 'Attend lectures and tutorials, study, write exams.' },
  charisma: { emoji: '🗣️', how: 'Hang out and gist with people, host Spaces, give talks.' },
  hustle: { emoji: '💼', how: 'Work shifts: POS, errands, keke.' },
  fitness: { emoji: '💪', how: 'Train at the Sports Complex, play ball at Play and Chill.' },
  cooking: { emoji: '🍲', how: 'Cook at home, work at Mama Amina Bukka.' },
  tech: { emoji: '💻', how: 'Innovation Hub and ICT, cyber café shifts.' },
  dance: { emoji: '💃', how: 'Party at Sazza, Forbes and the clubs, or practise at home.' },
  music: { emoji: '🎤', how: 'Tap yourself at home and sing Afrobeats.' },
  comedy: { emoji: '😂', how: 'Tap yourself at home: make skits, practise stand-up.' },
}
