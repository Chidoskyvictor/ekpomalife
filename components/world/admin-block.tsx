'use client'

import { useEffect, useMemo, useState } from 'react'
import { Box3, MeshStandardMaterial, Vector3, type BufferGeometry, type Mesh } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { meshoptDecoder } from '@/lib/game/meshopt'
import type { LocationRecord } from '@/lib/game/types'
import { Block } from './materials'

const MODEL_URL = '/models/admin-block.glb?v=meshopt2'

const paintedMaterial = (color: string, roughness: number) =>
  new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.12, roughness, flatShading: true, toneMapped: false })

const wallMaterial = paintedMaterial('#cfae8a', 0.85)

const PART_MATERIALS: Record<string, MeshStandardMaterial> = {
  glass: paintedMaterial('#1a1a1a', 0.3),
  frame: paintedMaterial('#b3261e', 0.6),
  roof: paintedMaterial('#141414', 0.7),
}

type Part = { geometry: BufferGeometry; material: MeshStandardMaterial }

let modelPromise: Promise<{ parts: Part[]; size: Vector3 } | null> | null = null

function loadModel() {
  modelPromise ??= meshoptDecoder
    .then((decoder) => {
      const loader = new GLTFLoader()
      loader.setMeshoptDecoder(decoder)
      return loader.loadAsync(MODEL_URL)
    })
    .then(({ scene }) => {
      const parts: Part[] = []
      scene.traverse((object) => {
        const mesh = object as Mesh
        if (mesh.isMesh) {
          const name = (mesh.material as MeshStandardMaterial).name
          parts.push({ geometry: mesh.geometry, material: PART_MATERIALS[name] ?? wallMaterial })
        }
      })
      return { parts, size: new Box3().setFromObject(scene).getSize(new Vector3()) }
    })
    .catch(() => null)
  return modelPromise
}

export function AdminBlock({ location }: { location: LocationRecord }) {
  const [w, h, d] = location.size
  const [model, setModel] = useState<Awaited<ReturnType<typeof loadModel>>>(null)

  useEffect(() => {
    let active = true
    loadModel().then((loaded) => {
      if (active) setModel(loaded)
    })
    return () => {
      active = false
    }
  }, [])

  const scale = useMemo(() => (model ? Math.min(w / model.size.x, d / model.size.z) : 1), [model, w, d])

  return (
    <group>
      <Block position={[0, 0.06, 0]} size={[w + 0.8, 0.12, d + 0.8]} color="#e9eef5" />
      {model ? (
        <group position={[0, 0.12, 0]} scale={scale}>
          {model.parts.map((part, index) => (
            <mesh key={index} geometry={part.geometry} material={part.material} castShadow receiveShadow />
          ))}
        </group>
      ) : (
        <Block position={[0, 0.12 + h / 2, 0]} size={[w, h, d]} color="#cfae8a" />
      )}
    </group>
  )
}
