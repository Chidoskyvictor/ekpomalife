import { beforeEach, describe, expect, it, vi } from 'vitest'

const openTrial = vi.fn()
const closeTrial = vi.fn()
vi.mock('./race-trials-api', () => ({ openTrial: (...a: unknown[]) => openTrial(...a), closeTrial: (...a: unknown[]) => closeTrial(...a) }))

import { courseById } from './race-courses'
import { arriveAtGrid, beginRun, currentRun, endRun, finishRun, lightsOut, pressStart, runLive } from './race-run'

const reward = { xp: 90, totalXp: 910, rank: { id: 'danfo', name: 'Danfo Driver', emoji: '🚌' }, rankedUp: false, badges: ['first-win'] }

beforeEach(() => {
  openTrial.mockReset()
  closeTrial.mockReset()
  endRun()
})

describe('a named-route run hands its time to the server', () => {
  it('opens a trial at the start, then closes it with the time, splits and the facts about the run, and shows the reward', async () => {
    openTrial.mockResolvedValue({ ok: true, trialId: 'T1', car: 'camry' })
    closeTrial.mockResolvedValue({ ok: true, ms: 60000, personalBest: true, previousBest: null, board: [], mine: { ms: 60000, rank: 3 }, reward })
    const course = courseById('expressway-flat-out')!
    beginRun(course, { rivals: 2, model: 'camry', named: true, seed: 3, up: { engine: 1, tyres: 0, brakes: 0 }, xp: 820, night: true })
    arriveAtGrid()
    expect(currentRun()!.phase).toBe('grid')
    pressStart()
    await Promise.resolve()
    await Promise.resolve()
    expect(openTrial).toHaveBeenCalledWith('expressway-flat-out')
    expect(currentRun()!.trialId).toBe('T1')
    lightsOut()
    runLive.racers = [
      { id: 'you', name: 'You', you: true, progress: 3200, finishedAt: 60000, speed: 0 },
      ...currentRun()!.ai.map((a, i) => ({ id: a.id, name: a.name, you: false, progress: 2000 - i * 100, finishedAt: null, speed: 30 })),
    ]
    finishRun(60000, [15000, 30000, 45000, 60000])
    expect(closeTrial).toHaveBeenCalledTimes(1)
    const [trialId, ms, splits, meta] = closeTrial.mock.calls[0]!
    expect(trialId).toBe('T1')
    expect(ms).toBe(60000)
    expect(splits).toHaveLength(4)
    expect(meta).toMatchObject({ mode: 'ai', place: 1, of: 3, night: true, crashed: false })
    expect(meta.beatAiSkill).toBeGreaterThan(0)
    await Promise.resolve()
    await Promise.resolve()
    expect(currentRun()!.result!.reward).toEqual(reward)
    expect(currentRun()!.result!.board.state).toBe('counted')
  })

  it('a sprint from where you stand never goes to the server', () => {
    const course = courseById('expressway-flat-out')!
    beginRun(course, { rivals: 1, model: 'camry', named: false })
    pressStart()
    lightsOut()
    runLive.racers = [{ id: 'you', name: 'You', you: true, progress: 3200, finishedAt: 50000, speed: 0 }]
    finishRun(50000, [1, 2, 3, 4])
    expect(openTrial).not.toHaveBeenCalled()
    expect(closeTrial).not.toHaveBeenCalled()
    expect(currentRun()!.result!.board.state).toBe('none')
  })
})
