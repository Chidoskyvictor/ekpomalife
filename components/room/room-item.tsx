'use client'

import { FURNITURE_BY_ID } from '@/lib/game/room-constants'
import { rotatedFootprint } from '@/lib/game/room-rules'
import type { RoomItem as RoomItemType } from '@/lib/game/room-types'
import { FurnitureFallback, RoomPrimitive, primitiveKindFromModel } from './room-primitives'

export function RoomItemMesh({
  item,
  selected,
  ghost,
  valid,
  spinning,
}: {
  item: RoomItemType
  selected?: boolean
  ghost?: boolean
  valid?: boolean
  spinning?: boolean
}) {
  const def = FURNITURE_BY_ID.get(item.itemId)
  if (!def || !item.placed) return null
  const { w, d } = rotatedFootprint(def.footprint, item.rotation)
  const cx = item.x + w / 2
  const cz = item.z + d / 2
  const y = def.wallMounted ? 0 : 0
  const kind = primitiveKindFromModel(def.model) ?? 'default'
  const outline = selected ? '#3d9ad6' : ghost ? (valid ? '#22c55e' : '#f59e0b') : null

  return (
    <group position={[cx, y, cz]} rotation={[0, (-item.rotation * Math.PI) / 180, 0]}>
      {outline ? (
        <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[w * 0.95, d * 0.95]} />
          <meshBasicMaterial color={outline} transparent opacity={0.35} />
        </mesh>
      ) : null}
      {def.model.startsWith('primitive:') || kind !== 'default' ? (
        <RoomPrimitive kind={kind === 'default' ? def.model.replace('primitive:', '') : kind} spinning={spinning} />
      ) : (
        <FurnitureFallback w={w} d={d} color="#78716c" />
      )}
    </group>
  )
}
