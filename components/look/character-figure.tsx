'use client'

import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Suspense, use, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react'
import {
  AnimationMixer,
  Box3,
  Bone,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  SkinnedMesh,
  Vector3,
  type AnimationAction,
  type AnimationClip,
  type Object3D,
} from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { HAIR_CONFIG, hairFitFor, type HairFit } from '@/lib/game/hair-config'
import { meshoptDecoder } from '@/lib/game/meshopt'
import {
  CHARACTER_GLB,
  HAIR_COLOR,
  SHOE_COLOR,
  SKIN,
  type Appearance,
  type HairId,
  type OutfitId,
} from '@/lib/game/look'

const colorCache = new Map<string, MeshStandardMaterial>()

function paint(color: string, roughness = 0.72) {
  let material = colorCache.get(color)
  if (!material) {
    material = new MeshStandardMaterial({ color, roughness, metalness: 0.02 })
    colorCache.set(color, material)
  }
  return material
}

function Limb({
  position,
  size,
  color,
}: {
  position: [number, number, number]
  size: [number, number, number]
  color: string
}) {
  return (
    <mesh position={position} castShadow material={paint(color)}>
      <capsuleGeometry args={[size[0], size[1], 4, 8]} />
    </mesh>
  )
}

function Hair({ id, body, color }: { id: HairId; body: Appearance['body']; color: string }) {
  const hair = paint(color)
  const gele = paint('#D4A84B')
  if (id === 'bald') return null
  if (id === 'lowcut') {
    return <mesh position={[0, 1.58, 0]} material={hair} castShadow><sphereGeometry args={[0.195, 12, 10, 0, Math.PI * 2, 0, 1.1]} /></mesh>
  }
  if (id === 'classic') {
    return <mesh position={[0, 1.57, 0.01]} material={hair} castShadow><sphereGeometry args={[0.2, 12, 10, 0, Math.PI * 2, 0, 1.25]} /></mesh>
  }
  if (id === 'afro') {
    return <mesh position={[0, 1.68, 0]} material={hair} castShadow><sphereGeometry args={[0.32, 12, 10]} /></mesh>
  }
  if (id === 'curls') {
    return (
      <group>
        {[-0.12, 0.12, 0, -0.08, 0.08].map((x, i) => (
          <mesh key={i} position={[x, 1.62 + (i % 2) * 0.04, i > 2 ? 0.1 : -0.02]} material={hair} castShadow>
            <sphereGeometry args={[0.1, 8, 8]} />
          </mesh>
        ))}
      </group>
    )
  }
  if (id === 'locs') {
    return (
      <group>
        <mesh position={[0, 1.58, 0]} material={hair} castShadow><sphereGeometry args={[0.2, 10, 8, 0, Math.PI * 2, 0, 1.3]} /></mesh>
        {[-0.12, -0.04, 0.04, 0.12].map((x) => (
          <mesh key={x} position={[x, 1.28, 0.12]} material={hair} castShadow>
            <capsuleGeometry args={[0.03, 0.28, 3, 6]} />
          </mesh>
        ))}
      </group>
    )
  }
  if (id === 'bun') {
    return (
      <group>
        <mesh position={[0, 1.58, 0]} material={hair} castShadow><sphereGeometry args={[0.2, 12, 10, 0, Math.PI * 2, 0, 1.2]} /></mesh>
        <mesh position={[0, 1.7, -0.12]} material={hair} castShadow><sphereGeometry args={[0.1, 10, 8]} /></mesh>
      </group>
    )
  }
  if (id === 'ponytail') {
    return (
      <group>
        <mesh position={[0, 1.58, 0]} material={hair} castShadow><sphereGeometry args={[0.2, 12, 10, 0, Math.PI * 2, 0, 1.2]} /></mesh>
        <mesh position={[0, 1.42, -0.18]} rotation={[0.5, 0, 0]} material={hair} castShadow>
          <capsuleGeometry args={[0.045, 0.28, 3, 6]} />
        </mesh>
      </group>
    )
  }
  if (id === 'long') {
    return <mesh position={[0, 1.48, -0.04]} material={hair} castShadow><sphereGeometry args={[0.26, 12, 10]} /></mesh>
  }
  if (id === 'gele') {
    return (
      <group>
        <mesh position={[0, 1.6, 0]} material={gele} castShadow><torusGeometry args={[0.18, 0.07, 8, 16]} /></mesh>
        <mesh position={[0.16, 1.66, 0]} material={gele} castShadow><boxGeometry args={[0.12, 0.16, 0.08]} /></mesh>
      </group>
    )
  }
  return (
    <group>
      <mesh position={[0, 1.58, 0]} material={hair} castShadow>
        <sphereGeometry args={[body === 'woman' ? 0.22 : 0.2, 12, 10, 0, Math.PI * 2, 0, 1.25]} />
      </mesh>
      {body === 'woman'
        ? [-0.1, 0.1].map((x) => (
            <mesh key={x} position={[x, 1.32, 0.08]} material={hair} castShadow>
              <capsuleGeometry args={[0.035, 0.22, 3, 6]} />
            </mesh>
          ))
        : null}
    </group>
  )
}

