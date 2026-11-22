/*
 * Car physics for the 3D drive: pure maths, no three.js, no React (unit-tested in car-physics.test.ts).
 *
 * World: metres, y up. Heading `h` is the angle from +z toward +x, so forward = (sin h, cos h) and
 * the car's left = (cos h, -sin h). Speeds are m/s, `v` forward and `vl` sideways (left positive).
 *
 *  - Bicycle-model steering: yaw rate = v / wheelbase * tan(wheel angle). The wheel angle shrinks
 *    with speed, and a turn that asks for more sideways grip than the tyres have is clipped
 *    (understeer) while the car slides a little wide.
 *  - The car is a box. Its corners and side points are tested against the world; a hit turns the
 *    velocity along the obstacle (with some speed lost) and pushes the car out, so it never sticks.
 *  - Springs give the body pitch (accelerating / braking), roll (cornering) and bounce (bumps).
 */

export type Drivetrain = 'fwd' | 'awd'

export type CarBody = {
  /** Body length and width, metres. */
  length: number
  width: number
  wheelbase: number
  wheelRadius: number
  drive: Drivetrain
}

const body = (length: number, width: number, wheelbase: number, wheelRadius: number, drive: Drivetrain = 'fwd'): CarBody => ({ length, width, wheelbase, wheelRadius, drive })

/** Real size per model (matches the drawn cars in components/cars/car-model.tsx). Benz-type cars are 4WD. */
export const CAR_BODIES: Record<string, CarBody> = {
  corolla: body(4.4, 1.72, 2.68, 0.31),
  camry: body(4.92, 1.84, 3.0, 0.33),
  es350: body(5.0, 1.87, 3.05, 0.34),
  gle43: body(4.86, 2.0, 2.95, 0.42, 'awd'),
  rx350: body(4.89, 1.92, 2.8, 0.38),
  gla: body(4.4, 1.85, 2.62, 0.37, 'awd'),
  scout: body(4.1, 1.8, 2.5, 0.38),
  suv: body(5.0, 1.95, 3.0, 0.4),
  gt3: body(4.6, 1.95, 2.7, 0.35),
}
export const bodyFor = (id: string): CarBody => CAR_BODIES[id] ?? CAR_BODIES.corolla!

/** What the tyres can hold sideways (m/s²) on tarmac, and how fast a slide dies away (1/s). */
export const GRIP = { fwd: { limit: 8.6, bite: 5 }, awd: { limit: 10.6, bite: 7 } } as const

export type Surface = 'road' | 'grass' | 'wall'

export type Body = {
  x: number
  z: number
  h: number
  /** Forward and sideways (left) speed. */
  v: number
  vl: number
  /** The wheel input eased toward the thumb, -1..1 (left positive). */
  steer: number
  /** The front wheels' angle (rad, left positive) and how far every wheel has turned (rad). */
  wheelAngle: number
  spin: number
  /** Suspension: body pitch (nose down positive), roll (leans right positive), and bounce height (m), with their rates. */
  pitch: number
  pitchV: number
  roll: number
  rollV: number
  bob: number
  bobV: number
}

export const newBody = (x: number, z: number, h: number): Body => ({ x, z, h, v: 0, vl: 0, steer: 0, wheelAngle: 0, spin: 0, pitch: 0, pitchV: 0, roll: 0, rollV: 0, bob: 0, bobV: 0 })

export type Pedals = { gas: boolean; brake: boolean; steer: number }

export type Tune = {
  /** Top speed on tarmac and on grass (m/s), forward pull (m/s²), reverse limit (m/s). */
  top: number
  topGrass: number
  gas: number
  reverse: number
  brake: number
  drag: number
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))
const sign = (n: number) => (n < 0 ? -1 : 1)

/** The front wheels' angle (rad) for a wheel input -1..1 at a given speed: wide when crawling, hardly any at full speed. */
export function wheelAngleFor(input: number, speed: number) {
  const max = 0.55 / (1 + (speed / 9) ** 2) + 0.02
  return clamp(input, -1, 1) * max
}

/** Bicycle model: how fast the heading turns (rad/s) for a wheel angle, speed and wheelbase. */
export const idealYaw = (angle: number, v: number, wheelbase: number) => (v / wheelbase) * Math.tan(angle)

/** Sideways grip (m/s²) of a car on a surface; hard on the throttle in a front-driver takes some away. */
export function gripLimit(drive: Drivetrain, surface: Surface, throttle: boolean) {
  const g = GRIP[drive].limit * (surface === 'grass' ? 0.62 : 1)
  return drive === 'fwd' && throttle ? g * 0.9 : g
}

/** A critically-ish damped spring: moves `pos` toward `target`, returns the new [pos, vel]. */
export function springStep(pos: number, vel: number, target: number, dt: number, stiffness = 90, damping = 9): [number, number] {
  const acc = stiffness * (target - pos) - damping * vel
  const nv = vel + acc * dt
  return [pos + nv * dt, nv]
}

