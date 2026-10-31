'use client'

import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  Color,
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  Object3D,
  type BufferGeometry,
  type Group,
  type InstancedMesh,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { BUSH_SPOTS, PALM_SPOTS, STREET_LAMPS, type SceneryProp } from '@/lib/game/world-scenery'
import { WORLD, mulberry32 } from '@/lib/game/world-layout'

const PALM_H = 3.4
const PALM_GREENS = ['#4E8F3A', '#5C9E3F', '#3F7F35', '#6BA544']
const BUSH_GREENS = ['#5A9A4A', '#4C8A40', '#6AA857', '#3E7A3A']
/** Hibiscus / ixora dots mixed into the hedges */
const BUSH_FLOWERS = ['#E0567A', '#F2B33D', '#D9443A']

/** Slightly bent trunk (taller than wide, tapering). */
function trunkGeometry() {
  const geo = new CylinderGeometry(0.11, 0.2, PALM_H, 6, 4)
  geo.translate(0, PALM_H / 2, 0)
  const pos = geo.attributes.position!
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    pos.setX(i, pos.getX(i) + 0.32 * (y / PALM_H) ** 2)
  }
  geo.computeVertexNormals()
  return geo
}

/** Seven drooping fronds + a small coconut cluster, merged into one mesh. */
function crownGeometry() {
  const parts: BufferGeometry[] = []
  const fronds = 7
  for (let i = 0; i < fronds; i++) {
    const frond = new ConeGeometry(0.28, 2.1, 3)
    frond.scale(1, 1, 0.25)
    frond.translate(0, 1.05, 0)
    frond.rotateZ(-1.35 - (i % 2) * 0.3)
    frond.rotateY((i / fronds) * Math.PI * 2)
    parts.push(frond)
  }
  const nuts = new IcosahedronGeometry(0.17, 0)
  nuts.translate(0, -0.12, 0)
  parts.push(nuts)
  const merged = mergeGeometries(parts.map((p) => p.toNonIndexed()))!
  merged.translate(0.32, PALM_H, 0)
  merged.computeVertexNormals()
  return merged
}

function useInstances(
  ref: React.RefObject<InstancedMesh | null>,
  props: SceneryProp[],
  place: (prop: SceneryProp, dummy: Object3D) => void,
  colorFor: (prop: SceneryProp) => string,
) {
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const dummy = new Object3D()
    const color = new Color()
    props.forEach((prop, i) => {
      dummy.position.set(prop.x, 0, prop.z)
      dummy.rotation.set(0, prop.rot, 0)
      dummy.scale.setScalar(prop.s)
      place(prop, dummy)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      mesh.setColorAt(i, color.set(colorFor(prop)))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [ref, props, place, colorFor])
}

const noPlace = () => {}
const trunkColor = (p: SceneryProp) => (p.tint > 0.5 ? '#8A6A48' : '#7A5C3E')
const crownColor = (p: SceneryProp) => PALM_GREENS[Math.floor(p.tint * PALM_GREENS.length)]!
const bushColor = (p: SceneryProp) =>
  p.tint > 0.9
    ? BUSH_FLOWERS[Math.floor(((p.tint - 0.9) / 0.1) * BUSH_FLOWERS.length) % BUSH_FLOWERS.length]!
    : BUSH_GREENS[Math.floor((p.tint / 0.9) * BUSH_GREENS.length) % BUSH_GREENS.length]!
const squashBush = (p: SceneryProp, dummy: Object3D) => {
  dummy.position.y = 0.22 * p.s
  dummy.scale.set(p.s * 1.15, p.s * 0.72, p.s)
}

function Palms({ props, shadows }: { props: SceneryProp[]; shadows: boolean }) {
  const trunk = useMemo(() => trunkGeometry(), [])
  const crown = useMemo(() => crownGeometry(), [])
  const trunkRef = useRef<InstancedMesh>(null)
  const crownRef = useRef<InstancedMesh>(null)
  useInstances(trunkRef, props, noPlace, trunkColor)
  useInstances(crownRef, props, noPlace, crownColor)

  return (
    <group>
      <instancedMesh ref={trunkRef} args={[trunk, undefined, props.length]} castShadow={shadows} frustumCulled={false}>
        <meshStandardMaterial roughness={0.9} flatShading />
      </instancedMesh>
      <instancedMesh ref={crownRef} args={[crown, undefined, props.length]} castShadow={shadows} frustumCulled={false}>
        <meshStandardMaterial roughness={0.8} flatShading />
      </instancedMesh>
    </group>
  )
}

function Bushes({ props, shadows }: { props: SceneryProp[]; shadows: boolean }) {
  const geo = useMemo(() => new IcosahedronGeometry(0.55, 0), [])
  const ref = useRef<InstancedMesh>(null)
  useInstances(ref, props, squashBush, bushColor)

  return (
    <instancedMesh ref={ref} args={[geo, undefined, props.length]} receiveShadow={shadows} frustumCulled={false}>
      <meshStandardMaterial roughness={0.85} flatShading />
    </instancedMesh>
  )
}

/** Street lamps — heads and ground pools glow once the sun goes down. */
function Lamps({ night }: { night: boolean }) {
  const post = useMemo(() => {
    const pole = new CylinderGeometry(0.05, 0.07, 2.2, 6)
    pole.translate(0, 1.1, 0)
    const arm = new CylinderGeometry(0.035, 0.035, 0.7, 5)
    arm.rotateZ(Math.PI / 2)
    arm.translate(0.33, 2.17, 0)
    return mergeGeometries([pole.toNonIndexed(), arm.toNonIndexed()])!
  }, [])
  const head = useMemo(() => {
    const geo = new CylinderGeometry(0.12, 0.2, 0.12, 8)
    geo.translate(0.66, 2.1, 0)
    return geo
  }, [])
  const pool = useMemo(() => {
    const geo = new CylinderGeometry(1.5, 1.5, 0.01, 18)
    geo.translate(0.9, 0.09, 0)
    return geo
  }, [])
  const postRef = useRef<InstancedMesh>(null)
  const headRef = useRef<InstancedMesh>(null)
  const poolRef = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const dummy = new Object3D()
    STREET_LAMPS.forEach((lamp, i) => {
      dummy.position.set(lamp.x, 0, lamp.z)
      dummy.rotation.set(0, lamp.rot, 0)
      dummy.updateMatrix()
      for (const mesh of [postRef.current, headRef.current, poolRef.current]) mesh?.setMatrixAt(i, dummy.matrix)
    })
    for (const mesh of [postRef.current, headRef.current, poolRef.current]) {
      if (mesh) mesh.instanceMatrix.needsUpdate = true
    }
  }, [night])

  const count = STREET_LAMPS.length
  return (
    <group>
      <instancedMesh ref={postRef} args={[post, undefined, count]} frustumCulled={false}>
        <meshStandardMaterial color="#5E666E" roughness={0.6} metalness={0.3} />
      </instancedMesh>
      <instancedMesh ref={headRef} args={[head, undefined, count]} frustumCulled={false}>
        <meshStandardMaterial
          color={night ? '#FFE8B0' : '#D9DDE0'}
          emissive="#FFC766"
          emissiveIntensity={night ? 1.6 : 0}
          roughness={0.4}
        />
      </instancedMesh>
      {night ? (
        <instancedMesh ref={poolRef} args={[pool, undefined, count]} frustumCulled={false}>
          <meshBasicMaterial color="#FFC766" transparent opacity={0.22} depthWrite={false} />
        </instancedMesh>
      ) : null}
    </group>
  )
}