function Clothes({
  outfit,
  body,
  topColor,
  bottomColor,
}: {
  outfit: OutfitId
  body: Appearance['body']
  topColor: string
  bottomColor: string
}) {
  const top = paint(topColor)
  const bottom = paint(bottomColor)
  const woman = body === 'woman'

  if (outfit === 'hoodie') {
    return (
      <group>
        <mesh position={[0, 1.12, 0]} material={top} castShadow><boxGeometry args={[0.46, 0.42, 0.28]} /></mesh>
        <mesh position={[0, 1.32, 0]} material={top} castShadow><boxGeometry args={[0.34, 0.12, 0.26]} /></mesh>
        <mesh position={[0, 0.62, 0]} material={bottom} castShadow><boxGeometry args={[0.36, 0.46, 0.22]} /></mesh>
      </group>
    )
  }
  if (outfit === 'office' || outfit === 'corporate') {
    return (
      <group>
        <mesh position={[0, 1.12, 0]} material={top} castShadow>
          <boxGeometry args={[woman ? 0.4 : 0.44, 0.4, 0.24]} />
        </mesh>
        <mesh position={[0, 0.58, 0]} material={bottom} castShadow>
          <boxGeometry args={[woman ? 0.36 : 0.38, woman ? 0.42 : 0.52, 0.22]} />
        </mesh>
      </group>
    )
  }
  if (outfit === 'chiller') {
    return (
      <group>
        <mesh position={[0, 1.14, 0]} material={top} castShadow><boxGeometry args={[0.48, 0.36, 0.28]} /></mesh>
        <mesh position={[0, 0.7, 0]} material={bottom} castShadow><boxGeometry args={[0.4, 0.28, 0.24]} /></mesh>
      </group>
    )
  }
  if (outfit === 'sitework') {
    return (
      <group>
        <mesh position={[0, 1.12, 0]} material={top} castShadow><boxGeometry args={[0.44, 0.4, 0.24]} /></mesh>
        <mesh position={[0, 0.62, 0]} material={bottom} castShadow><boxGeometry args={[0.4, 0.48, 0.24]} /></mesh>
      </group>
    )
  }
  if (outfit === 'owambe') {
    return (
      <group>
        <mesh position={[0, 1.14, 0]} material={top} castShadow><boxGeometry args={[0.4, 0.36, 0.24]} /></mesh>
        <mesh position={[0, 0.62, 0]} material={bottom} castShadow><cylinderGeometry args={[0.28, 0.34, 0.7, 10]} /></mesh>
      </group>
    )
  }
  return (
    <group>
      <mesh position={[0, woman ? 1.16 : 1.1, 0]} material={top} castShadow>
        <boxGeometry args={[woman ? 0.36 : 0.42, woman ? 0.28 : 0.44, 0.22]} />
      </mesh>
      {!woman ? (
        <>
          <mesh position={[-0.26, 1.18, 0]} material={top} castShadow>
            <boxGeometry args={[0.14, 0.16, 0.16]} />
          </mesh>
          <mesh position={[0.26, 1.18, 0]} material={top} castShadow>
            <boxGeometry args={[0.14, 0.16, 0.16]} />
          </mesh>
        </>
      ) : null}
      <mesh position={[0, woman ? 0.7 : 0.58, 0]} material={bottom} castShadow>
        {woman ? <cylinderGeometry args={[0.2, 0.26, 0.4, 10]} /> : <boxGeometry args={[0.36, 0.52, 0.2]} />}
      </mesh>
    </group>
  )
}

