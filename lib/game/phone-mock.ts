import { getMockCash, setMockCash } from '@/lib/game/economy-mock'
import { PHONE_FREE_FOR_ALL } from '@/lib/flags'
import { PLACES, getPlace } from '@/lib/game/places'
import {
  BATTERY,
  DATA_BUNDLES,
  DATA_COST_MB,
  HOSTEL_PLACE_IDS,
  RIDE_BASE,
  RIDE_MINUTES,
  RIDE_PER_HOP,
  type DataBundleId,
  type PhoneAppId,
  type PhoneClock,
  type PhonePromo,
  type PhoneState,
  type RideMode,
  type WallpaperId,
} from '@/lib/game/phone'

type IdemBody = Record<string, unknown>

let phone: PhoneState = {
  battery: 76,
  charging: false,
  dataMb: 120,
  wallpaper: 'aau-dusk',
  unread: { jobs: 1, gist: 3, calendar: 1 },
  newApps: ['ride', 'calendar'],
}

let locationId: string | null = 'school-hostels-1'
let gameTime = 36 * 60 // absolute game minutes
let batteryGameTime = gameTime
const idemStore = new Map<string, { status: number; body: IdemBody }>()

const PROMOS: PhonePromo[] = [
  {
    id: 'freshers-night',
    title: "Freshers' Night at Students' Centre",
    subtitle: 'Fri 8PM — come vibe',
    cta: 'See details',
    emoji: '🎉',
    action: { type: 'place', placeId: 'students-centre' },
  },
  {
    id: 'mama-amina',
    title: 'Mama Amina Bukka',
    subtitle: 'Rice + plantain combo',
    cta: 'Go there',
    emoji: '🍲',
    action: { type: 'place', placeId: 'bukka' },
  },
  {
    id: 'dj-ojemu',
    title: 'New single from DJ Ojemu',
    subtitle: 'Ekpoma Vibes (fictional)',
    cta: 'Listen',
    emoji: '🎧',
    action: { type: 'app', appId: 'music' },
  },
  {
    id: 'exam-tt',
    title: 'Exam timetable is out',
    subtitle: 'Check your slots',
    cta: 'Open Calendar',
    emoji: '📅',
    action: { type: 'app', appId: 'calendar' },
  },
  {
    id: 'data-promo',
    title: 'Data bundles from ₦100',
    subtitle: 'Stay online for campus news',
    cta: 'Buy data',
    emoji: '📶',
    action: { type: 'app', appId: 'settings' },
  },
]

function clonePhone(): PhoneState {
  return {
    ...phone,
    unread: { ...phone.unread },
    newApps: [...phone.newApps],
  }
}

function periodForHour(hour: number): string {
  if (hour < 5) return 'late_night'
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  if (hour < 21) return 'evening'
  return 'night'
}

function phoneClock(t: number): PhoneClock {
  const day = Math.floor(t / (24 * 60)) + 1
  const minsInDay = t % (24 * 60)
  const hour = Math.floor(minsInDay / 60)
  const minute = minsInDay % 60
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const h12 = hour % 12 || 12
  return {
    gameTime: t,
    day,
    hour,
    minute,
    period: periodForHour(hour),
    label: `${h12}:${String(minute).padStart(2, '0')} ${ampm}`,
  }
}

function isHostel(id: string | null) {
  return !!id && (HOSTEL_PLACE_IDS as readonly string[]).includes(id)
}

function recomputeBattery() {
  const elapsed = Math.max(0, gameTime - batteryGameTime)
  if (phone.charging && !isHostel(locationId)) phone.charging = false
  if (elapsed > 0) {
    if (phone.charging && isHostel(locationId)) {
      phone.battery = Math.min(100, phone.battery + elapsed * BATTERY.chargePerGameMinuteAtHostel)
      if (phone.battery >= 100) {
        phone.battery = 100
        phone.charging = false
      }
    } else {
      const hours = Math.floor(elapsed / 60)
      if (hours > 0) phone.battery = Math.max(0, phone.battery - hours * BATTERY.drainPerGameHour)
    }
  }
  batteryGameTime = gameTime
}

