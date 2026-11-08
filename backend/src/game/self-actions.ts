import type { Needs } from './needs.js'
import type { SkillId } from './skills.js'

/*
 * Things your character can do on their own at home (tap yourself → "What should they do?").
 * Reuses the normal home-action pipeline (needs, cash, ledger, skills) in performGameAction;
 * each one also has a server-side cooldown so it can't be farmed for XP or money.
 * The client mirrors the display side in lib/game/self-actions.ts.
 */

export type SelfActionDef = {
  label: string
  hint: string
  /** Cash delta (positive = earns). */
  cost: number
  /** In-game minutes (display only: the clock is real time). */
  duration: number
  needEffects: Partial<Needs>
  skills: { skill: SkillId; xp: number }[]
  cooldownSec: number
}

const QUICK = 90
const WORKOUT = 180
const MONEY = 20 * 60

export const SELF_ACTIONS = {
  'read-notes': { label: 'Read lecture notes', hint: 'Go over today’s handout.', cost: 0, duration: 45, needEffects: { study: 12, energy: -4 }, skills: [{ skill: 'academics', xp: 5 }], cooldownSec: QUICK },
  'quiz-practice': { label: 'Millionaire quiz practice', hint: 'Who wants to be a millionaire? You do.', cost: 0, duration: 30, needEffects: { study: 8, fun: 6 }, skills: [{ skill: 'academics', xp: 4 }], cooldownSec: QUICK },
  'learn-code': { label: 'Learn to code', hint: 'A YouTube tutorial on your phone.', cost: 0, duration: 45, needEffects: { study: 8, energy: -5 }, skills: [{ skill: 'tech', xp: 5 }], cooldownSec: QUICK },
  'gist-phone': { label: 'Gist with your guy', hint: 'Long call, plenty gist.', cost: 0, duration: 30, needEffects: { social: 14, fun: 4 }, skills: [{ skill: 'charisma', xp: 3 }], cooldownSec: QUICK },
  'call-mother': { label: 'Call your mother', hint: '“Have you eaten?”', cost: 0, duration: 20, needEffects: { social: 16, fun: 4 }, skills: [], cooldownSec: QUICK },
  'tiktok-skit': { label: 'Make TikTok skit', hint: 'Ring light, two takes, post.', cost: 0, duration: 30, needEffects: { fun: 14, social: 4 }, skills: [{ skill: 'comedy', xp: 5 }], cooldownSec: QUICK },
  'stand-up': { label: 'Practise stand-up', hint: 'Test your jokes on the mirror.', cost: 0, duration: 30, needEffects: { fun: 8, energy: -3 }, skills: [{ skill: 'comedy', xp: 5 }], cooldownSec: QUICK },
  'sing-afrobeats': { label: 'Sing Afrobeats', hint: 'Hit the high note, abeg.', cost: 0, duration: 25, needEffects: { fun: 12 }, skills: [{ skill: 'music', xp: 5 }], cooldownSec: QUICK },
  'practise-dance': { label: 'Practise dance', hint: 'Shoki, Gwara Gwara, repeat.', cost: 0, duration: 30, needEffects: { fun: 10, energy: -8 }, skills: [{ skill: 'dance', xp: 5 }], cooldownSec: WORKOUT },
  'press-ups': { label: 'Do press-ups', hint: 'Ten more. Ten more.', cost: 0, duration: 20, needEffects: { fun: 3, energy: -8 }, skills: [{ skill: 'fitness', xp: 5 }], cooldownSec: WORKOUT },
  stretch: { label: 'Stretch it out', hint: 'Loosen the back after lectures.', cost: 0, duration: 15, needEffects: { energy: 6, fun: 4 }, skills: [{ skill: 'fitness', xp: 2 }], cooldownSec: QUICK },
  pray: { label: 'Pray / quiet time', hint: 'A calm minute to yourself.', cost: 0, duration: 15, needEffects: { fun: 8, energy: 4 }, skills: [], cooldownSec: QUICK },
  daydream: { label: 'Daydream about graduating', hint: 'First class, gown, family cheering.', cost: 0, duration: 15, needEffects: { fun: 10, energy: 2 }, skills: [], cooldownSec: QUICK },
  'plan-hustle': { label: 'Plan your hustle', hint: 'Prices, customers, profit.', cost: 0, duration: 30, needEffects: { fun: 2, energy: -2 }, skills: [{ skill: 'hustle', xp: 4 }], cooldownSec: QUICK },
  'sell-airtime': { label: 'Sell data on WhatsApp', hint: 'Status posted. Customers dey come.', cost: 250, duration: 45, needEffects: { social: 4, energy: -4 }, skills: [{ skill: 'hustle', xp: 5 }], cooldownSec: MONEY },
} as const satisfies Record<string, SelfActionDef>

export type SelfActionId = keyof typeof SELF_ACTIONS

/** "2m" style wait text. */
export function waitText(sec: number): string {
  if (sec < 60) return `${Math.max(1, Math.ceil(sec))}s`
  return `${Math.ceil(sec / 60)}m`
}

/** Seconds left on a cooldown (0 = ready). */
export function cooldownLeft(lastAt: Date | string | null | undefined, cooldownSec: number, now = new Date()): number {
  if (!lastAt) return 0
  const last = lastAt instanceof Date ? lastAt : new Date(lastAt)
  return Math.max(0, Math.ceil(cooldownSec - (now.getTime() - last.getTime()) / 1000))
}

const NEED_LABEL: Record<string, string> = { hunger: 'Food', energy: 'Energy', hygiene: 'Hygiene', fun: 'Fun', social: 'Social', study: 'Study' }
const SKILL_NAME: Record<string, string> = { academics: 'Academics', charisma: 'Charisma', hustle: 'Hustle', fitness: 'Fitness', cooking: 'Cooking', tech: 'Tech', dance: 'Dance', music: 'Music', comedy: 'Comedy' }

/** "+Fun +Music −Energy", the line shown in the result notice. */
export function gainText(def: SelfActionDef): string {
  const parts: string[] = []
  for (const [need, v] of Object.entries(def.needEffects)) if (typeof v === 'number' && v !== 0) parts.push(`${v > 0 ? '+' : '−'}${NEED_LABEL[need] ?? need}`)
  for (const s of def.skills) parts.push(`+${SKILL_NAME[s.skill] ?? s.skill}`)
  return parts.join(' ')
}