function ModularFigure({ appearance }: { appearance: Appearance }) {
  const woman = appearance.body === 'woman'
  const shorts = appearance.outfit === 'chiller'
  const skin = appearance.skin || SKIN
  return (
    <group>
      <mesh position={[0, 1.48, 0]} material={paint(skin)} castShadow>
        <sphereGeometry args={[0.2, 16, 12]} />
      </mesh>
      <mesh position={[0, 1.3, 0]} material={paint(skin)} castShadow>
        <cylinderGeometry args={[0.07, 0.08, 0.1, 8]} />
      </mesh>
      <Clothes
        outfit={appearance.outfit}
        body={appearance.body}
        topColor={appearance.topColor}
        bottomColor={appearance.bottomColor}
      />
      <Limb position={[woman ? -0.26 : -0.28, 1.08, 0]} size={[0.055, 0.42, 0.055]} color={skin} />
      <Limb position={[woman ? 0.26 : 0.28, 1.08, 0]} size={[0.055, 0.42, 0.055]} color={skin} />
      <Limb position={[-0.1, shorts ? 0.42 : 0.34, 0]} size={[0.07, shorts ? 0.28 : 0.46, 0.07]} color={skin} />
      <Limb position={[0.1, shorts ? 0.42 : 0.34, 0]} size={[0.07, shorts ? 0.28 : 0.46, 0.07]} color={skin} />
      <mesh position={[-0.1, 0.05, 0.04]} material={paint(SHOE_COLOR)} castShadow>
        <boxGeometry args={[0.12, 0.07, 0.2]} />
      </mesh>
      <mesh position={[0.1, 0.05, 0.04]} material={paint(SHOE_COLOR)} castShadow>
        <boxGeometry args={[0.12, 0.07, 0.2]} />
      </mesh>
      <Hair id={appearance.hair} body={appearance.body} color={appearance.hairColor || HAIR_COLOR} />
    </group>
  )
}

function visibleBox(root: Object3D) {
  const box = new Box3()
  let used = false
  root.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh || !mesh.visible) return
    const next = new Box3().setFromObject(mesh)
    if (!used) {
      box.copy(next)
      used = true
    } else {
      box.union(next)
    }
  })
  return used ? box : new Box3().setFromObject(root)
}

function meshLabel(mesh: Mesh) {
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
  return `${mesh.name} ${(material as MeshStandardMaterial | undefined)?.name ?? ''}`.toLowerCase()
}

function isDarkHairMaterial(mesh: Mesh) {
  if (/pele|skin|flesh|body/.test(meshLabel(mesh))) return false
  const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as MeshStandardMaterial | undefined
  const color = material?.color
  if (!color) return false
  return color.r + color.g + color.b < 0.08
}

