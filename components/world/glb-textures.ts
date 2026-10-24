'use client'

import type { Mesh, Object3D, Texture, WebGLRenderer } from 'three'

function tuneTexture(texture: Texture, anisotropy: number) {
  texture.anisotropy = anisotropy
  texture.needsUpdate = true
}

/** Sharpen GLB map textures when viewed at a shallow angle (buildings, landmarks). */
export function applyGlbTextureAnisotropy(root: Object3D, gl: WebGLRenderer) {
  const anisotropy = Math.min(4, gl.capabilities.getMaxAnisotropy())
  root.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh || !mesh.material) return
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of materials) {
      const maps = material as {
        map?: Texture | null
        normalMap?: Texture | null
        roughnessMap?: Texture | null
        metalnessMap?: Texture | null
        aoMap?: Texture | null
      }
      if (maps.map) tuneTexture(maps.map, anisotropy)
      if (maps.normalMap) tuneTexture(maps.normalMap, anisotropy)
      if (maps.roughnessMap) tuneTexture(maps.roughnessMap, anisotropy)
      if (maps.metalnessMap) tuneTexture(maps.metalnessMap, anisotropy)
      if (maps.aoMap) tuneTexture(maps.aoMap, anisotropy)
    }
  })
}
