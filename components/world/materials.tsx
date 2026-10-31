'use client'

import { useThree } from '@react-three/fiber'
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { BoxGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, type Group, type Material } from 'three'

export const unitBox = new BoxGeometry(1, 1, 1)

const materialCache = new globalThis.Map<string, MeshStandardMaterial>()

const GLASS = '#A6D7E6'
const BUILDING = '#F7F5EE'

export function paint(color: string, roughness = 0.82) {
  const key = `${color}:${roughness}`
  let material = materialCache.get(key)
  if (!material) {
    material = new MeshStandardMaterial({ color, roughness, metalness: 0.02 })
    materialCache.set(key, material)
  }
  return material
}

let glassMaterial: MeshStandardMaterial | undefined

export function glass(): MeshStandardMaterial {
  if (!glassMaterial) {
    glassMaterial = new MeshStandardMaterial({
      color: GLASS,
      roughness: 0.28,
      metalness: 0.12,
      emissive: GLASS,
      emissiveIntensity: 0.04,
    })
  }
  return glassMaterial
}

type BatchEntry = { material: Material; shadow: boolean; items: Map<number, Matrix4> }

/**
 * Collects every static `<Block>` under it and draws them as one InstancedMesh per
 * (material, castShadow) pair — a handful of draw calls instead of one per box.
 * Same geometry, material, transform and shadow flags, so the scene looks identical.
 */
class BlockBatchStore {
  entries = new Map<string, BatchEntry>()
  version = 0
  private nextId = 1
  private listeners = new Set<() => void>()
  private dirty = false

  id = () => this.nextId++

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => void this.listeners.delete(listener)
  }

  getVersion = () => this.version

  private bump() {
    if (this.dirty) return
    this.dirty = true
    // Coalesce a whole commit's worth of blocks into one rebuild
    queueMicrotask(() => {
      this.dirty = false
      this.version++
      this.listeners.forEach((listener) => listener())
    })
  }

  set(id: number, material: Material, shadow: boolean, matrix: Matrix4) {
    const key = `${material.uuid}|${shadow ? 1 : 0}`
    for (const [k, entry] of this.entries) {
      if (k !== key && entry.items.delete(id)) this.bump()
    }
    let entry = this.entries.get(key)
    if (!entry) {
      entry = { material, shadow, items: new Map() }
      this.entries.set(key, entry)
    }
    const prev = entry.items.get(id)
    if (prev && prev.equals(matrix)) return
    entry.items.set(id, matrix.clone())
    this.bump()
  }

  remove(id: number) {
    for (const entry of this.entries.values()) if (entry.items.delete(id)) this.bump()
  }
}

const BlockBatchContext = createContext<BlockBatchStore | null>(null)

function BatchMesh({ entry, version }: { entry: BatchEntry; version: number }) {
  const [capacity, setCapacity] = useState(() => Math.max(16, entry.items.size))
  const ref = useRef<InstancedMesh>(null)
  const invalidate = useThree((state) => state.invalidate)
  useEffect(() => {
    if (entry.items.size > capacity) setCapacity(Math.max(entry.items.size, capacity * 2))
  }, [entry, version, capacity])
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    let i = 0
    for (const matrix of entry.items.values()) {
      if (i >= capacity) break
      mesh.setMatrixAt(i++, matrix)
    }
    mesh.count = i
    mesh.instanceMatrix.needsUpdate = true
    // Bounds over all instances so frustum culling stays correct
    mesh.boundingSphere = null
    mesh.computeBoundingSphere()
    invalidate()
  }, [entry, version, capacity, invalidate])
  return (
    <instancedMesh
      key={capacity}
      ref={ref}
      args={[unitBox, entry.material, capacity]}
      castShadow={entry.shadow}
      receiveShadow
      matrixAutoUpdate={false}
    />
  )
}

export function BlockBatchProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => new BlockBatchStore())
  const version = useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion)
  return (
    <BlockBatchContext.Provider value={store}>
      {children}
      {[...store.entries.entries()].map(([key, entry]) => (
        <BatchMesh key={key} entry={entry} version={version} />
      ))}
    </BlockBatchContext.Provider>
  )
}

/** Batched Block: an empty transform node whose world matrix feeds the shared InstancedMesh. */
function BatchedBlock({
  store,
  position,
  size,
  material,
  shadow,
}: {
  store: BlockBatchStore
  position: [number, number, number]
  size: [number, number, number]
  material: Material
  shadow: boolean
}) {
  const ref = useRef<Group>(null)
  const [id] = useState(() => store.id())
  // Every render: parents (zone debug offsets) may have moved; set() ignores unchanged matrices
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    node.updateWorldMatrix(true, false)
    store.set(id, material, shadow, node.matrixWorld)
  })
  useEffect(() => () => store.remove(id), [store, id])
  return <group ref={ref} position={position} scale={size} />
}

export function Block({
  position,
  size,
  color,
  material,
  shadow = true,
}: {
  position: [number, number, number]
  size: [number, number, number]
  color?: string
  material?: MeshStandardMaterial
  shadow?: boolean
}) {
  const batch = useContext(BlockBatchContext)
  const resolved = material ?? paint(color ?? BUILDING)
  if (batch) {
    return <BatchedBlock store={batch} position={position} size={size} material={resolved} shadow={shadow} />
  }
  return (
    <mesh
      geometry={unitBox}
      material={resolved}
      position={position}
      scale={size}
      castShadow={shadow}
      receiveShadow
    />
  )
}
