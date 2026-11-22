'use client'

import { crashVibration } from './car-physics'

/* A crash made in the browser: a noise burst through a low-pass (the crunch) over a falling thud.
   `strength` 0..1 sets how loud and how long. Also buzzes the phone. No sound files. */

let ctx: AudioContext | null = null
let noise: AudioBuffer | null = null

export function playCrash(strength: number, muted = false) {
  if (typeof window === 'undefined' || strength <= 0) return
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(crashVibration(strength))
  } catch {
    /* no vibration motor: fine */
  }
  if (muted) return
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    ctx ??= new Ctor()
    if (ctx.state === 'suspended') void ctx.resume()
    const now = ctx.currentTime
    const dur = 0.18 + strength * 0.5
    if (!noise) {
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
      const d = noise.getChannelData(0)
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    }
    const src = ctx.createBufferSource()
    src.buffer = noise
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(1800 + strength * 3000, now)
    lp.frequency.exponentialRampToValueAtTime(260, now + dur)
    const g = ctx.createGain()
    const peak = 0.12 + strength * 0.5
    g.gain.setValueAtTime(peak, now)
    g.gain.exponentialRampToValueAtTime(0.001, now + dur)
    src.connect(lp).connect(g).connect(ctx.destination)
    src.start(now)
    src.stop(now + dur + 0.02)
    const thud = ctx.createOscillator()
    thud.type = 'sine'
    thud.frequency.setValueAtTime(130, now)
    thud.frequency.exponentialRampToValueAtTime(42, now + 0.25)
    const tg = ctx.createGain()
    tg.gain.setValueAtTime(0.1 + strength * 0.5, now)
    tg.gain.exponentialRampToValueAtTime(0.001, now + 0.3)
    thud.connect(tg).connect(ctx.destination)
    thud.start(now)
    thud.stop(now + 0.32)
  } catch {
    /* no audio: stay silent */
  }
}
