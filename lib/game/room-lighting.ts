/**
 * Day and night inside the homes, driven by the game clock (1 real minute = 10 game
 * minutes). Morning is soft and golden, afternoon bright, evening orange, and at night
 * the sun goes, a dim blue moon takes over outside and the room's own lamps come on so
 * the inside stays easy to see.
 */

export type RoomLight = {
  /** Sun (or moon) colour, strength and where it shines from (degrees). */
  sun: string
  sunIntensity: number
  sunElevation: number
  sunAzimuth: number
  ambient: string
  ambientIntensity: number
  hemiSky: string
  hemiGround: string
  hemiIntensity: number
  /** 0 = lamps off, 1 = fully on */
  lamps: number
  /** Tint laid over the page background (a gradient, top → bottom) and how strongly. */
  skyTop: string
  skyBottom: string
  skyOpacity: number
}

const NIGHT: RoomLight = {
  sun: '#8fa8ff',
  sunIntensity: 0.25,
  sunElevation: 50,
  sunAzimuth: 200,
  ambient: '#6878a8',
  ambientIntensity: 0.34,
  hemiSky: '#46568a',
  hemiGround: '#1f2536',
  hemiIntensity: 0.32,
  lamps: 1,
  skyTop: '#0b1430',
  skyBottom: '#28344f',
  skyOpacity: 0.94,
}

const MORNING: RoomLight = {
  sun: '#ffd7a8',
  sunIntensity: 0.9,
  sunElevation: 18,
  sunAzimuth: 90,
  ambient: '#fff1e0',
  ambientIntensity: 0.55,
  hemiSky: '#ffe9d2',
  hemiGround: '#c9b8a6',
  hemiIntensity: 0.45,
  lamps: 0.15,
  skyTop: '#ffd2ad',
  skyBottom: '#fff4ea',
  skyOpacity: 0.55,
}

/** Midday: the room's original lighting, with the page background showing untouched. */
const DAY: RoomLight = {
  sun: '#ffffff',
  sunIntensity: 1.05,
  sunElevation: 58,
  sunAzimuth: 150,
  ambient: '#ffffff',
  ambientIntensity: 0.75,
  hemiSky: '#ffffff',
  hemiGround: '#c5c0b6',
  hemiIntensity: 0.5,
  lamps: 0,
  skyTop: '#ffd2ad',
  skyBottom: '#fff4ea',
  skyOpacity: 0,
}

const EVENING: RoomLight = {
  sun: '#ffab68',
  sunIntensity: 0.85,
  sunElevation: 14,
  sunAzimuth: 270,
  ambient: '#ffdcc4',
  ambientIntensity: 0.48,
  hemiSky: '#ffcaa0',
  hemiGround: '#b89a88',
  hemiIntensity: 0.42,
  lamps: 0.45,
  skyTop: '#ef8f62',
  skyBottom: '#ffd7c2',
  skyOpacity: 0.62,
}

/** [minute of the day, light]; blended between neighbours. */
const KEYS: [number, RoomLight][] = [
  [0, NIGHT],
  [5 * 60 + 30, NIGHT],
  [7 * 60, MORNING],
  [10 * 60, DAY],
  [16 * 60, DAY],
  [18 * 60, EVENING],
  [20 * 60, NIGHT],
  [24 * 60, NIGHT],
]

const DAY_MINUTES = 24 * 60

export function minuteOfDay(gameTime: number) {
  return ((gameTime % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES
}

function mixHex(a: string, b: string, t: number) {
  const x = parseInt(a.slice(1), 16)
  const y = parseInt(b.slice(1), 16)
  const channel = (shift: number) => {
    const v = Math.round(((x >> shift) & 0xff) * (1 - t) + ((y >> shift) & 0xff) * t)
    return v.toString(16).padStart(2, '0')
  }
  return `#${channel(16)}${channel(8)}${channel(0)}`
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t

/** The light at a game time (absolute game minutes or minute of the day). */
export function roomLightAt(gameTime: number): RoomLight {
  const m = minuteOfDay(gameTime)
  let i = 0
  while (i < KEYS.length - 2 && KEYS[i + 1][0] <= m) i++
  const [m0, a] = KEYS[i]
  const [m1, b] = KEYS[i + 1]
  const raw = m1 === m0 ? 0 : (m - m0) / (m1 - m0)
  const t = raw * raw * (3 - 2 * raw) // ease in/out
  return {
    sun: mixHex(a.sun, b.sun, t),
    sunIntensity: mix(a.sunIntensity, b.sunIntensity, t),
    sunElevation: mix(a.sunElevation, b.sunElevation, t),
    sunAzimuth: mix(a.sunAzimuth, b.sunAzimuth, t),
    ambient: mixHex(a.ambient, b.ambient, t),
    ambientIntensity: mix(a.ambientIntensity, b.ambientIntensity, t),
    hemiSky: mixHex(a.hemiSky, b.hemiSky, t),
    hemiGround: mixHex(a.hemiGround, b.hemiGround, t),
    hemiIntensity: mix(a.hemiIntensity, b.hemiIntensity, t),
    lamps: mix(a.lamps, b.lamps, t),
    skyTop: mixHex(a.skyTop, b.skyTop, t),
    skyBottom: mixHex(a.skyBottom, b.skyBottom, t),
    skyOpacity: mix(a.skyOpacity, b.skyOpacity, t),
  }
}

/** Game minutes that pass per real millisecond. */
export const GAME_MINUTES_PER_MS = 10 / 60_000

/**
 * Dev only: `?roomTime=21:30` pins the room clock so each time of day can be checked
 * without waiting. Returns minute of the day, or null.
 */
export function pinnedRoomTime(search: string): number | null {
  if (process.env.NODE_ENV !== 'development') return null
  const raw = new URLSearchParams(search).get('roomTime')
  const match = raw?.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  return (Number(match[1]) % 24) * 60 + Math.min(59, Number(match[2]))
}
