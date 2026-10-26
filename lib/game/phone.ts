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
  | 'profile'
  | 'invest'
  | 'eta'
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

export type PhoneAppMeta = {
  id: PhoneAppId
  label: string
  emoji: string
  status: 'live' | 'soon'
  tint: string
}

export const PHONE_APPS: PhoneAppMeta[] = [
  { id: 'jobs', label: 'Jobs', emoji: '💼', status: 'live', tint: '#3d9ad6' },
  { id: 'bank', label: 'Bank', emoji: '🏦', status: 'live', tint: '#16a34a' },
  { id: 'invest', label: 'Invest', emoji: '📈', status: 'live', tint: '#0f766e' },
  { id: 'messages', label: 'Messages', emoji: '💬', status: 'live', tint: '#6366f1' },
  { id: 'eta', label: 'ẹta', emoji: '🗣️', status: 'live', tint: '#5b3fd1' },
  { id: 'gist', label: 'Campus News', emoji: '📰', status: 'live', tint: '#ea580c' },
  { id: 'market', label: 'Market', emoji: '🛍️', status: 'live', tint: '#db2777' },
  { id: 'ride', label: 'Ride', emoji: '🛺', status: 'live', tint: '#ca8a04' },
  { id: 'map', label: 'Map', emoji: '🗺️', status: 'live', tint: '#0d9488' },
  { id: 'calendar', label: 'Calendar', emoji: '📅', status: 'live', tint: '#2563eb' },
  { id: 'profile', label: 'Profile', emoji: '👤', status: 'live', tint: '#0ea5e9' },
  { id: 'portal', label: 'Results', emoji: '🎓', status: 'soon', tint: '#7c3aed' },
  { id: 'music', label: 'Music', emoji: '🎧', status: 'soon', tint: '#e11d48' },
  { id: 'games', label: 'Games', emoji: '🎮', status: 'live', tint: '#0891b2' },
  { id: 'settings', label: 'Settings', emoji: '⚙️', status: 'live', tint: '#64748b' },
]

export const PHONE_DOCK: PhoneAppId[] = ['messages', 'bank', 'map', 'ride']

export const WALLPAPERS: Record<WallpaperId, { label: string; css: string }> = {
  'aau-dusk': {
    label: 'AAU dusk',
    css: 'linear-gradient(180deg, #4c1d95 0%, #c2410c 55%, #fbbf24 100%)',
  },
  'ekpoma-night': {
    label: 'Ekpoma night',
    css: 'linear-gradient(180deg, #0f172a 0%, #1e1b4b 60%, #312e81 100%)',
  },
  harmattan: {
    label: 'Harmattan',
    css: 'linear-gradient(180deg, #fdba74 0%, #fed7aa 45%, #ffedd5 100%)',
  },
  'green-white': {
    label: 'Green & white',
    css: 'linear-gradient(180deg, #166534 0%, #86efac 50%, #f8fafc 100%)',
  },
}

export const COMING_SOON_COPY: Record<PhoneAppId, string> = {
  jobs: '',
  bank: '',
  messages: 'Messages are coming soon — your friends are not on the Ekpoma network yet.',
  gist: '',
  market: '',
  ride: '',
  map: '',
  calendar: '',
  profile: '',
  invest: '',
  eta: '',
  portal: 'Portal go open after exams. Check Result at Student Affairs for now.',
  music: 'DJ Ojemu still mastering the mix. Hold your neck.',
  games: 'Campus games loading. Go touch grass at Sports Complex meantime.',
  settings: '',
}

export const PHONE_MODE_KEY = 'ekpoma-phone-mode'
