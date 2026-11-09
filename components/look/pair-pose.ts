import { Quaternion, Vector3, type Object3D } from 'three'

/*
 * Paired affectionate poses (hug, kiss, cuddle, hold hands, slow dance), posed procedurally on the
 * rigged skeleton on top of the idle clip: no extra baked clips, works on the male and female rig.
 * Each arm segment is aimed at a direction given in the character's own space (x = its left,
 * y = up, z = forward) so the result doesn't depend on how the bones happen to be oriented.
 * If the bones can't be found, nothing is applied and the figure just idles (graceful fallback).
 */

export type PairPose = 'hug' | 'cheek' | 'kiss' | 'slowdance' | 'cuddle-l' | 'cuddle-r' | 'hands-l' | 'hands-r'

export const PAIR_POSE_IDS: readonly string[] = ['hug', 'cheek', 'kiss', 'slowdance', 'cuddle-l', 'cuddle-r', 'hands-l', 'hands-r']
export const isPairPose = (pose: string | null | undefined): pose is PairPose => !!pose && PAIR_POSE_IDS.includes(pose)

type Dir = [number, number, number]
type ArmAim = { upper: Dir; lower: Dir }
type Aim = {
  l?: ArmAim
  r?: ArmAim
  /** Head turn (yaw) / tilt (roll) / nod (pitch), degrees, in character space. */
  head?: [yaw: number, roll: number, pitch: number]
  /** Lean of the upper body toward the partner: roll about the forward axis (deg, + = toward the character's left) and pitch. */
  lean?: [roll: number, pitch: number]
  sway?: number
}

export function aimFor(pose: PairPose): Aim {
  switch (pose) {
    case 'hug':
      // Arms go round the other's back: forward-out then in
      return {
        l: { upper: [0.42, 0.3, 0.85], lower: [-0.7, 0.1, 0.7] },
        r: { upper: [-0.42, 0.3, 0.85], lower: [0.7, 0.1, 0.7] },
        head: [0, 12, 8],
        lean: [0, 6],
      }
    case 'kiss':
      return {
        l: { upper: [0.45, 0.2, 0.85], lower: [-0.6, 0.35, 0.7] },
        r: { upper: [-0.4, 0.45, 0.8], lower: [0.55, 0.55, 0.6] },
        head: [0, 8, 14],
        lean: [0, 8],
      }
    case 'cheek':
      return {
        l: { upper: [0.5, 0.25, 0.8], lower: [-0.55, 0.45, 0.65] },
        head: [28, 6, 4],
        lean: [4, 5],
      }
    case 'slowdance':
      return {
        l: { upper: [0.4, -0.05, 0.9], lower: [-0.3, 0.15, 0.95] },
        r: { upper: [-0.4, -0.05, 0.9], lower: [0.3, 0.15, 0.95] },
        head: [0, 8, 4],
        sway: 5,
      }
    case 'cuddle-l':
    case 'cuddle-r': {
      // Arm round the partner's back on their side; head resting toward them
      const s = pose === 'cuddle-l' ? 1 : -1
      const arm: ArmAim = { upper: [s * 0.85, 0.2, -0.3], lower: [s * 0.9, 0.05, 0.35] }
      return { [s === 1 ? 'l' : 'r']: arm, head: [0, s * 14, 6], lean: [s * 6, 4] }
    }
    case 'hands-l':
    case 'hands-r': {
      const s = pose === 'hands-l' ? 1 : -1
      const arm: ArmAim = { upper: [s * 0.5, -0.85, 0.15], lower: [s * 0.4, -0.85, 0.3] }
      return { [s === 1 ? 'l' : 'r']: arm, head: [s * 12, 0, 0] }
    }
  }
}

export type PairBones = {
  upperL: Object3D
  lowerL: Object3D
  handL: Object3D
  upperR: Object3D
  lowerR: Object3D
  handR: Object3D
  spine: Object3D | null
  chest: Object3D | null
  head: Object3D | null
}

const find = (root: Object3D, re: RegExp): Object3D | null => {
  let hit: Object3D | null = null
  root.traverse((o) => {
    if (!hit && (o as { isBone?: boolean }).isBone && re.test(o.name.replace(/[\s._-]/g, ''))) hit = o
  })
  return hit
}

