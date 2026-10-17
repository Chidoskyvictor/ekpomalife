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

  if (state.hunger < 55) {
    pills.push({
      id: 'task-eat',
      kind: 'task',
      emoji: '/emoji/pot-of-food.png',
      title: 'Eat something',
      hint: 'Tap the cooler or stove',
      locationId: 'bukka',
    })
  }

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
    { id: 'hunger', value: state.hunger, emoji: '/emoji/pot-of-food.png', title: 'Eat something', locationId: 'bukka' },
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

/** Swipeable up-next queue (tasks only). */
export function upNextQueueFor(state: GameState): QuestPill[] {
  const urgent = urgentNeedPill(state)
  const tasks = [urgent, ...taskPillsFor(state).filter((pill) => pill.id !== urgent.id)]
  if (tasks.length > 0) return tasks
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
      locationId: 'aau_campus',
    },
  ]
}

/** Bell sheet: city event + daily + tasks. */
export function todayInEkpomaFor(state: GameState): QuestPill[] {
  return [cityEventFor(state), dailyOkadaPill(state), ...upNextQueueFor(state)]
}

export function todayBellCount(state: GameState) {
  return 1 + 1 + upNextQueueFor(state).length
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
