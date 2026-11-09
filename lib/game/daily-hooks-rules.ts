/*
 * Pure rules for the login streak and the story moments. Days are game days (Africa/Lagos midnight).
 * The same file lives in lib/game and backend/src/game: keep the two identical.
 */

/** ₦ for day 1…7 of the streak cycle; day 7 is the gift. */
export const STREAK_REWARDS = [5_000, 7_000, 10_000, 12_000, 15_000, 20_000, 50_000] as const

export function rewardForStreak(streak: number): number {
  return STREAK_REWARDS[(Math.max(1, streak) - 1) % STREAK_REWARDS.length]!
}

/** Position 1–7 inside the cycle. */
export const cycleDay = (streak: number) => ((Math.max(1, streak) - 1) % 7) + 1

/** Next streak after checking in on `today`. null = already checked in today. */
export function nextStreak(last: { day: number; streak: number }, today: number): number | null {
  if (last.day === today) return null
  if (last.day === today - 1) return last.streak + 1
  return 1
}

export type StoryEffects = { cash?: number; energy?: number; reputation?: number; fun?: number; social?: number }
export type StoryChoice = { label: string; outcome: string; effects: StoryEffects }
export type StoryEvent = { id: string; emoji: string; title: string; text: string; place: string; choices: [StoryChoice, StoryChoice] }

export const STORY_EVENTS: StoryEvent[] = [
  {
    id: 'lecturer-sleeping', emoji: '😴', title: 'Caught napping', place: 'Mass Comm lecture hall',
    text: 'You were nodding off in the back row. The lecturer stops mid-sentence and looks right at you.',
    choices: [
      { label: 'Apologise and stand up', outcome: 'The lecturer nods. "Good. Sit and take notes."', effects: { reputation: 2, energy: -3 } },
      { label: 'Pretend you were praying', outcome: 'The whole hall laughs. You stay awake, but everyone is watching.', effects: { reputation: -2, fun: 4 } },
    ],
  },
  {
    id: 'nepa-light', emoji: '🔌', title: 'NEPA took light', place: 'Your hostel',
    text: 'Your assignment is due tomorrow and the light just went. Laptop is at 9%.',
    choices: [
      { label: 'Pay ₦1,500 to charge at a shop', outcome: 'Done on time. The shop owner even gives you a seat.', effects: { cash: -1_500, energy: -2 } },
      { label: 'Write it by hand by candle light', outcome: 'Slow and tiring, but it is finished and free.', effects: { energy: -10, reputation: 1 } },
    ],
  },
  {
    id: 'borrow-money', emoji: '💸', title: 'Coursemate needs help', place: 'Outside the faculty',
    text: 'A coursemate asks to borrow ₦3,000 for transport home. "I will pay you back on Friday."',
    choices: [
      { label: 'Lend the ₦3,000', outcome: 'They are grateful. Your name is mentioned well around the faculty.', effects: { cash: -3_000, reputation: 4 } },
      { label: 'Say you are broke too', outcome: 'You keep your money. They look away.', effects: { reputation: -2 } },
    ],
  },
  {
    id: 'found-note', emoji: '💵', title: 'Money on the ground', place: 'AAU gate',
    text: 'A ₦2,000 note is lying near the gate. Nobody seems to be looking for it.',
    choices: [
      { label: 'Ask around for the owner', outcome: 'A trader claims it and thanks you with a small gift.', effects: { cash: 500, reputation: 3 } },
      { label: 'Pocket it', outcome: 'Quick ₦2,000, but you keep thinking about it.', effects: { cash: 2_000, reputation: -1 } },
    ],
  },
  {
    id: 'buka-queue', emoji: '🍛', title: 'Long buka queue', place: 'The buka',
    text: 'Rice and stew is almost finished and the queue is long. A friend at the front waves you over.',
    choices: [
      { label: 'Join your friend at the front', outcome: 'You eat quickly, but the queue grumbles.', effects: { energy: 6, reputation: -2 } },
      { label: 'Go to the back and wait', outcome: 'You wait a while, then enjoy the last plate.', effects: { energy: 4, reputation: 1, fun: 2 } },
    ],
  },
  {
    id: 'group-project', emoji: '📚', title: 'Group project drama', place: 'Faculty corridor',
    text: 'Your group has one lazy member who has done nothing. Submission is tomorrow.',
    choices: [
      { label: 'Do their part quietly', outcome: 'You finish late into the night. The group thanks you.', effects: { energy: -12, reputation: 4 } },
      { label: 'Call them out in the group chat', outcome: 'They start working, but the mood is tense.', effects: { reputation: -1, energy: -3, fun: -2 } },
    ],
  },
  {
    id: 'keke-fare', emoji: '🛺', title: 'Keke fare quarrel', place: 'Keke park',
    text: 'The keke driver wants ₦500 for a short trip. The normal fare is ₦200.',
    choices: [
      { label: 'Bargain politely', outcome: 'You settle at ₦250 and he even smiles.', effects: { cash: -250, reputation: 1 } },
      { label: 'Walk instead', outcome: 'Free, but the sun is hot and you arrive tired.', effects: { energy: -8 } },
    ],
  },
  {
    id: 'choir-voice', emoji: '⛪', title: 'Choir needs a voice', place: 'Church near campus',
    text: 'A choir leader notices you singing along and asks you to join the rehearsal.',
    choices: [
      { label: 'Join the rehearsal', outcome: 'You sing for an hour and feel lighter.', effects: { fun: 8, energy: -4, reputation: 2 } },
      { label: 'Politely decline', outcome: 'They say the door is always open.', effects: {} },
    ],
  },
  {
    id: 'cbt-rumour', emoji: '🖥️', title: 'CBT rumour', place: 'ICT centre',
    text: "Someone whispers that tomorrow's CBT will cover only the last two chapters.",
    choices: [
      { label: 'Revise everything anyway', outcome: 'Tiring evening, but you feel ready.', effects: { energy: -8, reputation: 1 } },
      { label: 'Trust the rumour', outcome: 'You rest well and hope it is true.', effects: { energy: 5, reputation: -1 } },
    ],
  },
  {
    id: 'fresher-lost', emoji: '🧭', title: 'Lost fresher', place: 'Admin Block',
    text: 'A fresher with a folder of papers asks where to submit clearance.',
    choices: [
      { label: 'Walk them to the right office', outcome: 'You lose some time but gain a new friend.', effects: { energy: -3, reputation: 3, social: 6 } },
      { label: 'Point and keep walking', outcome: 'They find it eventually.', effects: {} },
    ],
  },
  {
    id: 'sports-invite', emoji: '⚽', title: 'Short of one player', place: 'Sports complex',
    text: 'A five-a-side game needs one more player. Kickoff is now.',
    choices: [
      { label: 'Play the match', outcome: 'Your team wins. Sweaty and happy.', effects: { fun: 10, energy: -10, reputation: 2 } },
      { label: 'Cheer from the side', outcome: 'You enjoy the game from the bench.', effects: { fun: 3, energy: 2 } },
    ],
  },
  {
    id: 'handout-sale', emoji: '🖨️', title: 'Handout shop discount', place: 'Campus shop',
    text: "The shop is selling this semester's handouts at ₦2,500 instead of ₦4,000 for the next hour.",
    choices: [
      { label: 'Buy the handouts', outcome: 'A good deal. You feel prepared.', effects: { cash: -2_500, reputation: 1, energy: 2 } },
      { label: 'Borrow from a coursemate', outcome: 'Free, but you owe a favour.', effects: { social: 4 } },
    ],
  },
]

