/**
 * In-process economy mock for Vitest / offline dev.
 * Enabled only when NEXT_PUBLIC_USE_MOCKS=true (or legacy USE_ECONOMY_MOCK=1).
 */
import type {
  Hustle,
  InventoryItem,
  Job,
  JobLevel,
  LedgerEntry,
  RentInfo,
  ShopItem,
} from './economy-api'
import type { ServerGameState } from './game-api'
import { defaultNeeds } from './needs-defaults'

const LEVELS: JobLevel[] = [
  { level: 1, title: 'Rookie', payBonus: 0 },
  { level: 2, title: 'Regular', payBonus: 0.1 },
  { level: 3, title: 'Senior', payBonus: 0.2 },
]

const JOBS: Job[] = [
  {
    id: 'campus-errand',
    title: 'Campus errand',
    placeId: 'admin-block',
    payPerShift: 500,
    shiftMinutes: 30,
    needsCost: { energy: 10 },
    requirements: {},
    levels: LEVELS,
  },
  {
    id: 'pos-agent',
    title: 'POS agent',
    placeId: 'town-shop-1',
    payPerShift: 700,
    shiftMinutes: 60,
    needsCost: { energy: 15 },
    requirements: { level: 1 },
    levels: LEVELS,
  },
  {
    id: 'mama-put-helper',
    title: 'Food stall helper',
    placeId: 'bukka',
    payPerShift: 600,
    shiftMinutes: 45,
    needsCost: { energy: 12, hygiene: 5 },
    requirements: {},
    levels: LEVELS,
  },
  {
    id: 'keke-rider',
    title: 'Keke rider',
    placeId: 'keke-park',
    payPerShift: 1200,
    shiftMinutes: 60,
    needsCost: { energy: 20 },
    requirements: { item: 'keke-licence' },
    levels: LEVELS,
    locked: true,
    lockReason: 'You need a keke licence',
  },
  {
    id: 'cyber-cafe',
    title: 'Cyber café typist',
    placeId: 'ict-exams',
    payPerShift: 900,
    shiftMinutes: 60,
    needsCost: { energy: 12 },
    requirements: { trait: 'tech' },
    levels: LEVELS,
  },
  {
    id: 'tutor',
    title: 'Night tutor',
    placeId: 'admin-block',
    payPerShift: 1000,
    shiftMinutes: 90,
    needsCost: { energy: 18, study: -10 },
    requirements: { skill: 'study', level: 70 },
    levels: LEVELS,
    locked: true,
    lockReason: 'Study need must be 70+',
  },
]

const SHOP: Record<string, ShopItem[]> = {
  'town-shop-1': [
    {
      id: 'gala-fanta',
      name: 'Gala & Fanta',
      emoji: '🌭',
      price: 300,
      category: 'food',
      effects: { needs: { hunger: 15 } },
      useActionId: 'eat',
    },
    {
      id: 'soap',
      name: 'Bath soap',
      emoji: '🧼',
      price: 400,
      category: 'toiletries',
      effects: { needs: { hygiene: 20 } },
      useActionId: 'shower',
    },
  ],
  bukka: [
    {
      id: 'jollof-plate',
      name: 'Plate of jollof',
      emoji: '🍲',
      price: 800,
      category: 'food',
      effects: { needs: { hunger: 35, fun: 5 } },
      useActionId: 'eat',
    },
    {
      id: 'moi-moi',
      name: 'Moi moi wrap',
      emoji: '🫔',
      price: 350,
      category: 'food',
      effects: { needs: { hunger: 18 } },
      useActionId: 'eat',
    },
  ],
}

