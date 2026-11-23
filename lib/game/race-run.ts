'use client'

import { useSyncExternalStore } from 'react'
import { driveCommand, driveTelemetry, setDriveDest } from './drive'
import { aiField, makeAi, type AiRacer } from './race-ai'
import { courseById, newTracker, startPlaceId, type Course, type Tracker } from './race-courses'
import { NO_UPGRADES, type Upgrades } from './race-rewards'
import { closeTrial, openTrial, type BoardRow, type Reward, type RunMeta } from './race-trials-api'

/*
 * The race you are running now (a time trial, alone or against AI drivers, on a named route or a
 * sprint from where you stand). One small store holds the phase for the HUD; the 3D scene steps the
 * cars every frame and writes `runLive`, a plain object so nothing re-renders 60 times a second.
 *
 *   toGrid    drive (GPS ribbon) to the start box
 *   grid      stopped in the box: tap Start
 *   countdown 3-2-1, engines held
 *   racing    clock running, checkpoints, live positions
 *   done      results
 */

export type Phase = 'toGrid' | 'grid' | 'countdown' | 'racing' | 'done'

export type Result = {
  /** Your finish time (ms), or null if you quit. */
  ms: number | null
  /** Where you came (1 = first) out of `of`. */
  place: number
  of: number
  splits: number[]
  /** Server verdict for the board, once heard. */
  board: { state: 'sending' | 'counted' | 'refused' | 'none'; message?: string; personalBest?: boolean; previousBest?: number | null; rows?: BoardRow[]; mine?: { ms: number; rank: number } | null }
  /** AI finishers in order, for the table. */
  field: { name: string; ms: number | null; you: boolean }[]
  /** Racer XP, rank-up and badges the server paid for this run (named routes only). */
  reward: Reward | null
}

export type Run = {
  id: number
  course: Course
  /** AI drivers on the grid (empty for a solo time trial). */
  ai: AiRacer[]
  phase: Phase
  /** The server's open trial, once the lights go green (null for a free sprint or if offline). */
  trialId: string | null
  /** Does this run count for the board? Named routes only. */
  counts: boolean
  /** Your car's fitted upgrades and your racer XP, shown on the grid and used for "beat a faster player". */
  playerUp: Upgrades
  playerXp: number
  /** Was the game clock past dusk when you set off (for the night racer badge)? */
  night: boolean
  result: Result | null
}

export type LiveRacer = { id: string; name: string; you: boolean; progress: number; finishedAt: number | null; speed: number }

/** Updated every frame by the scene and read by the HUD at a few hertz. */
export const runLive = {
  /** ms since the green light (0 before). */
  t: 0,
  /** Wall clock (performance.now) of the green light. */
  goAt: 0,
  tracker: newTracker() as Tracker,
  /** Your place, 1 = first. */
  place: 1,
  racers: [] as LiveRacer[],
  /** Metres from the start box (toGrid). */
  toStart: 0,
  /** Hard knocks (bumps) when the lights went green: a race with none added is a clean race. */
  crashStart: 0,
  /** Your place when you cleared the halfway checkpoint (null until then): last there and first at the end is a comeback. */
  halfPlace: null as number | null,
  /** Splits of your best run on this route, for gap-to-best. */
  best: null as number[] | null,
}

let run: Run | null = null
let nextId = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export const useRun = () => useSyncExternalStore(subscribe, () => run, () => null)
export const currentRun = () => run

/** Where grid slot `slot` waits. */
export function gridSlot(start: { x: number; z: number; h: number }, slot: number) {
  // Two to a row: slot 0 is the pole in your lane, slot 1 beside it on the left, then a row back
  const back = Math.floor(slot / 2) * 8
  const across = slot % 2 === 0 ? 0 : 3.6
  const { x, z, h } = start
  return { x: x - Math.sin(h) * back + Math.cos(h) * across, z: z - Math.cos(h) * back - Math.sin(h) * across, h }
}

function reset(next: Run | null) {
  run = next
  runLive.t = 0
  runLive.goAt = 0
  runLive.tracker = newTracker()
  runLive.place = 1
  runLive.racers = []
  runLive.toStart = 0
  runLive.crashStart = 0
  runLive.halfPlace = null
  driveCommand.hold = false
  emit()
}

/**
 * Begin a run on a course. `named` routes start at their start box (the GPS leads you there);
 * a sprint from where you stand starts where you are. `rivals` is how many AI drivers line up (0 = solo).
 */
export function beginRun(course: Course, opts: { rivals: number; model: string; seed?: number; named: boolean; up?: Upgrades; xp?: number; night?: boolean }) {
  const field = aiField(opts.model, opts.rivals, opts.seed ?? Date.now())
  // You take the pole; the AI line up behind and beside
  const ai = field.map((f, i) => makeAi(course, gridSlot(course.start, i + 1), f))
  reset({ id: nextId++, course, ai, phase: opts.named ? 'toGrid' : 'grid', trialId: null, counts: opts.named, playerUp: opts.up ?? NO_UPGRADES, playerXp: opts.xp ?? 0, night: opts.night ?? false, result: null })
  if (opts.named) {
    const id = startPlaceId(course)
    setDriveDest({ id, label: 'Start line' })
  } else {
    setDriveDest(null)
  }
  if (!opts.named) driveCommand.warp = null
}

