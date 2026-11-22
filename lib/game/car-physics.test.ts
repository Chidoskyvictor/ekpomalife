import { describe, expect, it } from 'vitest'
import { bodyFor, boxPoints, bumpHeight, crashStrength, drive, gripLimit, idealYaw, moveBox, newBody, springStep, suspend, wheelAngleFor, type Blocked, type Pedals, type Tune } from './car-physics'

const TUNE: Tune = { top: 50, topGrass: 11, gas: 6, reverse: 7, brake: 30, drag: 6 }
const DT = 1 / 60
const coast: Pedals = { gas: false, brake: false, steer: 0 }
const gas: Pedals = { gas: true, brake: false, steer: 0 }

describe('bicycle steering', () => {
  it('turns the wheels less as speed rises', () => {
    expect(wheelAngleFor(1, 2)).toBeGreaterThan(wheelAngleFor(1, 15))
    expect(wheelAngleFor(1, 15)).toBeGreaterThan(wheelAngleFor(1, 50))
    expect(wheelAngleFor(-1, 5)).toBeCloseTo(-wheelAngleFor(1, 5))
  })
  it('turns at v / wheelbase * tan(angle)', () => {
    expect(idealYaw(0.3, 5, 2.5)).toBeCloseTo((5 / 2.5) * Math.tan(0.3))
    expect(idealYaw(0, 20, 2.5)).toBe(0)
  })
  it('crawling with full lock follows a circle near the geometric radius', () => {
    const car = bodyFor('corolla')
    const b = newBody(0, 0, 0)
    b.v = 3
    b.steer = 1
    for (let i = 0; i < 20; i++) drive(b, { gas: false, brake: false, steer: 1 }, car, { ...TUNE, drag: 0 }, 'road', DT)
    const angle = b.wheelAngle
    expect(angle).toBeGreaterThan(0.4)
    expect(1 / (idealYaw(angle, 1, car.wheelbase))).toBeLessThan(6) // under a 6 m turning circle radius
  })
  it('does not turn while standing still', () => {
    const b = newBody(0, 0, 0)
    const r = drive(b, { gas: false, brake: false, steer: 1 }, bodyFor('camry'), TUNE, 'road', DT)
    expect(r.h).toBe(0)
  })
  it('reverses the turn when backing up', () => {
    const b = newBody(0, 0, 0)
    b.v = -3
    b.steer = 1
    const r = drive(b, { gas: false, brake: false, steer: 1 }, bodyFor('camry'), TUNE, 'road', DT)
    expect(r.h).toBeLessThan(0)
  })
})

describe('grip', () => {
  it('4WD holds more than front drive, and loose ground less than tarmac', () => {
    expect(gripLimit('awd', 'road', false)).toBeGreaterThan(gripLimit('fwd', 'road', false))
    expect(gripLimit('fwd', 'grass', false)).toBeLessThan(gripLimit('fwd', 'road', false))
    expect(gripLimit('fwd', 'road', true)).toBeLessThan(gripLimit('fwd', 'road', false))
    expect(gripLimit('awd', 'road', true)).toBe(gripLimit('awd', 'road', false))
  })
  it('a hard turn at speed is clipped to what the tyres hold, and slides wide', () => {
    const car = bodyFor('corolla')
    const b = newBody(0, 0, 0)
    b.v = 30
    b.steer = 1
    const r = drive(b, { gas: false, brake: false, steer: 1 }, car, TUNE, 'road', DT)
    expect(Math.abs(r.aLat)).toBeLessThanOrEqual(gripLimit('fwd', 'road', false) + 0.5)
    expect(b.vl).toBeLessThan(0) // pushed to the outside of a left turn
  })
  it('front drive slides wider than 4WD for the same corner', () => {
    const run = (id: string) => {
      const b = newBody(0, 0, 0)
      b.v = 30
      b.steer = 1
      for (let i = 0; i < 30; i++) drive(b, { gas: false, brake: false, steer: 1 }, bodyFor(id), TUNE, 'road', DT)
      return Math.abs(b.vl)
    }
    expect(run('corolla')).toBeGreaterThan(run('gla'))
  })
})

describe('pedals', () => {
  it('pulls away, then settles at the top speed', () => {
    const b = newBody(0, 0, 0)
    const car = bodyFor('camry')
    for (let i = 0; i < 60 * 40; i++) drive(b, gas, car, TUNE, 'road', DT)
    expect(b.v).toBeGreaterThan(TUNE.top * 0.9)
    expect(b.v).toBeLessThanOrEqual(TUNE.top + 0.01)
  })
  it('is held to the grass top speed off the tarmac', () => {
    const b = newBody(0, 0, 0)
    b.v = 40
    for (let i = 0; i < 60 * 5; i++) drive(b, gas, bodyFor('camry'), TUNE, 'grass', DT)
    expect(b.v).toBeLessThan(TUNE.topGrass + 0.5)
    expect(b.v).toBeGreaterThan(0)
  })
  it('brakes, then rolls backwards while the brake is held', () => {
    const b = newBody(0, 0, 0)
    b.v = 10
    for (let i = 0; i < 60 * 8; i++) drive(b, { gas: false, brake: true, steer: 0 }, bodyFor('camry'), TUNE, 'road', DT)
    expect(b.v).toBeLessThan(0)
    expect(b.v).toBeGreaterThanOrEqual(-TUNE.reverse)
  })
  it('turns the wheels as it moves', () => {
    const b = newBody(0, 0, 0)
    b.v = 10
    drive(b, coast, bodyFor('corolla'), TUNE, 'road', 0.1)
    expect(b.spin).toBeCloseTo((9.4 / 0.31) * 0.1, 0)
  })
  it('a held car (parked, getting in) bleeds off its speed', () => {
    const b = newBody(0, 0, 0)
    b.v = 5
    for (let i = 0; i < 60; i++) drive(b, gas, bodyFor('corolla'), TUNE, 'road', DT, true)
    expect(b.v).toBe(0)
  })
})