const HUSTLES: Hustle[] = [
  {
    id: 'sort-lecturer',
    title: 'Sort lecturer',
    hint: 'A campus favour gone sideways. Outcome is luck — no tips, no how-to.',
    placeId: 'admin-block',
    energyCost: 15,
    periods: ['morning', 'afternoon', 'evening'],
  },
  {
    id: 'junction-runs',
    title: 'Runs at the junction',
    hint: 'Something shady by the road. Pure chance — keep it fictional.',
    placeId: 'keke-park',
    energyCost: 20,
    periods: ['afternoon', 'evening', 'night'],
  },
]

let currentJobId: string | null = null
let cash = 125_000
let inventory: InventoryItem[] = []
let rent: RentInfo = {
  lodgingId: 'hostel-poultry',
  amount: 1200,
  dueAt: new Date(Date.now() + 2 * 86400000).toISOString(),
  paidUntil: new Date(Date.now() - 5 * 86400000).toISOString(),
  status: 'due',
  label: 'Baba Landlord',
  warnings: 0,
  lastWarnedAt: null,
  evictedAt: null,
  message: null,
}
let ledger: LedgerEntry[] = [
  {
    id: 'lg-1',
    amount: 125_000,
    reason: 'Starting money',
    kind: 'starting_money',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    balanceAfter: 125_000,
  },
]

function snapshotState(message?: string): ServerGameState {
  return {
    ok: true,
    cash,
    needs: defaultNeeds(),
    locationId: 'admin-block',
    gameTime: 12 * 60,
    day: 1,
    period: 'afternoon',
    timeLabel: '12:00 PM',
    mood: { emoji: '😊', label: 'Happy', tone: 'good', score: 70 },
    dreamProgress: null,
    upNext: { actionId: 'eat', placeId: 'bukka', need: 'hunger', label: 'Eat' },
    version: 1,
    places: [],
    message,
  }
}

function pushLedger(amount: number, reason: string, kind: string) {
  cash += amount
  ledger.unshift({
    id: `lg-${Date.now()}`,
    amount,
    reason,
    kind,
    createdAt: new Date().toISOString(),
    balanceAfter: cash,
  })
}

export function mockJobs(placeId?: string | null) {
  const jobs = JOBS.map((job) => ({
    ...job,
    currentLevel: currentJobId === job.id ? 1 : undefined,
  })).filter((job) => !placeId || job.placeId === placeId)
  return { ok: true as const, jobs, currentJobId }
}

export function mockApply(jobId: string) {
  const job = JOBS.find((entry) => entry.id === jobId)
  if (!job) return { ok: false as const, error: 'That job is gone.' }
  if (job.locked) return { ok: false as const, error: job.lockReason || 'You cannot take this job yet.' }
  currentJobId = jobId
  return { ok: true as const, job: { ...job, currentLevel: 1 }, message: `You got the ${job.title} job.` }
}

export function mockShift() {
  const job = JOBS.find((entry) => entry.id === currentJobId)
  if (!job) return { ok: false as const, error: 'Apply for a job first.' }
  pushLedger(job.payPerShift, `${job.title} shift`, 'job_pay')
  return {
    ok: true as const,
    state: snapshotState(),
    earned: job.payPerShift,
    xp: 12,
    levelUp: Math.random() > 0.7,
    message: `Shift done. +₦${job.payPerShift.toLocaleString()}`,
  }
}

export function mockShop(placeId: string) {
  const items = SHOP[placeId] ?? SHOP['town-shop-1']!
  return { ok: true as const, items, placeId }
}

export function mockBuy(itemId: string, qty: number) {
  const item = Object.values(SHOP)
    .flat()
    .find((entry) => entry.id === itemId)
  if (!item) return { ok: false as const, error: 'Item not found.' }
  const total = item.price * Math.max(1, qty)
  if (cash < total) return { ok: false as const, error: 'You no get money reach.' }
  pushLedger(-total, `Bought ${item.name}`, 'purchase')
  const existing = inventory.find((row) => row.itemId === itemId)
  if (existing) existing.qty += qty
  else {
    inventory.push({
      id: `inv-${itemId}`,
      itemId,
      name: item.name,
      emoji: item.emoji,
      qty: Math.max(1, qty),
      useActionId: item.useActionId ?? null,
    })
  }
  const questComplete = itemId === 'phone-basic' ? 'buy_phone' : undefined
  return {
    ok: true as const,
    state: snapshotState(),
    inventory: [...inventory],
    message: `Bought ${item.name}.`,
    questComplete,
  }
}

