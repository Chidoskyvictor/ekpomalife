'use client'

import { useGLTF } from '@react-three/drei'
import { useLayoutEffect, useMemo } from 'react'
import type { Mesh, Object3D } from 'three'

const URL = '/models/club-surroundings.glb?v=2'
/** The club models' own lawn discs: replaced by the road and blocks below. (Their paved yard stays.) */
const LAWN = /^Grass/
/** The street pieces (road, kerbs, lines, parked cars). Sazza keeps its lawn, so these stay hidden there. */
const STREET = /^(Asphalt|Kerb|RoadLine|YardBase|Car|Tyre|TailLight|DeskWhite)/

/**
 * The buildings behind a club, with softly lit windows and tree ferns (only the back row, so the
 * sides and front stay open). Forbes also gets the street look (kerbs, an asphalt ring road and
 * parked cars, replacing its lawn); Sazza keeps its own lawn floor. Drawn in the club model's own
 * coordinates (mount it through the room canvas's `effects`).
 */
export function ClubSurroundings({ root, street }: { root: Object3D; street: boolean }) {
  const { scene } = useGLTF(URL)
  const copy = useMemo(() => {
    const c = scene.clone(true)
    if (!street) c.traverse((o) => (STREET.test(o.name) ? (o.visible = false) : undefined))
    return c
  }, [scene, street])
  useLayoutEffect(() => {
    if (!street) return
    const hidden: Object3D[] = []
    root.traverse((o) => {
      if (LAWN.test(o.name) && (o as Mesh).isMesh && o.visible) {
        o.visible = false
        hidden.push(o)
      }
    })
    return () => hidden.forEach((o) => (o.visible = true))
  }, [root, street])
  return <primitive object={copy} />
}

useGLTF.preload(URL)