/** Gentle deterministic bumps for rough ground: a height (m) at a point, 0 on tarmac. */
export function bumpHeight(x: number, z: number) {
  return 0.5 * (Math.sin(x * 1.7 + Math.sin(z * 0.9) * 2) * Math.cos(z * 2.3 - x * 0.4) + Math.sin((x + z) * 4.1) * 0.35) * 0.09
}

export type StepResult = {
  /** Where the car wants to be after this step (before it is tested against the world). */
  x: number
  z: number
  h: number
  /** Longitudinal and sideways acceleration this step (for the suspension and the lights). */
  aLong: number
  aLat: number
}

/**
 * One physics step of driving: pedals → speed, thumb → wheel angle → turn, with grip loss.
 * Mutates `b` (speeds, wheel, spin) and returns the pose it would like to move to.
 * `held` locks the car (parked or getting in/out): the speed bleeds off.
 */
export function drive(b: Body, pedals: Pedals, car: CarBody, tune: Tune, surface: Surface, dt: number, held = false): StepResult {
  const onGrass = surface === 'grass'
  const top = onGrass ? tune.topGrass : tune.top
  const v0 = b.v

  // Pedals. 4WD pulls a touch harder and keeps pulling on loose ground.
  const pull = tune.gas * (car.drive === 'awd' ? (onGrass ? 1.0 : 1.06) : onGrass ? 0.8 : 1)
  if (pedals.gas && !held) b.v += pull * dt * Math.max(0.35, 1 - Math.abs(b.v) / (tune.top * 1.15))
  else if (pedals.brake && !held) b.v -= (b.v > 0.3 ? tune.brake : tune.gas * 0.7) * dt
  else b.v -= sign(b.v) * Math.min(Math.abs(b.v), (tune.drag + (onGrass ? 3.2 : 0)) * dt)
  if (b.v > top) b.v = Math.max(top, b.v - tune.brake * 0.6 * dt)
  if (b.v < -tune.reverse) b.v = -tune.reverse
  if (held) b.v = sign(b.v) * Math.max(0, Math.abs(b.v) - tune.brake * dt)

  // The wheel eases toward the thumb; the front wheels turn less the faster you go
  b.steer += (pedals.steer - b.steer) * Math.min(1, dt * 6)
  const speed = Math.abs(b.v)
  b.wheelAngle = wheelAngleFor(b.steer, speed)

  // Turning: ideal yaw from the bicycle model, then limited by what the tyres can hold
  const yawIdeal = idealYaw(b.wheelAngle, b.v, car.wheelbase)
  const grip = gripLimit(car.drive, surface, pedals.gas)
  const maxYaw = grip / Math.max(speed, 1)
  const yaw = clamp(yawIdeal, -maxYaw, maxYaw)
  // The part the tyres could not do: the car slides wide of the turn, and scrubs speed
  const excess = (yawIdeal - yaw) * b.v
  b.vl -= excess * dt * (car.drive === 'awd' ? 0.45 : 0.7)
  b.vl *= Math.exp(-GRIP[car.drive].bite * (onGrass ? 0.7 : 1) * dt)
  b.vl = clamp(b.vl, -speed * 0.6 - 0.5, speed * 0.6 + 0.5)
  if (Math.abs(b.vl) > 0.4) b.v -= sign(b.v) * Math.min(speed, Math.abs(b.vl) * 0.35 * dt)

  // Move: along the heading plus the slide, turning by the mid-step heading
  const hMid = b.h + (yaw * dt) / 2
  const fx = Math.sin(hMid)
  const fz = Math.cos(hMid)
  const x = b.x + (fx * b.v + fz * b.vl) * dt
  const z = b.z + (fz * b.v - fx * b.vl) * dt
  const h = b.h + yaw * dt

  b.spin += (b.v / car.wheelRadius) * dt
  return { x, z, h, aLong: (b.v - v0) / Math.max(dt, 1e-4), aLat: yaw * b.v }
}

/** The body's springs: leans back when accelerating, dives when braking, rolls out of corners, bounces on rough ground. */
export function suspend(b: Body, aLong: number, aLat: number, bump: number, dt: number) {
  const pitchTarget = clamp(-aLong * 0.0075, -0.07, 0.09)
  const rollTarget = clamp(aLat * 0.0095, -0.09, 0.09)
  ;[b.pitch, b.pitchV] = springStep(b.pitch, b.pitchV, pitchTarget, dt, 85, 9)
  ;[b.roll, b.rollV] = springStep(b.roll, b.rollV, rollTarget, dt, 85, 9)
  ;[b.bob, b.bobV] = springStep(b.bob, b.bobV, bump, dt, 160, 13)
}

/* —— collisions —— */

/** Points on the box's edge, in the car frame [left, forward]: corners, the middle of each side and the ends. */
export function boxPoints(car: CarBody): [number, number][] {
  const w = car.width / 2
  const l = car.length / 2
  return [[w, l], [-w, l], [w, -l], [-w, -l], [w, 0], [-w, 0], [0, l], [0, -l], [w, l / 2], [-w, l / 2], [w, -l / 2], [-w, -l / 2]]
}

