'use client'

import { useLayoutEffect } from 'react'
import { CanvasTexture, MeshBasicMaterial, SRGBColorSpace, type Material, type Mesh, type Object3D } from 'three'

/** One board's look: navy with a thin gold rule and the name in white capitals. */
function signTexture(name: string) {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 136
  const g = c.getContext('2d')!
  g.fillStyle = '#13294b'
  g.fillRect(0, 0, c.width, c.height)
  g.fillStyle = '#c9a227'
  g.fillRect(0, c.height - 10, c.width, 4)
  g.fillRect(0, 6, c.width, 4)
  let px = 84
  const text = name.toUpperCase()
  g.font = `800 ${px}px system-ui, sans-serif`
  while (px > 36 && g.measureText(text).width > c.width - 80) {
    px -= 4
    g.font = `800 ${px}px system-ui, sans-serif`
  }
  g.fillStyle = '#ffffff'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(text, c.width / 2, c.height / 2 + 2)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  // The boards' UVs come from glTF (v runs top-down), so don't flip the canvas like a normal texture
  t.flipY = false
  t.anisotropy = 4
  return t
}

/**
 * Writes the neighbouring places' names on the class's two blank boards (SignBoard0 / SignBoard1),
 * so one shared model reads right for every hall. Undone when the hall changes.
 */
export function ClassSigns({ root, names }: { root: Object3D; names: [string, string] }) {
  useLayoutEffect(() => {
    const swapped: [Mesh, Material][] = []
    names.forEach((name, i) => {
      const mesh = root.getObjectByName(`SignBoard${i}`) as Mesh | undefined
      if (!mesh?.isMesh) return
      const map = signTexture(name)
      swapped.push([mesh, mesh.material as Material])
      mesh.material = new MeshBasicMaterial({ map, toneMapped: false })
    })
    return () => {
      for (const [mesh, original] of swapped) {
        const mat = mesh.material as MeshBasicMaterial
        mat.map?.dispose()
        mat.dispose()
        mesh.material = original
      }
    }
  }, [root, names])
  return null
}