function hopDistance(from: string, to: string): number | null {
  if (from === to) return 0
  const ids = PLACES.map((p) => p.id)
  const a = ids.indexOf(from)
  const b = ids.indexOf(to)
  if (a < 0 || b < 0) return null
  return Math.max(1, Math.abs(a - b))
}

function noPhone() {
  if (PHONE_FREE_FOR_ALL) return null
  if (typeof localStorage !== 'undefined' && localStorage.getItem('mock-no-phone') === '1') {
    return { ok: false as const, code: 'NO_PHONE', error: 'Get a phone first.', status: 403 }
  }
  return null
}

function fail(code: string, error: string, status = 400) {
  return { ok: false as const, code, error, status }
}

export function resetPhoneMock() {
  phone = {
    battery: 76,
    charging: false,
    dataMb: 120,
    wallpaper: 'aau-dusk',
    unread: { jobs: 1, gist: 3, calendar: 1 },
    newApps: ['ride', 'calendar'],
  }
  locationId = 'school-hostels-1'
  gameTime = 36 * 60
  batteryGameTime = gameTime
  idemStore.clear()
}

export function setPhoneMockLocation(placeId: string | null) {
  locationId = placeId
  recomputeBattery()
}

export function advancePhoneMockTime(minutes: number) {
  gameTime += minutes
  recomputeBattery()
}

export function mockGetPhone() {
  const blocked = noPhone()
  if (blocked) return blocked
  recomputeBattery()
  const place = getPlace(locationId)
  return {
    ok: true as const,
    phone: clonePhone(),
    clock: phoneClock(gameTime),
    location: {
      placeId: locationId,
      label: place?.label ?? 'Ekpoma',
      town: 'Ekpoma, Edo' as const,
    },
    promos: PROMOS,
    bundles: DATA_BUNDLES,
    cash: getMockCash(),
  }
}

export function mockBuyData(bundleId: DataBundleId, idempotencyKey: string) {
  const blocked = noPhone()
  if (blocked) return blocked
  const prev = idemStore.get(`data:${idempotencyKey}`)
  if (prev) {
    return { ...(prev.body as { ok: true } & Record<string, unknown>), replayed: true }
  }
  recomputeBattery()
  const bundle = DATA_BUNDLES.find((b) => b.id === bundleId)
  if (!bundle) return fail('BAD_BUNDLE', 'That bundle does not exist.')
  const cash = getMockCash()
  if (cash < bundle.price) {
    return fail(
      'INSUFFICIENT_FUNDS',
      'Not enough cash for this one — a shift at work go sort am.',
    )
  }
  setMockCash(cash - bundle.price)
  phone.dataMb += bundle.mb
  const body = {
    ok: true as const,
    phone: clonePhone(),
    cash: getMockCash(),
    ledgerId: `lg-data-${idempotencyKey.slice(0, 8)}`,
    message: `${bundle.label} loaded. You get ${bundle.mb}MB.`,
    replayed: false,
  }
  idemStore.set(`data:${idempotencyKey}`, { status: 200, body })
  return body
}

export function mockCharge(action: 'start' | 'stop') {
  const blocked = noPhone()
  if (blocked) return blocked
  recomputeBattery()
  if (action === 'start') {
    if (!isHostel(locationId)) {
      return fail('NOT_AT_HOSTEL', 'You fit only charge for hostel.')
    }
    phone.charging = true
    return { ok: true as const, phone: clonePhone(), message: 'Charging… the power is on.' }
  }
  phone.charging = false
  return { ok: true as const, phone: clonePhone(), message: 'Stopped charging.' }
}

export function mockOpenApp(appId: PhoneAppId) {
  const blocked = noPhone()
  if (blocked) return blocked
  recomputeBattery()
  if (phone.battery <= 0) {
    return fail('BATTERY_DEAD', 'Your phone is dead. Charge it at your hostel.', 400)
  }
  const cost = DATA_COST_MB[appId] ?? 0
  const offline = cost > 0 && phone.dataMb < cost
  phone.battery = Math.max(0, phone.battery - BATTERY.drainPerAppOpen)
  if (!offline && cost > 0) phone.dataMb = Math.max(0, phone.dataMb - cost)
  phone.newApps = phone.newApps.filter((id) => id !== appId)
  if (phone.unread[appId]) {
    const next = { ...phone.unread }
    delete next[appId]
    phone.unread = next
  }
  return { ok: true as const, phone: clonePhone(), offline }
}

