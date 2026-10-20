import type { RentInfo } from './economy-api'
import { currentObjective } from './rules'
import { calendarForDay, PERIOD_CLOCK } from './needs'
import type { GameState, LocationType } from './types'

export type QuestPill = {
  id: string
  kind: 'event' | 'task' | 'daily'
  emoji: string
  title: string
  hint: string
  locationId?: string
  endsIn?: string
  /** Optional action for rent pay from up-next. */
  rentPay?: boolean
}

const CITY_EVENTS = [
  {
    id: 'mama-put',
    emoji: '/emoji/pot-of-food.png',
    title: 'Free food at the Mama Put',
    hint: 'By order of the VC',
    locationId: 'roadside_bukka',
    hours: 2,
    minutes: 16,
  },
  {
    id: 'exam-week',
    emoji: '/emoji/books.png',
    title: 'Exam week',
    hint: 'Study XP x2',
    locationId: 'aau_library',
    hours: 5,
    minutes: 40,
  },
  {
    id: 'sug-vote',
    emoji: '/emoji/ballot-box.png',
    title: 'SUG elections open',
    hint: 'Campus celeb points await',
    locationId: 'aau_campus',
    hours: 1,
    minutes: 5,
  },
] as const

export function cityEventFor(state: GameState): QuestPill {
  const event = CITY_EVENTS[(state.day - 1) % CITY_EVENTS.length]!
  return {
    id: `event-${event.id}`,
    kind: 'event',
    emoji: event.emoji,
    title: `${event.title} · ${event.hint}`,
    hint: `Ends in ${event.hours}h ${event.minutes}m`,
    locationId: event.locationId,
    endsIn: `${event.hours}h ${event.minutes}m`,
  }
}

export function taskPillsFor(state: GameState): QuestPill[] {
  const cal = calendarForDay(state.day)
  const pills: QuestPill[] = []
  const objective = currentObjective(state)

  if (state.academic < 70 || state.period === 'morning') {
    pills.push({
      id: 'task-lecture',
      kind: 'task',
      emoji: '/emoji/school.png',
      title: 'Attend lecture',
      hint: `LT1 at ${PERIOD_CLOCK.morning.time}`,
      locationId: 'admin-block',
    })
  }

  if (cal.rentDay || cal.weekday === 'Fri') {
    pills.push({
      id: 'task-rent',
      kind: 'task',
      emoji: '/emoji/house.png',
      title: 'Pay rent',
      hint: 'Baba Landlord comes Saturday',
      locationId: state.locationId,
    })
  }

  if (objective && !pills.some((pill) => pill.locationId === objective.locationId)) {
    pills.unshift({
      id: `task-${objective.id}`,
      kind: 'task',
      emoji: '/emoji/graduation-cap.png',
      title: objective.label.split(' at ')[0] ?? objective.label,
      hint: objective.label,
      locationId: objective.locationId,
    })
  }

  return pills.slice(0, 2)
}

export function dailyOkadaPill(state: GameState): QuestPill {
  const found = 800 + ((state.day * 137) % 900)
  return {
    id: 'daily-okada',
    kind: 'daily',
    emoji: '/emoji/money-bag.png',
    title: 'Daily Okada Coins',
    hint: `${found.toLocaleString()} found · next prize ₦3,000`,
    locationId: 'keke-park',
  }
}

/** Prefer the most urgent need from server-synced needs. */
export function urgentNeedPill(state: GameState): QuestPill {
  const needs: { id: string; value: number; emoji: string; title: string; locationId: string }[] = [
    { id: 'hunger', value: state.hunger, emoji: '/emoji/pot-of-food.png', title: 'Grab a bite', locationId: 'bukka' },
    { id: 'energy', value: state.energy, emoji: '/emoji/fire.png', title: 'Get some sleep', locationId: 'school-hostels-1' },
    { id: 'hygiene', value: state.hygiene, emoji: '/emoji/bed.png', title: 'Take a shower', locationId: 'school-hostels-1' },
    { id: 'fun', value: state.fun, emoji: '/emoji/party-popper.png', title: 'Hang out', locationId: 'relaxation-centre' },
    { id: 'social', value: state.social, emoji: '/emoji/handshake.png', title: 'See people', locationId: 'students-centre' },
    { id: 'study', value: state.academic, emoji: '/emoji/books.png', title: 'Hit the books', locationId: 'admin-block' },
  ]
  let worst = needs[0]!
  for (const need of needs) {
    if (need.value < worst.value) worst = need
  }
  return {
    id: `urgent-${worst.id}`,
    kind: 'task',
    emoji: worst.emoji,
    title: worst.title,
    hint: worst.title,
    locationId: worst.locationId,
  }
}

/** Max 3 pills: event + up to 2 tasks, or event + 1 task + daily. */
export function questStackFor(state: GameState): QuestPill[] {
  const event = cityEventFor(state)
  const tasks = taskPillsFor(state)
  const daily = dailyOkadaPill(state)
  const stack = [event, ...tasks.slice(0, 1), daily]
  return stack.slice(0, 3)
}

