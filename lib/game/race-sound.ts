import { driveAudio } from './drive'

/*
 * Start-line sound, made with the Web Audio API so there is no file to download: engines revving
 * while the lights count down, a beep for each light, a higher one and a launch roar at green.
 * Everything stays quiet if the player turned game sounds off.
 */

let ctx: AudioContext | null = null
const audio = () => {
  if (driveAudio.muted || typeof window === 'undefined') return null
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  ctx ??= new Ctor()
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
  return ctx
}

/** A throaty engine note: a saw through a low-pass, pitch swept from `from` to `to` Hz over `secs`. */
function engine(from: number, to: number, secs: number, gain: number, wobble = 0) {
  const a = audio()
  if (!a) return
  const t = a.currentTime
  const osc = a.createOscillator()
  const sub = a.createOscillator()
  const filter = a.createBiquadFilter()
  const amp = a.createGain()
  osc.type = 'sawtooth'
  sub.type = 'square'
  osc.frequency.setValueAtTime(from, t)
  osc.frequency.exponentialRampToValueAtTime(to, t + secs)
  sub.frequency.setValueAtTime(from / 2, t)
  sub.frequency.exponentialRampToValueAtTime(to / 2, t + secs)
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(380, t)
  filter.frequency.exponentialRampToValueAtTime(1500, t + secs)
  amp.gain.setValueAtTime(0.0001, t)
  amp.gain.exponentialRampToValueAtTime(gain, t + 0.06)
  amp.gain.exponentialRampToValueAtTime(0.0001, t + secs + 0.12)
  if (wobble) {
    const lfo = a.createOscillator()
    const depth = a.createGain()
    lfo.frequency.value = wobble
    depth.gain.value = from * 0.05
    lfo.connect(depth)
    depth.connect(osc.frequency)
    lfo.start(t)
    lfo.stop(t + secs + 0.2)
  }
  osc.connect(filter)
  sub.connect(filter)
  filter.connect(amp)
  amp.connect(a.destination)
  osc.start(t)
  sub.start(t)
  osc.stop(t + secs + 0.2)
  sub.stop(t + secs + 0.2)
}

function beep(freq: number, secs: number, gain: number) {
  const a = audio()
  if (!a) return
  const t = a.currentTime
  const osc = a.createOscillator()
  const amp = a.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  amp.gain.setValueAtTime(gain, t)
  amp.gain.exponentialRampToValueAtTime(0.0001, t + secs)
  osc.connect(amp)
  amp.connect(a.destination)
  osc.start(t)
  osc.stop(t + secs + 0.02)
}

/** "Get ready": the engine blips the throttle once or twice. */
export const revBlip = (n = 1) => engine(55 + n * 8, 130 + n * 40, 0.55, 0.16, 11)
/** A light on the gantry. */
export const lightBeep = () => beep(660, 0.16, 0.12)
/** Green: a higher beep and the launch roar. */
export function goSound() {
  beep(1040, 0.35, 0.16)
  engine(90, 340, 1.4, 0.2)
}
/** Crossing the line. */
export const finishSound = () => {
  beep(880, 0.18, 0.14)
  window.setTimeout(() => beep(1175, 0.4, 0.14), 160)
}
/** A checkpoint cleared. */
export const checkpointSound = () => beep(990, 0.12, 0.09)