export function mockSetWallpaper(wallpaper: WallpaperId) {
  const blocked = noPhone()
  if (blocked) return blocked
  recomputeBattery()
  if (!['aau-dusk', 'ekpoma-night', 'harmattan', 'green-white'].includes(wallpaper)) {
    return fail('UNKNOWN_WALLPAPER', 'That wallpaper does not exist.')
  }
  phone.wallpaper = wallpaper
  return { ok: true as const, phone: clonePhone() }
}

export function mockListNotifications() {
  const blocked = noPhone()
  if (blocked) return blocked
  recomputeBattery()
  const items: Array<{
    id: string
    appId: PhoneAppId
    title: string
    body: string
    createdAt: string
  }> = []
  if ((phone.unread.jobs ?? 0) > 0) {
    items.push({
      id: 'n-jobs',
      appId: 'jobs',
      title: 'New shifts',
      body: 'Campus Shop POS is open',
      createdAt: new Date().toISOString(),
    })
  }
  if ((phone.unread.calendar ?? 0) > 0) {
    items.push({
      id: 'n-rent',
      appId: 'calendar',
      title: 'Rent reminder',
      body: 'Baba Landlord due soon',
      createdAt: new Date().toISOString(),
    })
  }
  if ((phone.unread.gist ?? 0) > 0) {
    items.push({
      id: 'n-gist',
      appId: 'gist',
      title: 'Campus news',
      body: 'Fresh posts for your area',
      createdAt: new Date().toISOString(),
    })
  }
  return {
    ok: true as const,
    unread: { ...phone.unread },
    newApps: [...phone.newApps],
    items: items.slice(0, 20),
  }
}

export function mockRideQuote(to: string) {
  const blocked = noPhone()
  if (blocked) return blocked
  recomputeBattery()
  if (!getPlace(to)) return fail('BAD_PLACE', 'That place is not on the map.')
  if (!locationId || locationId === to) {
    return fail('SAME_PLACE', 'You are already there.')
  }
  const hops = hopDistance(locationId, to)
  if (hops == null) return fail('BAD_PLACE', 'That place is not on the map.')
  const modes: RideMode[] = ['keke', 'okada']
  return {
    ok: true as const,
    from: locationId,
    to,
    quotes: modes.map((mode) => ({
      mode,
      fare: RIDE_BASE[mode] + RIDE_PER_HOP[mode] * hops,
      minutes: RIDE_MINUTES[mode] * Math.max(1, hops),
    })),
  }
}

export function mockTakeRide(to: string, mode: RideMode, idempotencyKey: string) {
  const blocked = noPhone()
  if (blocked) return blocked
  const prev = idemStore.get(`ride:${idempotencyKey}`)
  if (prev) {
    return { ...(prev.body as { ok: true } & Record<string, unknown>), replayed: true }
  }
  const quote = mockRideQuote(to)
  if (!quote.ok) return quote
  const clock = phoneClock(gameTime)
  if (mode === 'keke' && (clock.hour < 5 || clock.hour >= 22)) {
    return fail('CLOSED', 'Kekes have closed for today. Walk or wait till morning.')
  }
  const picked = quote.quotes.find((q) => q.mode === mode)
  if (!picked) return fail('BAD_PLACE', 'That place is not on the map.')
  const cash = getMockCash()
  if (cash < picked.fare) {
    return fail(
      'INSUFFICIENT_FUNDS',
      'Not enough cash for this one — a shift at work go sort am.',
    )
  }
  setMockCash(cash - picked.fare)
  locationId = to
  gameTime += picked.minutes
  recomputeBattery()
  const dest = getPlace(to)
  const body = {
    ok: true as const,
    state: null as null,
    fare: picked.fare,
    cash: getMockCash(),
    ledgerId: `lg-ride-${idempotencyKey.slice(0, 8)}`,
    message: `${mode === 'keke' ? 'Keke' : 'Okada'} to ${dest?.label ?? to}`,
    replayed: false,
  }
  idemStore.set(`ride:${idempotencyKey}`, { status: 200, body })
  return body
}