type Cloud = { x: number; z: number; y: number; s: number; speed: number; puffs: [number, number, number, number][] }

function makeClouds(count: number): Cloud[] {
  const rand = mulberry32(8088)
  return Array.from({ length: count }, () => ({
    x: WORLD.x - WORLD.w / 2 + rand() * WORLD.w,
    z: WORLD.z - WORLD.d / 2 + rand() * WORLD.d,
    y: 24 + rand() * 8,
    s: 0.8 + rand() * 0.7,
    speed: 0.8 + rand() * 0.8,
    puffs: Array.from({ length: 4 + Math.floor(rand() * 3) }, (_, i) => [
      (i - 2) * 1.6 + (rand() - 0.5),
      rand() * 0.6,
      (rand() - 0.5) * 2,
      1.3 + rand() * 1.1,
    ]),
  }))
}

/** Puffy low-poly clouds drifting east, wrapping around the world bounds. */
function Clouds({ count, night }: { count: number; night: boolean }) {
  const clouds = useMemo(() => makeClouds(count), [count])
  const puff = useMemo(() => new IcosahedronGeometry(1, 1), [])
  const refs = useRef<(Group | null)[]>([])
  const west = WORLD.x - WORLD.w / 2 - 40
  const span = WORLD.w + 80

  useFrame((_, delta) => {
    clouds.forEach((cloud, i) => {
      const group = refs.current[i]
      if (!group) return
      group.position.x = west + ((group.position.x - west + cloud.speed * delta) % span)
    })
  })

  return (
    <group>
      {clouds.map((cloud, i) => (
        <group
          key={i}
          ref={(node) => {
            refs.current[i] = node
          }}
          position={[cloud.x, cloud.y, cloud.z]}
          scale={[cloud.s * 2.2, cloud.s, cloud.s * 1.4]}
        >
          {cloud.puffs.map(([px, py, pz, r], j) => (
            <mesh key={j} geometry={puff} position={[px, py, pz]} scale={r}>
              <meshStandardMaterial
                color={night ? '#7D8CA3' : '#FFFFFF'}
                roughness={1}
                flatShading
                transparent
                opacity={night ? 0.45 : 0.88}
              />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

/** Palms, hedges, street lamps and clouds — pure decoration, no hit targets. */
export function WorldScenery({ mobile, night }: { mobile: boolean; night: boolean }) {
  const palms = useMemo(() => (mobile ? PALM_SPOTS.filter((_, i) => i % 2 === 0) : PALM_SPOTS), [mobile])
  const bushes = useMemo(() => (mobile ? BUSH_SPOTS.filter((_, i) => i % 2 === 0) : BUSH_SPOTS), [mobile])

  return (
    <group>
      <Palms props={palms} shadows={!mobile} />
      <Bushes props={bushes} shadows={!mobile} />
      <Lamps night={night} />
      <Clouds count={mobile ? 4 : 8} night={night} />
    </group>
  )
}