export function mockInventory() {
  return { ok: true as const, items: [...inventory] }
}

export function mockUseItem(itemId: string) {
  const row = inventory.find((entry) => entry.itemId === itemId)
  if (!row) return { ok: false as const, error: 'Item not found.' }
  if (!row.useActionId) return { ok: false as const, error: 'You cannot use that here.' }
  row.qty -= 1
  if (row.qty <= 0) {
    inventory = inventory.filter((entry) => entry.itemId !== itemId)
  }
  return {
    ok: true as const,
    state: snapshotState(),
    inventory: [...inventory],
    message: `Used ${row.name}.`,
  }
}

export function mockRent() {
  return { ok: true as const, rent: { ...rent } }
}

export function mockPayRent() {
  if (cash < rent.amount) return { ok: false as const, error: 'You no get money reach.' }
  pushLedger(-rent.amount, 'Rent to Baba Landlord', 'rent')
  rent = {
    ...rent,
    status: 'ok',
    warnings: 0,
    lastWarnedAt: null,
    evictedAt: null,
    message: null,
    paidUntil: new Date(Date.now() + 7 * 86400000).toISOString(),
    dueAt: new Date(Date.now() + 7 * 86400000).toISOString(),
  }
  return {
    ok: true as const,
    state: snapshotState(),
    rent: { ...rent },
    message: 'Rent paid. Baba Landlord is smiling. Warnings cleared.',
  }
}

export function mockHustles() {
  return {
    ok: true as const,
    hustles: HUSTLES.map((h) => ({ ...h })),
    hustleLockoutUntil: null as number | null,
  }
}

export function mockRunHustle(hustleId: string) {
  const hustle = HUSTLES.find((h) => h.id === hustleId)
  if (!hustle) return { ok: false as const, error: 'That hustle is gone.' }
  const earned = 1200
  pushLedger(earned, hustle.title, 'event')
  return {
    ok: true as const,
    state: snapshotState(`Mock hustle: ${hustle.title}`),
    outcome: 'reward',
    earned,
    fine: 0,
    message: `${hustle.title}: somehow it paid. +₦${earned.toLocaleString()}`,
  }
}

export function mockLedger(limit: number, cursor?: string) {
  let start = 0
  if (cursor) {
    const idx = ledger.findIndex((entry) => entry.id === cursor)
    start = idx >= 0 ? idx + 1 : 0
  }
  const entries = ledger.slice(start, start + limit)
  const last = entries[entries.length - 1]
  const hasMore = start + entries.length < ledger.length
  return {
    ok: true as const,
    entries,
    cash,
    nextCursor: hasMore && last ? last.id : null,
  }
}

export function getMockCash() {
  return cash
}

export function setMockCash(next: number) {
  cash = Math.max(0, Math.floor(next))
}

/** Reset mock store (tests / storybook). */
export function resetEconomyMock() {
  currentJobId = null
  cash = 125_000
  inventory = []
  rent = {
    lodgingId: 'hostel-poultry',
    amount: 1200,
    dueAt: new Date(Date.now() + 2 * 86400000).toISOString(),
    paidUntil: new Date(Date.now() - 5 * 86400000).toISOString(),
    status: 'due',
    label: 'Baba Landlord',
    warnings: 0,
    lastWarnedAt: null,
    evictedAt: null,
    message: null,
  }
  ledger = [
    {
      id: 'lg-1',
      amount: 125_000,
      reason: 'Starting money',
      kind: 'starting_money',
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      balanceAfter: 125_000,
    },
  ]
}