function clipMeshAbove(mesh: Mesh, cutY: number) {
  const geometry = mesh.geometry.index ? mesh.geometry : mesh.geometry.clone()
  if (!geometry.index) geometry.setIndex([...Array(geometry.attributes.position.count).keys()])
  const next = geometry.clone()
  const position = next.attributes.position
  const index = next.index!
  const keep: number[] = []
  const vertex = new Vector3()
  mesh.updateMatrixWorld(true)
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i)
    const b = index.getX(i + 1)
    const c = index.getX(i + 2)
    const midY =
      (vertex.fromBufferAttribute(position, a).applyMatrix4(mesh.matrixWorld).y +
        vertex.fromBufferAttribute(position, b).applyMatrix4(mesh.matrixWorld).y +
        vertex.fromBufferAttribute(position, c).applyMatrix4(mesh.matrixWorld).y) /
      3
    if (midY < cutY) keep.push(a, b, c)
  }
  if (keep.length === 0 || keep.length === index.count) return
  next.setIndex(keep)
  mesh.geometry = next
}

function stripImportedHair(root: Object3D) {
  root.updateMatrixWorld(true)
  const body = visibleBox(root)
  const height = Math.max(body.max.y - body.min.y, 0.001)
  const meshBox = new Box3()
  const hidden: Box3[] = []

  root.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh) return
    meshBox.setFromObject(mesh)
    if (/hair|cabelo|capelli|pelo|wig/.test(meshLabel(mesh))) {
      hidden.push(meshBox.clone())
      mesh.visible = false
      return
    }
    const midY = (meshBox.min.y + meshBox.max.y) / 2
    const span = meshBox.max.y - meshBox.min.y
    if (midY > body.min.y + height * 0.84 && span < height * 0.28) {
      hidden.push(meshBox.clone())
      mesh.visible = false
      return
    }
    if (isDarkHairMaterial(mesh) && span > height * 0.45) {
      clipMeshAbove(mesh, body.min.y + height * 0.78)
    }
  })
  return hidden
}

function computeHeadBox(root: Object3D, scalpBoxes: Box3[]) {
  if (scalpBoxes.length > 0) {
    const hair = scalpBoxes[0].clone()
    for (let i = 1; i < scalpBoxes.length; i++) hair.union(scalpBoxes[i])
    const size = hair.getSize(new Vector3())
    if (size.y > size.x * 1.35) hair.min.y = hair.max.y - Math.max(size.x, size.z)
    return hair
  }
  const body = visibleBox(root)
  const size = body.getSize(new Vector3())
  const center = body.getCenter(new Vector3())
  const skull = size.y * 0.12
  const box = new Box3()
  box.min.set(center.x - skull * 0.55, body.max.y - skull, center.z - skull * 0.5)
  box.max.set(center.x + skull * 0.55, body.max.y, center.z + skull * 0.5)
  return box
}

function recolorMesh(mesh: Mesh, color: string) {
  const sources = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  const painted = sources.map((source) => {
    const material = (source as MeshStandardMaterial).clone()
    material.color.set(color)
    material.map = null
    material.emissiveMap = null
    material.vertexColors = false
    material.roughness = 0.62
    material.metalness = 0.04
    return material
  })
  mesh.material = Array.isArray(mesh.material) ? painted : painted[0]!
}

function paintOutfitClothes(root: Object3D, colors: { top: string; bottom: string }) {
  const body = visibleBox(root)
  const height = Math.max(body.max.y - body.min.y, 0.001)
  const parts: { mesh: Mesh; mid: number; label: string }[] = []
  root.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh || !mesh.visible) return
    const label = meshLabel(mesh)
    if (/pele|cabelo|hair/.test(label) && !/blusa|calca/.test(label)) return
    const box = new Box3().setFromObject(mesh)
    const span = box.max.y - box.min.y
    if (span > height * 0.88) return
    const mid = (box.min.y + box.max.y) / 2
    if ((mid - body.min.y) / height <= 0.2) return
    parts.push({ mesh, mid, label })
  })
  parts.sort((a, b) => b.mid - a.mid)
  const namedShirt = parts.find((part) => /blusa/.test(part.label))
  const namedPants = parts.find((part) => /calca/.test(part.label))
  const shirt = namedShirt ?? parts[0]
  const pants = namedPants ?? parts.find((part) => part !== shirt)
  if (shirt) recolorMesh(shirt.mesh, colors.top)
  if (pants) recolorMesh(pants.mesh, colors.bottom)
}

