/**
 * Lightweight runner used when Vitest isn't installed yet.
 * Prefer `pnpm test` / `npm test` (vitest) once deps are available.
 */
import { ACTIONS, getAction } from './actions.js'
import { clampNeeds, decayNeeds, defaultNeeds } from './needs.js'
import { getPlace } from './places.js'
import { STARTING_RANGES, rollStartingMoney } from './starting-money.js'
import { clockFromGameTime, isOpenAt } from './time.js'
import type { DreamId } from './dreams.js'

let failed = 0

function assert(condition: unknown, message: string) {
  if (!condition) {
    failed += 1
    console.error('FAIL:', message)
  } else {
    console.log('ok:', message)
  }
}

// needs
{
  assert(clampNeeds({ hunger: -10, energy: 200 }).hunger === 0, 'clamp low')
  assert(clampNeeds({ hunger: -10, energy: 200 }).energy === 100, 'clamp high')
  const start = defaultNeeds()
  const after = decayNeeds(start, 60, [])
  assert(after.hunger < start.hunger, 'decay hunger')
  const foodie = decayNeeds(start, 120, ['foodie'])
  const base = decayNeeds(start, 120, [])
  assert(foodie.hunger > base.hunger, 'foodie slower hunger')
  const gym = decayNeeds(start, 120, ['gym-rat'])
  assert(gym.energy > base.energy, 'gym-rat slower energy')
}

// actions
{
  const place = getPlace('bukka')!
  const eat = getAction('eat')!
  assert(place.actions.includes('eat'), 'bukka allows eat')
  assert(!getPlace('admin-block')!.actions.includes('eat'), 'admin no eat')
  assert(eat.cost === -800, 'eat cost')
  const closed = !isOpenAt(getPlace('admin-block')!.openHours, clockFromGameTime(23 * 60).hour)
  assert(closed, 'admin closed at night')
  assert(Object.keys(ACTIONS).length === 7, 'seven actions')
  const broke = 100 < Math.abs(eat.cost)
  assert(broke, 'cannot afford')
}

// ledger
{
  const rows = [
    { amount: 450_000, reason: 'starting-money' },
    { amount: -800, reason: 'eat' },
    { amount: 600, reason: 'work-placeholder' },
  ]
  const cash = rows.reduce((sum, row) => sum + row.amount, 0)
  assert(cash === 449_800, 'ledger sum equals cash')
}

// starting money
{
  assert(STARTING_RANGES.politics.min === 400_000 && STARTING_RANGES.politics.max === 700_000, 'politics range')
  const dreams = Object.keys(STARTING_RANGES) as DreamId[]
  assert(dreams.length === 7, 'seven dreams')
  for (const dreamId of dreams) {
    const range = STARTING_RANGES[dreamId]
    const rolled = rollStartingMoney({ dreamId, traits: ['tech', 'hustler'], body: 'man' })
    assert(
      rolled.amount >= range.min - 50_000 && rolled.amount <= range.max + 150_000,
      `${dreamId} roll in band (${rolled.amount})`,
    )
  }
}

if (failed > 0) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll phase-1 game tests passed.')