const worldOf = (x: number, z: number, h: number, left: number, fwd: number): [number, number] => {
  const s = Math.sin(h)
  const c = Math.cos(h)
  return [x + left * c + fwd * s, z - left * s + fwd * c]
}

export type Blocked = (x: number, z: number) => boolean

const DIRS: [number, number][] = Array.from({ length: 12 }, (_, i) => [Math.cos((i / 12) * Math.PI * 2), Math.sin((i / 12) * Math.PI * 2)])

/** Which way is open at a blocked point: a unit vector pointing out of the obstacle (null if there is none). */
export function openDirection(blocked: Blocked, x: number, z: number): [number, number] | null {
  let nx = 0
  let nz = 0
  for (const r of [0.5, 1.2]) {
    for (const [dx, dz] of DIRS) {
      const free = !blocked(x + dx * r, z + dz * r)
      nx += free ? dx : -dx
      nz += free ? dz : -dz
    }
  }
  const len = Math.hypot(nx, nz)
  return len < 1e-3 ? null : [nx / len, nz / len]
}

export type Impact = { speed: number }

const HITS = 12

/**
 * Move the box from its pose in `b` to (x, z, h), unless something is in the way. A hit turns the
 * velocity along the obstacle (some speed lost, a little twist from where it struck) and slides the
 * car along it; if it cannot be moved clear it stays where it was. Points already inside something
 * before the move do not count, so a car parked tight against a kerb can drive out.
 * Returns how hard it hit (m/s into the obstacle), 0 for a clean move.
 */
export function moveBox(b: Body, x: number, z: number, h: number, car: CarBody, blocked: Blocked): number {
  const pts = boxPoints(car)
  const wasIn = pts.map(([l, f]) => blocked(...worldOf(b.x, b.z, b.h, l, f)))
  const hitAt = (px: number, pz: number, ph: number) => {
    const hits: number[] = []
    for (let i = 0; i < HITS; i++) if (!wasIn[i] && blocked(...worldOf(px, pz, ph, pts[i]![0], pts[i]![1]))) hits.push(i)
    return hits
  }
  const hits = hitAt(x, z, h)
  if (!hits.length) {
    b.x = x
    b.z = z
    b.h = h
    return 0
  }

  // Which way out of the obstacle: summed over the points that struck
  let nx = 0
  let nz = 0
  let cx = 0
  let cz = 0
  for (const i of hits) {
    const [wx, wz] = worldOf(x, z, h, pts[i]![0], pts[i]![1])
    const open = openDirection(blocked, wx, wz)
    if (open) {
      nx += open[0]
      nz += open[1]
    }
    cx += wx - x
    cz += wz - z
  }
  let len = Math.hypot(nx, nz)
  if (len < 1e-3) {
    // Nothing to push against: straight back the way we came
    const sp = Math.hypot(x - b.x, z - b.z) || 1
    nx = -(x - b.x) / sp
    nz = -(z - b.z) / sp
    len = 1
  }
  nx /= len
  nz /= len

  const s = Math.sin(b.h)
  const c = Math.cos(b.h)
  // World velocity, then the part into the obstacle comes off (a little bounce) and the rest rubs
  let vx = s * b.v + c * b.vl
  let vz = c * b.v - s * b.vl
  const into = vx * nx + vz * nz
  let hitSpeed = 0
  if (into < 0) {
    hitSpeed = -into
    vx -= (1 + 0.18) * into * nx
    vz -= (1 + 0.18) * into * nz
    const keep = clamp(1 - (0.06 + hitSpeed * 0.012), 0.55, 0.95)
    const tx = vx - (vx * nx + vz * nz) * nx
    const tz = vz - (vx * nx + vz * nz) * nz
    vx = vx - tx + tx * keep
    vz = vz - tz + tz * keep
    // Twist: a hit out at a corner swings the nose; it is the car turning to lie along the obstacle
    const rx = cx / hits.length
    const rz = cz / hits.length
    b.h += clamp((rz * nx - rx * nz) * hitSpeed * 0.035, -0.22, 0.22) * (b.v >= 0 ? 1 : -1)
  }
  const s2 = Math.sin(b.h)
  const c2 = Math.cos(b.h)
  b.v = vx * s2 + vz * c2
  b.vl = vx * c2 - vz * s2

  // Slide: ease the box out along the open direction in small steps until nothing is struck
  let px = x
  let pz = z
  let ph = b.h
  for (let k = 0; k < 8 && hitAt(px, pz, ph).length; k++) {
    px += nx * 0.2
    pz += nz * 0.2
  }
  if (hitAt(px, pz, ph).length) {
    // Boxed in: stay put with the speed deflected, and try the next frame from there
    return hitSpeed
  }
  b.x = px
  b.z = pz
  return hitSpeed
}

/* —— crash feel —— */

/** How hard a hit is, 0..1, from the speed into the obstacle (m/s): a scrape is nothing, ~60 km/h or more is full. */
export const crashStrength = (hitSpeed: number) => clamp((hitSpeed - 1.2) / 15, 0, 1)

/** Vibration length (ms) for a hit of strength 0..1. */
export const crashVibration = (strength: number) => Math.round(25 + strength * 175)