function findHeadBone(root: Object3D) {
  let named: Object3D | null = null
  let loose: Object3D | null = null
  root.traverse((object) => {
    if (!(object as Bone).isBone) return
    const name = object.name.replace(/\s+/g, '')
    if (/^(mixamorig[:|_]?Head|Head|bip001Head|HeadTop_End)$/i.test(name)) {
      named ??= object
      return
    }
    const lower = object.name.toLowerCase()
    if (!loose && lower.includes('head') && !/headphone|headset/.test(lower)) loose = object
  })
  return named ?? loose
}

function keepHairMeshes(root: Object3D) {
  const meshes: Mesh[] = []
  root.traverse((object) => {
    const mesh = object as Mesh
    if (mesh.isMesh) meshes.push(mesh)
  })
  const hair = meshes.filter((mesh) => /hair|cabelo|capelli|pelo|wig/.test(meshLabel(mesh)))
  if (hair.length === 0) {
    freezeSkinnedMeshes(root)
    return
  }
  for (const mesh of meshes) mesh.visible = hair.includes(mesh)
  freezeSkinnedMeshes(root)
}

function paintImportedSkin(root: Object3D, skin: string) {
  root.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh || !mesh.visible) return
    const label = meshLabel(mesh)
    if (/hair|cabelo|shirt|pant|shoe|boot|cloth|jean|fabric|outfit|hat|glass/.test(label)) return
    const sources = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const painted = sources.map((source) => {
      const material = source as MeshStandardMaterial
      if (!material?.color) return source
      const named = /skin|body|face|arm|leg|hand|head|neck|chest|flesh|pele/.test(label)
      const { r, g, b } = material.color
      const chroma = Math.max(r, g, b) - Math.min(r, g, b)
      const flesh = r > 0.38 && g > 0.22 && r > b && chroma > 0.08 && r + g + b > 1.1
      if (!named && !flesh) return source
      const next = material.clone()
      next.color.set(skin)
      next.map = null
      next.emissiveMap = null
      next.vertexColors = false
      next.roughness = 0.62
      next.metalness = 0.02
      return next
    })
    mesh.material = Array.isArray(mesh.material) ? painted : painted[0]!
  })
}

function paintHairBlack(root: Object3D, color = HAIR_COLOR) {
  root.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh || !mesh.visible) return
    const sources = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const painted = sources.map((source) => {
      const material = (source as MeshStandardMaterial).clone()
      material.color.set(color)
      material.map = null
      material.emissiveMap = null
      material.emissive.set(0, 0, 0)
      material.vertexColors = false
      material.roughness = 0.72
      material.metalness = 0.02
      return material
    })
    mesh.material = Array.isArray(mesh.material) ? painted : painted[0]!
  })
}

function freezeSkinnedMeshes(root: Object3D) {
  const skinned: SkinnedMesh[] = []
  root.traverse((object) => {
    const mesh = object as SkinnedMesh
    if (mesh.isSkinnedMesh) skinned.push(mesh)
  })
  for (const mesh of skinned) {
    mesh.skeleton?.pose()
    const baked = new Mesh(mesh.geometry, mesh.material)
    baked.name = mesh.name
    baked.visible = mesh.visible
    baked.castShadow = true
    baked.position.copy(mesh.position)
    baked.quaternion.copy(mesh.quaternion)
    baked.scale.copy(mesh.scale)
    mesh.parent?.add(baked)
    mesh.removeFromParent()
  }
}