export function rentPill(rent: RentInfo | null | undefined): QuestPill | null {
  if (!rent || rent.status === 'ok') return null
  const amount = `₦${rent.amount.toLocaleString()}`
  const title =
    rent.status === 'evicted'
      ? 'Evicted — pay rent'
      : rent.status === 'late'
        ? 'Rent is waiting'
        : 'Rent due'
  const hint =
    rent.status === 'evicted'
      ? `${amount} · Off-campus Hostels`
      : rent.status === 'late'
        ? `${amount} · a bit late, pay when you can`
        : `${amount} · Baba Landlord`
  return {
    id: 'task-rent-due',
    kind: 'task',
    emoji: '/emoji/house.png',
    title,
    hint,
    rentPay: true,
  }
}

export function jobShiftPill(opts: {
  currentJobId: string | null
  jobPlaceId?: string | null
  locationId: string
}): QuestPill | null {
  if (!opts.currentJobId || !opts.jobPlaceId) return null
  if (opts.locationId === opts.jobPlaceId) {
    return {
      id: 'task-job-shift',
      kind: 'task',
      emoji: '/emoji/money-bag.png',
      title: 'Work your shift',
      hint: 'You are at your job',
      locationId: opts.jobPlaceId,
    }
  }
  return {
    id: 'task-job-go',
    kind: 'task',
    emoji: '/emoji/money-bag.png',
    title: 'Go to work',
    hint: 'Shift is open',
    locationId: opts.jobPlaceId,
  }
}

export function dreamStepPill(state: GameState): QuestPill | null {
  if (!state.dreamId) return null
  return {
    id: 'task-dream',
    kind: 'task',
    emoji: '/emoji/graduation-cap.png',
    title: 'Chase your dream',
    hint: 'Open profile to track progress',
    locationId: 'admin-block',
  }
}

/**
 * Up next priority: rent due > critical need > job shift time > dream step.
 */
export function upNextQueueFor(
  state: GameState,
  extras?: {
    rent?: RentInfo | null
    currentJobId?: string | null
    jobPlaceId?: string | null
  },
): QuestPill[] {
  const queue: QuestPill[] = []
  const rent = rentPill(extras?.rent)
  if (rent) queue.push(rent)

  const urgent = urgentNeedPill(state)
  if (urgent && !queue.some((pill) => pill.id === urgent.id)) queue.push(urgent)

  const job = jobShiftPill({
    currentJobId: extras?.currentJobId ?? null,
    jobPlaceId: extras?.jobPlaceId,
    locationId: state.locationId,
  })
  if (job) queue.push(job)

  const dream = dreamStepPill(state)
  if (dream) queue.push(dream)

  for (const pill of taskPillsFor(state)) {
    if (!queue.some((existing) => existing.id === pill.id)) queue.push(pill)
  }

  if (queue.length > 0) return queue

  const objective = currentObjective(state)
  if (objective) {
    return [
      {
        id: `task-${objective.id}`,
        kind: 'task',
        emoji: '/emoji/graduation-cap.png',
        title: objective.label.split(' at ')[0] ?? objective.label,
        hint: objective.label,
        locationId: objective.locationId,
      },
    ]
  }
  return [
    {
      id: 'task-explore',
      kind: 'task',
      emoji: '/emoji/school.png',
      title: 'Explore campus',
      hint: 'Tap a place on the map',
      locationId: 'admin-block',
    },
  ]
}

/** Bell sheet: city event + daily + tasks. */
export function todayInEkpomaFor(
  state: GameState,
  extras?: {
    rent?: RentInfo | null
    currentJobId?: string | null
    jobPlaceId?: string | null
  },
): QuestPill[] {
  return [cityEventFor(state), dailyOkadaPill(state), ...upNextQueueFor(state, extras)]
}

export function todayBellCount(
  state: GameState,
  extras?: {
    rent?: RentInfo | null
    currentJobId?: string | null
    jobPlaceId?: string | null
  },
) {
  return 1 + 1 + upNextQueueFor(state, extras).length
}

/** Deterministic NEPA outage windows for a day/period. */
export function isNepaOutage(state: GameState) {
  const seed = state.day * 17 + PERIOD_CLOCK[state.period].hour
  return seed % 5 === 0 && (state.period === 'evening' || state.period === 'night')
}

export type ContextAction = {
  id: string
  label: string
  emoji: string
  locationId?: string
  action?: 'shop' | 'phone' | 'rest' | 'outside'
}

export function contextActionFor(state: GameState, locationType?: LocationType): ContextAction {
  if (state.period === 'night' || state.period === 'evening') {
    return { id: 'sleep', label: 'Sleep', emoji: '🛏️', action: 'rest' }
  }
  switch (locationType) {
    case 'hostel':
      return { id: 'outside', label: 'Go outside', emoji: '🚪', action: 'outside', locationId: 'admin-block' }
    case 'transport':
      return { id: 'okada', label: 'Take okada', emoji: '🛵', locationId: 'keke-park' }
    case 'campus':
      return { id: 'class', label: 'Enter class', emoji: '🏫', locationId: 'admin-block' }
    case 'food':
      return { id: 'eat', label: 'Order food', emoji: '🍲', locationId: 'bukka' }
    case 'shop':
      return { id: 'shop', label: 'Browse shop', emoji: '🛍️', action: 'shop', locationId: 'town-shop-1' }
    default:
      return { id: 'outside', label: 'Go outside', emoji: '🚪', action: 'outside', locationId: 'admin-block' }
  }
}
