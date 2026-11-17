'use client'

/* A car horn made in the browser (two notes together), so there is no sound file to download. */

let ctx: AudioContext | null = null

/** One short honk. `volume` 0..1 (quieter for cars further away). */
export function playHorn(volume = 1, ms = 380) {
  if (typeof window === 'undefined' || volume <= 0.02) return
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    ctx ??= new Ctor()
    if (ctx.state === 'suspended') void ctx.resume()
    const now = ctx.currentTime
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, 0.22 * volume), now + 0.02)
    gain.gain.setValueAtTime(Math.max(0.001, 0.22 * volume), now + ms / 1000 - 0.06)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + ms / 1000)
    gain.connect(ctx.destination)
    for (const hz of [392, 494]) {
      const osc = ctx.createOscillator()
      osc.type = 'square'
      osc.frequency.value = hz
      osc.connect(gain)
      osc.start(now)
      osc.stop(now + ms / 1000 + 0.02)
    }
  } catch {
    /* no audio: stay silent */
  }
}