/** Lectures, lecturers, coursemates, exams, handouts: only for players who are students. */
export const SCHOOL_STORY_IDS = new Set(['lecturer-sleeping', 'nepa-light', 'borrow-money', 'group-project', 'cbt-rumour', 'fresher-lost', 'handout-sale'])

export const STORY_BY_ID = new Map(STORY_EVENTS.map((e) => [e.id, e]))
export const MAX_STORIES_PER_DAY = 2

/** Pick an event this player has not seen recently (cycles once all are seen). `seen` is oldest → newest. */
export function pickStory(rand: number, seen: string[], student = true): StoryEvent {
  // Non-students only get life and street moments
  const all = student ? STORY_EVENTS : STORY_EVENTS.filter((e) => !SCHOOL_STORY_IDS.has(e.id))
  let pool = all.filter((e) => !seen.includes(e.id))
  if (!pool.length) pool = all.filter((e) => e.id !== seen[seen.length - 1])
  return pool[Math.floor(rand * pool.length) % pool.length]!
}

/** Should a new story pop up now? At most 2 a day, at least 3 hours apart, and only sometimes. */
export function shouldOfferStory(opts: { shownToday: number; lastShownAt: number | null; now: number; roll: number }): boolean {
  if (opts.shownToday >= MAX_STORIES_PER_DAY) return false
  if (opts.lastShownAt && opts.now - opts.lastShownAt < 3 * 3600_000) return false
  return opts.roll < 0.5
}