/** The bones this needs (names like UpperArm.L, which GLTF turns into UpperArmL), or null for a different rig. */
export function findPairBones(root: Object3D): PairBones | null {
  const upperL = find(root, /^upperarml$/i)
  const lowerL = find(root, /^lowerarml$/i)
  const handL = find(root, /^handl$/i)
  const upperR = find(root, /^upperarmr$/i)
  const lowerR = find(root, /^lowerarmr$/i)
  const handR = find(root, /^handr$/i)
  if (!upperL || !lowerL || !handL || !upperR || !lowerR || !handR) return null
  return { upperL, lowerL, handL, upperR, lowerR, handR, spine: find(root, /^spine$/i), chest: find(root, /^chest$/i), head: find(root, /^head$/i) }
}

const wp = new Vector3()
const wq = new Quaternion()
const tmpA = new Vector3()
const tmpB = new Vector3()
const qa = new Quaternion()
const qb = new Quaternion()
const qc = new Quaternion()

/** Rotate `bone` (in the world) by `world`, blended in by `w` on top of whatever pose it has now. */
function rotateWorld(bone: Object3D, world: Quaternion, w: number) {
  bone.parent?.updateWorldMatrix(true, false)
  const p = bone.parent ? bone.parent.getWorldQuaternion(qa) : qa.identity()
  // L' = P^-1 * R * P * L
  qb.copy(p).invert().multiply(world).multiply(p).multiply(bone.quaternion)
  bone.quaternion.slerp(qb, w)
}

/** Turn `bone` so the direction toward `child` points along `dir` (world). */
function aimBone(bone: Object3D, child: Object3D, dir: Vector3, w: number) {
  bone.updateWorldMatrix(true, false)
  child.updateWorldMatrix(true, false)
  tmpA.setFromMatrixPosition(bone.matrixWorld)
  tmpB.setFromMatrixPosition(child.matrixWorld).sub(tmpA)
  if (tmpB.lengthSq() < 1e-8) return
  qc.setFromUnitVectors(tmpB.normalize(), dir)
  rotateWorld(bone, qc, w)
}

const dirOf = (frame: Quaternion, d: Dir) => wp.set(d[0], d[1], d[2]).normalize().applyQuaternion(frame).clone()

/**
 * Pose the skeleton. `frame` = the figure's orientation in the world (heading); `w` = 0..1 blend
 * (fades in and out); `t` = seconds (for the slow dance sway).
 */
export function applyPairPose(bones: PairBones, pose: PairPose, frame: Quaternion, w: number, t: number) {
  if (w <= 0.001) return
  const aim = aimFor(pose)
  const rad = Math.PI / 180
  const axis = (v: Dir) => tmpA.set(v[0], v[1], v[2]).applyQuaternion(frame).clone()

  // Body first (spine/chest/head), arms after so they follow the lean
  if (aim.lean || aim.sway) {
    const [roll, pitch] = aim.lean ?? [0, 0]
    const sway = (aim.sway ?? 0) * Math.sin(t * 1.8)
    if (bones.spine) {
      wq.setFromAxisAngle(axis([0, 0, 1]), (-roll + sway) * rad * 0.5).multiply(qc.setFromAxisAngle(axis([1, 0, 0]), pitch * rad * 0.5))
      rotateWorld(bones.spine, wq.clone(), w)
    }
    if (bones.chest) {
      wq.setFromAxisAngle(axis([0, 0, 1]), (-roll + sway) * rad * 0.5).multiply(qc.setFromAxisAngle(axis([1, 0, 0]), pitch * rad * 0.5))
      rotateWorld(bones.chest, wq.clone(), w)
    }
  }
  if (aim.head && bones.head) {
    const [yaw, roll, pitch] = aim.head
    wq.setFromAxisAngle(axis([0, 1, 0]), yaw * rad)
      .multiply(qc.setFromAxisAngle(axis([0, 0, 1]), -roll * rad))
      .multiply(qc.setFromAxisAngle(axis([1, 0, 0]), pitch * rad))
    rotateWorld(bones.head, wq.clone(), w)
  }
  if (aim.l) {
    aimBone(bones.upperL, bones.lowerL, dirOf(frame, aim.l.upper), w)
    aimBone(bones.lowerL, bones.handL, dirOf(frame, aim.l.lower), w)
  }
  if (aim.r) {
    aimBone(bones.upperR, bones.lowerR, dirOf(frame, aim.r.upper), w)
    aimBone(bones.lowerR, bones.handR, dirOf(frame, aim.r.lower), w)
  }
}