describe('suspension', () => {
  it('springs settle on their target', () => {
    let pos = 0
    let vel = 0
    for (let i = 0; i < 300; i++) [pos, vel] = springStep(pos, vel, 0.05, DT)
    expect(pos).toBeCloseTo(0.05, 3)
  })
  it('noses down under braking, squats under power, and rolls out of a turn', () => {
    const brake = newBody(0, 0, 0)
    const power = newBody(0, 0, 0)
    const left = newBody(0, 0, 0)
    for (let i = 0; i < 90; i++) {
      suspend(brake, -20, 0, 0, DT)
      suspend(power, 6, 0, 0, DT)
      suspend(left, 0, 8, 0, DT)
    }
    expect(brake.pitch).toBeGreaterThan(0)
    expect(power.pitch).toBeLessThan(0)
    expect(left.roll).toBeGreaterThan(0)
    expect(Math.abs(brake.pitch)).toBeLessThan(0.15)
  })
  it('rough ground is bumpy, in a small range, and the same each time', () => {
    let max = 0
    for (let i = 0; i < 400; i++) max = Math.max(max, Math.abs(bumpHeight(i * 1.3, i * 0.7)))
    expect(max).toBeGreaterThan(0.01)
    expect(max).toBeLessThan(0.15)
    expect(bumpHeight(3, 4)).toBe(bumpHeight(3, 4))
  })
})

/** Run the car for a while against a world; returns the strongest hit. */
function runInto(world: Blocked, b: ReturnType<typeof newBody>, pedals: Pedals, car = bodyFor('camry'), frames = 240) {
  let worst = 0
  for (let i = 0; i < frames; i++) {
    const r = drive(b, pedals, car, TUNE, 'road', DT)
    worst = Math.max(worst, moveBox(b, r.x, r.z, r.h, car, world))
  }
  return worst
}

const insideBox = (b: { x: number; z: number; h: number }, world: Blocked, car = bodyFor('camry')) =>
  boxPoints(car).some(([l, f]) => world(b.x + l * Math.cos(b.h) + f * Math.sin(b.h), b.z - l * Math.sin(b.h) + f * Math.cos(b.h)))

describe('collisions', () => {
  const wall: Blocked = (x) => x > 10 // a wall along x = 10

  it('a free move is untouched', () => {
    const b = newBody(0, 0, 0)
    expect(moveBox(b, 1, 2, 0.1, bodyFor('corolla'), wall)).toBe(0)
    expect([b.x, b.z, b.h]).toEqual([1, 2, 0.1])
  })

  it('hitting a wall at an angle slides along it, losing some speed, and never ends inside it', () => {
    const b = newBody(0, 0, 0.5) // heading mostly +z, leaning into the wall at +x
    b.v = 20
    const worst = runInto(wall, b, gas)
    expect(worst).toBeGreaterThan(1)
    expect(insideBox(b, wall)).toBe(false)
    expect(b.z).toBeGreaterThan(30) // kept travelling along the wall
    expect(b.v).toBeLessThan(TUNE.top * 0.8)
  })

  it('hitting a wall head on stops it without sticking: reversing works', () => {
    const b = newBody(5, 0, Math.PI / 2) // heading +x straight at the wall
    b.v = 25
    runInto(wall, b, coast)
    expect(insideBox(b, wall)).toBe(false)
    expect(Math.abs(b.v)).toBeLessThan(6)
    runInto(wall, b, { gas: false, brake: true, steer: 0 }, bodyFor('camry'), 240)
    expect(b.x).toBeLessThan(8) // backed away
  })

  it('driving on into a wall does not creep through', () => {
    const b = newBody(0, 0, 1.2)
    runInto(wall, b, gas, bodyFor('camry'), 60 * 20)
    expect(insideBox(b, wall)).toBe(false)
  })

  it('a parked car already touching a wall can drive out of it', () => {
    const car = bodyFor('camry')
    const b = newBody(10 - car.width / 2 + 0.2, 0, 0) // right side already past the line
    expect(insideBox(b, wall)).toBe(true)
    b.v = 3
    runInto(wall, b, gas, car, 120)
    expect(b.z).toBeGreaterThan(5)
  })

  it('squeezing between two cars (circles) keeps moving instead of sticking', () => {
    const cars = [[5, 20], [-5, 20]]
    const world: Blocked = (x, z) => cars.some(([cx, cz]) => Math.hypot(x - cx!, z - cz!) < 2.1)
    const b = newBody(0, 0, 0)
    b.v = 8
    runInto(world, b, gas, bodyFor('corolla'), 60 * 6)
    expect(b.z).toBeGreaterThan(30) // through the gap
  })

  it('a corner clipping a pillar swings the nose and carries on', () => {
    const pillar: Blocked = (x, z) => Math.hypot(x - 1.4, z - 10) < 1
    const b = newBody(0, 0, 0)
    b.v = 12
    const worst = runInto(pillar, b, gas, bodyFor('camry'), 120)
    expect(worst).toBeGreaterThan(0)
    expect(Math.abs(b.h)).toBeGreaterThan(0.01)
    expect(b.z).toBeGreaterThan(15)
  })
})

describe('crash feel', () => {
  it('scales from nothing to full', () => {
    expect(crashStrength(0.5)).toBe(0)
    expect(crashStrength(8)).toBeGreaterThan(0.3)
    expect(crashStrength(8)).toBeLessThan(crashStrength(14))
    expect(crashStrength(40)).toBe(1)
  })
})
