'use client'

import { useGLTF } from '@react-three/drei'
import { useLayoutEffect, useMemo } from 'react'
import type { Mesh, Object3D } from 'three'

const URL = '/models/club-surroundings.glb?v=1'
/** The club models' own lawn discs: replaced by the road and blocks below. (Their paved yard stays.) */
const LAWN = /^Grass/

/**
 * The street round a club (Sazza, Forbes): kerbs, a ring road, cream campus blocks with softly lit
 * windows, parked cars and tree ferns, the same look as the Innovation Hub's courtyard. Drawn in the
 * club model's own coordinates (mount it through the room canvas's `effects`).
 */
export function ClubSurroundings({ root }: { root: Object3D }) {
  const { scene } = useGLTF(URL)
  const copy = useMemo(() => scene.clone(true), [scene])
  useLayoutEffect(() => {
    const hidden: Object3D[] = []
    root.traverse((o) => {
      if (LAWN.test(o.name) && (o as Mesh).isMesh && o.visible) {
        o.visible = false
        hidden.push(o)
      }
    })
    return () => hidden.forEach((o) => (o.visible = true))
  }, [root])
  return <primitive object={copy} />
}

useGLTF.preload(URL)
