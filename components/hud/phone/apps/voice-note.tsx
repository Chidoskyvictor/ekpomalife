'use client'

import { Pause, Play } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { voiceNoteUrl } from '@/lib/game/hostels-api'
import styles from './messages.module.css'

/** Longest note (matches the server), and the shortest worth sending. */
export const VOICE_MAX_MS = 60_000
export const VOICE_MIN_MS = 700
const BARS = 32

/** Recorder format: Chrome/Android record WebM/Opus, iPhone Safari records MP4/AAC. */
function pickMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  return ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/aac'].find((t) => MediaRecorder.isTypeSupported(t))
}

export const canRecordVoice = () =>
  typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)

/** Squash the loudness samples into BARS bars, scaled so the loudest bar is full height. */
function toPeaks(levels: number[]): number[] {
  if (!levels.length) return Array(BARS).fill(0.3)
  const out: number[] = []
  for (let i = 0; i < BARS; i++) {
    const from = Math.floor((i * levels.length) / BARS)
    const to = Math.max(from + 1, Math.floor(((i + 1) * levels.length) / BARS))
    out.push(Math.max(...levels.slice(from, to)))
  }
  const top = Math.max(...out, 0.01)
  return out.map((v) => Math.max(0.12, Math.min(1, v / top)))
}

export type VoiceTake = { blob: Blob; ms: number; peaks: number[] }

/**
 * Hold-to-record: start() asks for the mic (first time only) and records; stop() hands back the take,
 * cancel() throws it away. Stops by itself at VOICE_MAX_MS and calls onLimit.
 */
export function useVoiceRecorder(onLimit: () => void) {
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [level, setLevel] = useState(0)
  const rec = useRef<{
    recorder: MediaRecorder
    stream: MediaStream
    ctx: AudioContext
    chunks: Blob[]
    levels: number[]
    started: number
    timer: number
  } | null>(null)
  const wanted = useRef(false)
  const limitRef = useRef(onLimit)
  limitRef.current = onLimit

  const teardown = useCallback(() => {
    const r = rec.current
    rec.current = null
    if (!r) return
    window.clearInterval(r.timer)
    r.stream.getTracks().forEach((t) => t.stop())
    void r.ctx.close().catch(() => {})
    setRecording(false)
    setLevel(0)
  }, [])

  useEffect(() => teardown, [teardown])

  /** Resolves true once recording, false if the mic was refused or the press already ended. */
  const start = useCallback(async (): Promise<boolean | 'denied'> => {
    if (rec.current || !canRecordVoice()) return false
    wanted.current = true
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
    } catch {
      wanted.current = false
      return 'denied'
    }
    // Released while the permission prompt was up: don't start a recording nobody is holding
    if (!wanted.current) {
      stream.getTracks().forEach((t) => t.stop())
      return false
    }
    const mimeType = pickMime()
    const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 32_000 })
    const ctx = new AudioContext()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    ctx.createMediaStreamSource(stream).connect(analyser)
    const buf = new Uint8Array(analyser.fftSize)
    const chunks: Blob[] = []
    const levels: number[] = []
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data)
    }
    const started = performance.now()
    const timer = window.setInterval(() => {
      analyser.getByteTimeDomainData(buf)
      let sum = 0
      for (const v of buf) sum += ((v - 128) / 128) ** 2
      const rms = Math.sqrt(sum / buf.length)
      levels.push(rms)
      setLevel(Math.min(1, rms * 4))
      const ms = performance.now() - started
      setElapsed(ms)
      if (ms >= VOICE_MAX_MS) limitRef.current()
    }, 100)
    rec.current = { recorder, stream, ctx, chunks, levels, started, timer }
    recorder.start(250)
    setElapsed(0)
    setRecording(true)
    return true
  }, [])

  const stop = useCallback(async (): Promise<VoiceTake | null> => {
    wanted.current = false
    const r = rec.current
    if (!r) return null
    const ms = Math.min(performance.now() - r.started, VOICE_MAX_MS)
    const done = new Promise<void>((resolve) => {
      r.recorder.onstop = () => resolve()
    })
    if (r.recorder.state !== 'inactive') r.recorder.stop()
    await done
    const type = r.recorder.mimeType || r.chunks[0]?.type || 'audio/webm'
    const take = { blob: new Blob(r.chunks, { type }), ms, peaks: toPeaks(r.levels) }
    teardown()
    return ms < VOICE_MIN_MS ? null : take
  }, [teardown])

  const cancel = useCallback(() => {
    wanted.current = false
    const r = rec.current
    if (r && r.recorder.state !== 'inactive') {
      r.recorder.onstop = null
      r.recorder.stop()
    }
    teardown()
  }, [teardown])

  return { recording, elapsed, level, start, stop, cancel }
}

/** "0:07" */
export const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

type VoiceBody = { ms: number; peaks: number[] }

function parseBody(body: string): VoiceBody {
  try {
    const v = JSON.parse(body) as Partial<VoiceBody>
    return { ms: Number(v.ms) || 0, peaks: Array.isArray(v.peaks) ? v.peaks.map(Number) : Array(BARS).fill(0.3) }
  } catch {
    return { ms: 0, peaks: Array(BARS).fill(0.3) }
  }
}

/** Only one voice note plays at a time. */
let playing: HTMLAudioElement | null = null

/** A voice note in the chat: play/pause, waveform that fills as it plays, and its length. */
export function VoiceBubble({ messageId, body, mine }: { messageId: string; body: string; mine: boolean }) {
  const { ms, peaks } = parseBody(body)
  const audio = useRef<HTMLAudioElement | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'paused' | 'error'>('idle')
  const [progress, setProgress] = useState(0)

  useEffect(
    () => () => {
      audio.current?.pause()
    },
    [],
  )

  const toggle = async () => {
    if (state === 'playing') {
      audio.current?.pause()
      return
    }
    if (!audio.current) {
      setState('loading')
      const url = await voiceNoteUrl(messageId)
      if (!url) {
        setState('error')
        return
      }
      const el = new Audio(url)
      el.ontimeupdate = () => {
        const total = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : ms / 1000
        setProgress(total ? Math.min(1, el.currentTime / total) : 0)
      }
      el.onplay = () => setState('playing')
      el.onpause = () => setState('paused')
      el.onended = () => {
        setState('idle')
        setProgress(0)
      }
      audio.current = el
    }
    if (playing && playing !== audio.current) playing.pause()
    playing = audio.current
    try {
      await audio.current.play()
    } catch {
      setState('error')
    }
  }

  const shownMs = state === 'playing' || state === 'paused' ? ms * (1 - progress) : ms
  const label = state === 'playing' ? 'Pause voice note' : `Play voice note, ${clock(ms)}`
  return (
    <div className={`${styles.voice} ${mine ? styles.voiceMine : ''}`}>
      <button type="button" className={styles.voicePlay} onClick={() => void toggle()} aria-label={label}>
        {state === 'playing' ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
      </button>
      <span className={styles.voiceBars} aria-hidden="true">
        {peaks.map((p, i) => (
          <span
            key={i}
            className={`${styles.voiceBar} ${i / peaks.length < progress ? styles.voiceBarOn : ''}`}
            style={{ height: `${Math.round(Math.max(0.12, p) * 100)}%` }}
          />
        ))}
      </span>
      <span className={styles.voiceTime}>{state === 'loading' ? '…' : state === 'error' ? '!' : clock(shownMs)}</span>
    </div>
  )
}