function HeadSocket({
  bone,
  boneOffset,
  center,
  children,
}: {
  bone: Object3D | null
  /** Head centre in the bone's rest-pose space, so tuned hair stays put and then follows the bone. */
  boneOffset: Matrix4 | null
  center: [number, number, number]
  children: ReactNode
}) {
  const group = useRef<Group>(null)
  useLayoutEffect(() => {
    const node = group.current
    if (!node || !bone) return
    bone.add(node)
    if (boneOffset) {
      boneOffset.decompose(node.position, node.quaternion, node.scale)
    } else {
      node.position.set(0, 0, 0)
      node.rotation.set(0, 0, 0)
      node.scale.set(1, 1, 1)
    }
    return () => {
      bone.remove(node)
    }
  }, [bone, boneOffset])

  if (bone) return <group ref={group}>{children}</group>
  return (
    <group name="Head" position={center}>
      {children}
    </group>
  )
}

function FittedHair({
  file,
  fit,
  headSize,
  color,
}: {
  file: string
  fit: HairFit
  headSize: Vector3
  color: string
}) {
  const decoder = use(meshoptDecoder)
  const { scene } = useGLTF(file, true, false, (loader) => {
    loader.setMeshoptDecoder(decoder)
  })
  const prepared = useMemo(() => {
    const clone = scene.clone(true)
    keepHairMeshes(clone)
    paintHairBlack(clone, color)
    clone.position.set(0, 0, 0)
    clone.rotation.set(0, 0, 0)
    clone.scale.set(1, 1, 1)
    const pivot = new Group()
    pivot.add(clone)
    pivot.rotation.set(fit.rotation[0], fit.rotation[1], fit.rotation[2])
    pivot.updateMatrixWorld(true)
    const box = visibleBox(pivot)
    const size = box.getSize(new Vector3())
    const cap = box.clone()
    const capHeight = Math.min(Math.max(headSize.y * 1.15, size.x * 0.85), Math.max(size.y * 0.28, headSize.y))
    cap.min.y = Math.max(box.min.y, box.max.y - capHeight)
    const capCenter = cap.getCenter(new Vector3())
    const autoScale = (headSize.x * 1.05) / Math.max(size.x, 0.001)
    const scale = autoScale * fit.scale
    const scalp = headSize.y / 2
    let posY = scalp - cap.max.y * scale
    const posX = -capCenter.x * scale + fit.offset[0]
    const posZ = -capCenter.z * scale + fit.offset[2]
    return {
      pivot,
      scale,
      position: [posX, posY + fit.offset[1], posZ] as [number, number, number],
    }
  }, [scene, fit, headSize, color])

  return (
    <group position={prepared.position} scale={prepared.scale}>
      <primitive object={prepared.pivot} />
    </group>
  )
}

/** Clips baked into the rigged body GLBs (see blender/rig.py). */
export type FigurePose = 'idle' | 'walk' | 'sit' | 'bath'

/**
 * Plays the model's clips: `pose.current` picks one; otherwise "walk" while
 * `moving.current` is true, else "idle". Changes cross-fade.
 */
function useFigureClips(
  root: Object3D,
  clips: AnimationClip[],
  moving?: RefObject<boolean>,
  pose?: RefObject<FigurePose | null>,
) {
  const state = useRef<{ mixer: AnimationMixer; actions: Map<string, AnimationAction>; current: string } | null>(null)

  useEffect(() => {
    if (clips.length === 0) return
    const mixer = new AnimationMixer(root)
    const actions = new Map(clips.map((clip) => [clip.name.toLowerCase(), mixer.clipAction(clip)]))
    actions.get('idle')?.play()
    state.current = { mixer, actions, current: 'idle' }
    return () => {
      mixer.stopAllAction()
      mixer.uncacheRoot(root)
      state.current = null
    }
  }, [root, clips])

  useFrame((_, delta) => {
    const anim = state.current
    if (!anim) return
    const want = pose?.current ?? (moving?.current ? 'walk' : 'idle')
    if (want !== anim.current && anim.actions.has(want)) {
      const to = anim.actions.get(want)!
      to.reset().setEffectiveWeight(1).fadeIn(0.25).play()
      anim.actions.get(anim.current)?.fadeOut(0.25)
      anim.current = want
    }
    anim.mixer.update(Math.min(delta, 0.1))
  })
}

