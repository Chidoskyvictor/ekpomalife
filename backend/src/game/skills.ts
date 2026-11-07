import type { PoolClient } from 'pg'
import { pool } from '../db.js'

/*
 * Skills: levels 0–10 earned by doing things (XP), checked on the server before locked actions
 * and jobs. Everyone starts at 0; your character type only speeds some skills up. No rust.
 * Music, Comedy, Photography and Preaching come later, once they have places to earn them.
 */

export const SKILL_IDS = ['academics', 'charisma', 'hustle', 'fitness', 'cooking', 'tech', 'dance'] as const
export type SkillId = (typeof SKILL_IDS)[number]

export const SKILL_LABEL: Record<SkillId, string> = {
  academics: 'Academics',
  charisma: 'Charisma',
  hustle: 'Hustle',
  fitness: 'Fitness',
  cooking: 'Cooking',
  tech: 'Tech',
  dance: 'Dance',
}

export const MAX_LEVEL = 10

/** Total XP to reach each level: level n needs 10 × n(n+1)/2 (10, 30, 60 … 550 for level 10). */
export function xpForLevel(level: number): number {
  return (10 * level * (level + 1)) / 2
}

export function levelForXp(xp: number): number {
  let level = 0
  while (level < MAX_LEVEL && xp >= xpForLevel(level + 1)) level++
  return level
}

/** Your character type learns some skills faster (it never starts you higher: everyone begins at 0). */
const TYPE_BONUS: Record<string, Partial<Record<SkillId, number>>> = {
  student: { academics: 1.25 },
  lecturer: { academics: 1.5, charisma: 1.2 },
  graduate: { academics: 1.15, charisma: 1.15 },
  indigene: { hustle: 1.2, charisma: 1.15 },
  casual: { hustle: 1.25, fitness: 1.15 },
}

export const isSkill = (s: unknown): s is SkillId => typeof s === 'string' && (SKILL_IDS as readonly string[]).includes(s)

export type SkillView = { id: SkillId; label: string; level: number; xp: number; next: number | null; floor: number }

export function viewSkills(rows: { skill: string; xp: number }[]): SkillView[] {
  const xp = new Map(rows.map((r) => [r.skill, r.xp]))
  return SKILL_IDS.map((id) => {
    const total = xp.get(id) ?? 0
    const level = levelForXp(total)
    return { id, label: SKILL_LABEL[id], level, xp: total, floor: xpForLevel(level), next: level >= MAX_LEVEL ? null : xpForLevel(level + 1) }
  })
}

export async function getSkills(characterId: string, db: Pick<PoolClient, 'query'> = pool): Promise<SkillView[]> {
  const rows = await db.query<{ skill: string; xp: number }>(`SELECT skill, xp FROM character_skills WHERE character_id = $1`, [characterId])
  return viewSkills(rows.rows)
}

export async function skillLevel(db: Pick<PoolClient, 'query'>, characterId: string, skill: SkillId): Promise<number> {
  const row = await db.query<{ xp: number }>(`SELECT xp FROM character_skills WHERE character_id = $1 AND skill = $2`, [characterId, skill])
  return levelForXp(row.rows[0]?.xp ?? 0)
}

/** "Needs Charisma 3" when you're under, else null. */
export async function skillGate(db: Pick<PoolClient, 'query'>, characterId: string, skill: SkillId, level: number): Promise<string | null> {
  if (level <= 0) return null
  const have = await skillLevel(db, characterId, skill)
  return have >= level ? null : `Needs ${SKILL_LABEL[skill]} ${level} (you're ${have}).`
}

/**
 * Add XP for doing something (inside the caller's transaction). Returns a line like
 * "💪 Fitness level 3!" when it crosses a level, so the caller can add it to its message.
 */
export async function awardSkill(
  db: Pick<PoolClient, 'query'>,
  characterId: string,
  skill: SkillId,
  baseXp: number,
  characterType?: string | null,
): Promise<string | null> {
  const gain = Math.max(1, Math.round(baseXp * (TYPE_BONUS[characterType ?? '']?.[skill] ?? 1)))
  const row = await db.query<{ xp: number }>(
    `INSERT INTO character_skills (character_id, skill, xp) VALUES ($1, $2, $3)
     ON CONFLICT (character_id, skill) DO UPDATE SET xp = LEAST(character_skills.xp + EXCLUDED.xp, $4), updated_at = NOW()
     RETURNING xp`,
    [characterId, skill, gain, xpForLevel(MAX_LEVEL)],
  )
  const after = row.rows[0]?.xp ?? gain
  const before = levelForXp(Math.max(0, after - gain))
  const now = levelForXp(after)
  return now > before ? `⭐ ${SKILL_LABEL[skill]} is now level ${now}!` : null
}

/** Which skill a basic action trains, and where (a hangout at the pitch is fitness, at a club it's dance). */
export function skillForAction(actionId: string, placeId: string | null | undefined): { skill: SkillId; xp: number } | null {
  if (actionId === 'study') return { skill: 'academics', xp: 6 }
  if (actionId === 'cook') return { skill: 'cooking', xp: 6 }
  if (actionId === 'hangout') {
    if (placeId === 'sports-complex' || placeId === 'playchill-climax') return { skill: 'fitness', xp: 6 }
    if (placeId === 'sazza' || placeId === 'forbes' || placeId === 'anonymous-zone' || placeId === 'denco') return { skill: 'dance', xp: 6 }
    if (placeId === 'innovation-hub' || placeId === 'ict-exams') return { skill: 'tech', xp: 5 }
    return { skill: 'charisma', xp: 5 }
  }
  return null
}

/** The skill a job's shifts train. */
export function skillForJob(jobId: string): SkillId {
  if (jobId === 'mama-put-helper') return 'cooking'
  if (jobId === 'cyber-cafe') return 'tech'
  if (jobId === 'tutor') return 'academics'
  return 'hustle'
}
