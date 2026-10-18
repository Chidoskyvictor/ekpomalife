/** Shared phone ids/constants — mirror backend/src/game/phone.ts */

export type PhoneAppId =
  | 'jobs'
  | 'bank'
  | 'messages'
  | 'gist'
  | 'market'
  | 'ride'
  | 'map'
  | 'calendar'
  | 'portal'
  | 'music'
  | 'games'
  | 'settings'

export type WallpaperId = 'aau-dusk' | 'ekpoma-night' | 'harmattan' | 'green-white'

export type DataBundleId = 'data-100' | 'data-350' | 'data-1000'

export const DATA_BUNDLES = [
  { id: 'data-100', label: '100MB · 1 day', mb: 100, price: 100 },
  { id: 'data-350', label: '350MB · 3 days', mb: 350, price: 300 },
  { id: 'data-1000', label: '1GB · 7 days', mb: 1000, price: 750 },
] as const

export type RideMode = 'keke' | 'okada'

export const RIDE_BASE = { keke: 150, okada: 250 } as const
export const RIDE_PER_HOP = { keke: 50, okada: 80 } as const
export const RIDE_MINUTES = { keke: 20, okada: 10 } as const

export const BATTERY = {
  drainPerAppOpen: 1,
  drainPerGameHour: 2,
  chargePerGameMinuteAtHostel: 1,
  lowAt: 20,
} as const

export const DATA_COST_MB: Partial<Record<PhoneAppId, number>> = {
  gist: 2,
  messages: 1,
  music: 5,
  games: 3,
  map: 1,
}

export const HOSTEL_PLACE_IDS = [
  'school-hostels-1',
  'school-hostels-2',
  'off-campus-hostels',
] as const

export type PhoneState = {
  battery: number
  charging: boolean
  dataMb: number
  wallpaper: WallpaperId
  unread: Partial<Record<PhoneAppId, number>>
  newApps: PhoneAppId[]
}

export type PhoneClock = {
  gameTime: number
  day: number
  hour: number
  minute: number
  period: string
  label: string
}

export type PhonePromo = {
  id: string
  title: string
  subtitle: string
  cta: string
  emoji: string
  action: { type: 'app'; appId: PhoneAppId } | { type: 'place'; placeId: string }
}