function ImportedFigure({
  url,
  appearance,
  hairTune,
  moving,
  pose,
}: {
  url: string
  appearance: Appearance
  hairTune?: HairFit | null
  moving?: RefObject<boolean>
  pose?: RefObject<FigurePose | null>
}) {
  const { scene, animations } = useGLTF(url)
  const stored = hairFitFor(appearance.body, appearance.hair)
  const hair = hairTune ?? stored
  const fit = useMemo(() => {
    // Skeleton-aware clone so each figure gets its own bones
    const clone = cloneSkinned(scene)
    clone.updateMatrixWorld(true)
    const raw = new Box3().setFromObject(clone)
    const rawSize = raw.getSize(new Vector3())
    const zUp = rawSize.z > rawSize.y * 1.2
    const rotX = zUp ? -Math.PI / 2 : 0
    clone.rotation.x = rotX
    clone.updateMatrixWorld(true)
    const scalp = stripImportedHair(clone)
    paintImportedSkin(clone, appearance.skin)
    paintOutfitClothes(clone, { top: appearance.topColor, bottom: appearance.bottomColor })
    const headBox = computeHeadBox(clone, scalp)
    const box = visibleBox(clone)
    const size = box.getSize(new Vector3())
    const center = box.getCenter(new Vector3())
    const scale = 1.65 / Math.max(size.y, 0.001)
    const headCenter = headBox.getCenter(new Vector3())
    const headSize = headBox.getSize(new Vector3())
    const bone = findHeadBone(clone)
    clone.updateMatrixWorld(true)
    const boneOffset = bone
      ? bone.matrixWorld.clone().invert().multiply(new Matrix4().makeTranslation(headCenter.x, headCenter.y, headCenter.z))
      : null
    return {
      clone,
      bone,
      boneOffset,
      scale,
      position: [-center.x * scale, -box.min.y * scale, -center.z * scale] as [number, number, number],
      headCenter: [headCenter.x, headCenter.y, headCenter.z] as [number, number, number],
      headSize,
    }
  }, [scene, url, appearance.body, appearance.skin, appearance.topColor, appearance.bottomColor])
  useFigureClips(fit.clone, animations, moving, pose)

  return (
    <group position={fit.position} scale={fit.scale}>
      <primitive object={fit.clone} />
      <HeadSocket bone={fit.bone} boneOffset={fit.boneOffset} center={fit.headCenter}>
        <Suspense fallback={null}>
          {hair ? (
            <FittedHair file={hair.file} fit={hair} headSize={fit.headSize} color={appearance.hairColor} />
          ) : null}
        </Suspense>
      </HeadSocket>
    </group>
  )
}

export function CharacterFigure({
  appearance,
  imported = true,
  hairTune = null,
  moving,
  pose,
}: {
  appearance: Appearance
  imported?: boolean
  hairTune?: HairFit | null
  /** While true the figure plays its walk cycle; otherwise it idles. */
  moving?: RefObject<boolean>
  /** Overrides walk/idle with a specific clip (sit on a chair, bucket bath…). */
  pose?: RefObject<FigurePose | null>
}) {
  useEffect(() => {
    void meshoptDecoder.then((decoder) => {
      const styles = HAIR_CONFIG[appearance.body]
      for (const style of Object.values(styles)) {
        if (style?.file) {
          useGLTF.preload(style.file, true, false, (loader) => {
            loader.setMeshoptDecoder(decoder)
          })
        }
      }
    })
  }, [appearance.body])

  if (imported) {
    return <ImportedFigure url={CHARACTER_GLB[appearance.body]} appearance={appearance} hairTune={hairTune} moving={moving} pose={pose} />
  }
  return <ModularFigure appearance={appearance} />
}

useGLTF.preload(CHARACTER_GLB.man)
useGLTF.preload(CHARACTER_GLB.woman)
