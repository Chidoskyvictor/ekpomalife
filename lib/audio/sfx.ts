import { soundMuted } from '@/lib/audio/music'

/*
 * Sound effects (button taps, success, coins…). Files live in public/audio/sfx/ — see the README
 * there for the exact list. Played through Web Audio (never an <audio> element: Android shows a
 * lock-screen media notification for those). A missing file is skipped for good, so the app runs
 * fine before every sound has been added. The game-wide Sound switch (status bar / settings) mutes these too.
 */

/** name → file (in /audio/sfx/) and loudness (0–1). */
export const SFX = {
  tap: { file: 'tap', volume: 0.5 }, // any button, link or tab
  back: { file: 'back', volume: 0.5 }, // back / close / dismiss
  toggle: { file: 'toggle', volume: 0.5 }, // switches and checkboxes
  open: { file: 'open', volume: 0.5 }, // sheet, dialog, phone or menu opening
  close: { file: 'close', volume: 0.45 }, // sheet, dialog or phone closing
  error: { file: 'error', volume: 0.6 }, // failed form, rejected action
  success: { file: 'success', volume: 0.6 }, // action worked (green toast)
  notify: { file: 'notify', volume: 0.55 }, // info notice, new message arriving
  sent: { file: 'sent', volume: 0.45 }, // chat message sent
  invite: { file: 'invite', volume: 0.6 }, // an invitation to go somewhere arrives
  coin: { file: 'coin', volume: 0.6 }, // money received
  spend: { file: 'spend', volume: 0.55 }, // money paid
  signup: { file: 'signup', volume: 0.7 }, // account created
  login: { file: 'login', volume: 0.6 }, // signed in
  spin: { file: 'spin', volume: 0.5 }, // starting-money reels spinning
  reveal: { file: 'reveal', volume: 0.7 }, // reels land / big reveal
  celebrate: { file: 'celebrate', volume: 0.7 }, // confetti, dream complete, grade A
  arrive: { file: 'arrive', volume: 0.55 }, // trip finished
  cardPlay: { file: 'card-play', volume: 0.55 }, // Whot: card played
  cardDraw: { file: 'card-draw', volume: 0.55 }, // Whot: card picked up
  win: { file: 'win', volume: 0.7 }, // game won
  lose: { file: 'lose', volume: 0.6 }, // game lost
  spray: { file: 'spray', volume: 0.6 }, // club: money sprayed
  grab: { file: 'grab', volume: 0.55 }, // club: note grabbed
} as const

export type SfxName = keyof typeof SFX

const BASE = '/audio/sfx/'
const MIN_GAP_MS = 45

type Slot = { buffer: AudioBuffer | null; loading: Promise<AudioBuffer | null> | null; missing: boolean; last: number }

let ctx: AudioContext | null = null
let master: GainNode | null = null
const slots = new Map<SfxName, Slot>()

function slotFor(name: SfxName): Slot {
  let slot = slots.get(name)
  if (!slot) {
    slot = { buffer: null, loading: null, missing: false, last: 0 }
    slots.set(name, slot)
  }
  return slot
}

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = 1
    master.connect(ctx.destination)
  }
  return ctx
}

async function load(audio: AudioContext, name: SfxName): Promise<AudioBuffer | null> {
  const slot = slotFor(name)
  if (slot.buffer) return slot.buffer
  if (slot.missing) return null
  slot.loading ??= (async () => {
    // .mp3 first (no failed request when that is all there is); an .ogg is only a fallback
    for (const ext of ['mp3', 'ogg']) {
      try {
        const res = await fetch(`${BASE}${SFX[name].file}.${ext}`)
        if (!res.ok || !(res.headers.get('content-type') ?? '').match(/audio|ogg|mpeg|octet/)) continue
        slot.buffer = await audio.decodeAudioData(await res.arrayBuffer())
        return slot.buffer
      } catch {
        /* missing or not decodable here: try the next one */
      }
    }
    slot.missing = true
    return null
  })()
  return slot.loading
}

/** Play a sound effect. Safe to call anywhere (server render, muted, before the first tap, file missing). */
export function playSfx(name: SfxName): void {
  if (typeof window === 'undefined' || soundMuted()) return
  const audio = ensureContext()
  if (!audio || !master) return
  const slot = slotFor(name)
  if (slot.missing) return
  const now = performance.now()
  if (now - slot.last < MIN_GAP_MS) return
  slot.last = now
  if (audio.state === 'suspended') void audio.resume().catch(() => {})
  void load(audio, name).then((buffer) => {
    if (!buffer || !master || soundMuted()) return
    const src = audio.createBufferSource()
    src.buffer = buffer
    const gain = audio.createGain()
    gain.gain.value = SFX[name].volume
    src.connect(gain)
    gain.connect(master)
    src.onended = () => {
      src.disconnect()
      gain.disconnect()
    }
    src.start()
  })
}

/** Start loading every sound once the player has tapped (browsers allow sound only after a tap). */
export function preloadSfx(names: SfxName[] = Object.keys(SFX) as SfxName[]): void {
  const audio = ensureContext()
  if (!audio) return
  for (const name of names) void load(audio, name)
}

/** A toast's sound: green → success, red → error. */
export const toastSfx = (ok: boolean): SfxName => (ok ? 'success' : 'error')
