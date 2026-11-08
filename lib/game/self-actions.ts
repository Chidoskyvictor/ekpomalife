/*
 * "What should they do?": things your character can do on their own at home (tap yourself).
 * Display side only: the server (backend/src/game/self-actions.ts) owns needs, money, skill XP
 * and the cooldowns. Keep ids, costs and cooldowns in step with it.
 */

export type SelfActionId =
  | 'read-notes'
  | 'quiz-practice'
  | 'learn-code'
  | 'gist-phone'
  | 'call-mother'
  | 'tiktok-skit'
  | 'stand-up'
  | 'sing-afrobeats'
  | 'practise-dance'
  | 'press-ups'
  | 'stretch'
  | 'pray'
  | 'daydream'
  | 'plan-hustle'
  | 'sell-airtime'

export type Gain = { text: string; kind: 'need' | 'skill' | 'cost' }

export type SelfAction = {
  id: SelfActionId
  emoji: string
  title: string
  /** Real seconds it runs. */
  seconds: number
  /** Naira earned (server-side), 0 = free. */
  earns: number
  gains: Gain[]
  /** Seconds before the server lets you do it again. */
  cooldownSec: number
  /** Pose the character holds while it runs. */
  pose?: 'dance'
}

const n = (text: string): Gain => ({ text: `+${text}`, kind: 'need' })
const lose = (text: string): Gain => ({ text: `−${text}`, kind: 'cost' })
const s = (text: string): Gain => ({ text: `+${text}`, kind: 'skill' })

const QUICK = 90
const WORKOUT = 180
const MONEY = 20 * 60

export const SELF_ACTIONS: SelfAction[] = [
  { id: 'read-notes', emoji: '📖', title: 'Read lecture notes', seconds: 8, earns: 0, gains: [n('Study'), s('Academics'), lose('Energy')], cooldownSec: QUICK },
  { id: 'quiz-practice', emoji: '🧠', title: 'Millionaire quiz practice', seconds: 8, earns: 0, gains: [n('Study'), n('Fun'), s('Academics')], cooldownSec: QUICK },
  { id: 'learn-code', emoji: '💻', title: 'Learn to code', seconds: 8, earns: 0, gains: [n('Study'), s('Tech'), lose('Energy')], cooldownSec: QUICK },
  { id: 'gist-phone', emoji: '📱', title: 'Gist with your guy', seconds: 6, earns: 0, gains: [n('Social'), n('Fun'), s('Charisma')], cooldownSec: QUICK },
  { id: 'call-mother', emoji: '📞', title: 'Call your mother', seconds: 7, earns: 0, gains: [n('Social'), n('Fun')], cooldownSec: QUICK },
  { id: 'tiktok-skit', emoji: '🎬', title: 'Make TikTok skit', seconds: 8, earns: 0, gains: [n('Fun'), n('Social'), s('Comedy')], cooldownSec: QUICK, pose: 'dance' },
  { id: 'stand-up', emoji: '😂', title: 'Practise stand-up', seconds: 7, earns: 0, gains: [n('Fun'), s('Comedy'), lose('Energy')], cooldownSec: QUICK },
  { id: 'sing-afrobeats', emoji: '🎤', title: 'Sing Afrobeats', seconds: 7, earns: 0, gains: [n('Fun'), s('Music')], cooldownSec: QUICK, pose: 'dance' },
  { id: 'practise-dance', emoji: '💃🏾', title: 'Practise dance', seconds: 8, earns: 0, gains: [n('Fun'), s('Dance'), lose('Energy')], cooldownSec: WORKOUT, pose: 'dance' },
  { id: 'press-ups', emoji: '💪', title: 'Do press-ups', seconds: 6, earns: 0, gains: [s('Fitness'), n('Fun'), lose('Energy')], cooldownSec: WORKOUT },
  { id: 'stretch', emoji: '🧘🏾', title: 'Stretch it out', seconds: 6, earns: 0, gains: [n('Energy'), n('Fun'), s('Fitness')], cooldownSec: QUICK },
  { id: 'pray', emoji: '🙏🏾', title: 'Pray / quiet time', seconds: 6, earns: 0, gains: [n('Fun'), n('Energy')], cooldownSec: QUICK },
  { id: 'daydream', emoji: '🎓', title: 'Daydream about graduating', seconds: 6, earns: 0, gains: [n('Fun'), n('Energy')], cooldownSec: QUICK },
  { id: 'plan-hustle', emoji: '📝', title: 'Plan your hustle', seconds: 7, earns: 0, gains: [s('Hustle'), n('Fun')], cooldownSec: QUICK },
  { id: 'sell-airtime', emoji: '💸', title: 'Sell data on WhatsApp', seconds: 8, earns: 250, gains: [s('Hustle'), n('Social'), lose('Energy')], cooldownSec: MONEY },
]

export const SELF_ACTION_IDS = SELF_ACTIONS.map((a) => a.id)

// When each one was last done (this session): greys the card while the server cooldown runs.
const doneAt = new Map<string, number>()
export const markSelfDone = (id: string) => void doneAt.set(id, Date.now())
export function selfCooldownLeft(action: SelfAction, now = Date.now()): number {
  const at = doneAt.get(action.id)
  return at ? Math.max(0, Math.ceil(action.cooldownSec - (now - at) / 1000)) : 0
}
export const waitLabel = (sec: number) => (sec < 60 ? `${sec}s` : `${Math.ceil(sec / 60)}m`)