/** In the box and stopped: the scene calls this. Snaps you onto the pole. */
export function arriveAtGrid() {
  if (!run || run.phase !== 'toGrid') return
  run = { ...run, phase: 'grid' }
  driveCommand.warp = gridSlot(run.course.start, 0)
  setDriveDest(null)
  emit()
}

/** Tap Start: the server opens the trial, the lights count down, engines held. */
export function pressStart() {
  if (!run || run.phase !== 'grid') return
  const id = run.id
  const course = run.course
  runLive.goAt = performance.now() + 4200
  run = { ...run, phase: 'countdown' }
  driveCommand.hold = true
  emit()
  if (run.counts) {
    void openTrial(course.id).then((res) => {
      if (run && run.id === id) run = { ...run, trialId: res.ok ? res.trialId : null }
    })
  }
}

/** The green light: the scene calls this. */
export function lightsOut() {
  if (!run || run.phase !== 'countdown') return
  runLive.crashStart = driveTelemetry.bumps
  runLive.halfPlace = null
  run = { ...run, phase: 'racing' }
  driveCommand.hold = false
  emit()
}

/** You crossed the line (or quit): work out the result and, on a named route, hand the time to the server. */
export function finishRun(ms: number | null, splits: number[]) {
  if (!run || run.phase === 'done') return
  const racers = runLive.racers
  const sorted = [...racers].sort((a, b) => {
    if (a.finishedAt !== null && b.finishedAt !== null) return a.finishedAt - b.finishedAt
    if (a.finishedAt !== null) return -1
    if (b.finishedAt !== null) return 1
    return b.progress - a.progress
  })
  const place = Math.max(1, sorted.findIndex((r) => r.you) + 1)
  const result: Result = {
    ms,
    place: ms === null ? racers.length : place,
    of: racers.length || 1,
    splits,
    board: { state: ms !== null && run.counts && run.trialId ? 'sending' : 'none' },
    field: sorted.map((r) => ({ name: r.name, ms: r.finishedAt, you: r.you })),
    reward: null,
  }
  const id = run.id
  const trialId = run.trialId
  run = { ...run, phase: 'done', result }
  driveCommand.hold = false
  emit()
  if (ms !== null && run.counts && trialId) {
    // Facts for badges: how you did against the field (beating a car with a better engine or a higher rank counts double)
    const beaten = run.ai.filter((a) => sorted.findIndex((r) => r.id === a.id) > place - 1)
    const meta: RunMeta = {
      mode: run.ai.length > 0 ? 'ai' : 'trial',
      place: Math.min(4, place),
      of: Math.min(4, racers.length || 1),
      beatFaster: beaten.filter((a) => a.up.engine > run!.playerUp.engine || a.xp > run!.playerXp).length,
      beatAiSkill: beaten.length ? Math.max(...beaten.map((a) => a.skill)) : null,
      crashed: driveTelemetry.bumps > runLive.crashStart,
      night: run.night,
      comeback: place === 1 && racers.length > 1 && runLive.halfPlace === racers.length,
    }
    void closeTrial(trialId, ms, splits, meta).then((res) => {
      if (!run || run.id !== id || !run.result) return
      const board: Result['board'] = res.ok
        ? { state: 'counted', personalBest: res.personalBest, previousBest: res.previousBest, rows: res.board, mine: res.mine }
        : { state: 'refused', message: res.error ?? 'The server did not count that time.' }
      run = { ...run, result: { ...run.result, board, reward: res.ok ? res.reward : null } }
      emit()
    })
  }
}

/** Refresh the field's finish times in the result as the AI cross the line after you. */
export function updateField() {
  if (!run?.result) return
  const field = [...runLive.racers]
    .sort((a, b) => (a.finishedAt ?? Infinity) - (b.finishedAt ?? Infinity) || b.progress - a.progress)
    .map((r) => ({ name: r.name, ms: r.finishedAt, you: r.you }))
  const place = field.findIndex((r) => r.you) + 1
  run = { ...run, result: { ...run.result, field, place: run.result.ms === null ? run.result.place : Math.max(1, place) } }
  emit()
}

/** Leave the run (cancel, or after the results). */
export function endRun() {
  if (!run) return
  reset(null)
  setDriveDest(null)
}

/** Run the same course again from the grid. */
export function again(model: string) {
  if (!run) return
  const { course, ai, playerUp, playerXp, night } = run
  const named = run.counts
  const named2 = courseById(course.id)
  beginRun(course, { rivals: ai.length, model, named: named && Boolean(named2), up: playerUp, xp: playerXp, night })
  if (named) {
    // Already at the start: stay on the grid rather than driving back to it
    arriveAtGrid()
  } else {
    driveCommand.warp = course.start
  }
}

/** Distance (m) from the car to the start box. */
export const toStartBox = (course: Course) => Math.hypot(course.start.x - driveTelemetry.x, course.start.z - driveTelemetry.z)

/** Close enough, and slow enough, to count as "in the box". */
export const IN_BOX = 16
