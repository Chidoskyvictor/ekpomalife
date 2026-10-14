'use client'

import { MAP } from '@/lib/game/map-theme'
import { ROAD_FRAME, ROAD_GAPS, type RoadGap } from '@/lib/game/world-layout'

function Dashes({ gap }: { gap: RoadGap }) {
  const alongZ = gap.d > gap.w
  const length = alongZ ? gap.d : gap.w
  const dash = 2.2
  const space = 2
  const marks: number[] = []
  for (let along = -length / 2 + dash; along < length / 2 - dash; along += dash + space) {
    marks.push(along)
  }

  return (
    <group>
      {marks.map((along) => (
        <mesh
          key={along}
          rotation={[-Math.PI / 2, 0, 0]}
          position={alongZ ? [gap.x, 0.07, gap.z + along] : [gap.x + along, 0.07, gap.z]}
        >
          <planeGeometry args={alongZ ? [0.28, dash] : [dash, 0.28]} />
          <meshStandardMaterial color={MAP.roadMark} roughness={0.7} />
        </mesh>
      ))}
    </group>
  )
}

function RoadInGap({ gap }: { gap: RoadGap }) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[gap.x, 0.04, gap.z]} receiveShadow>
        <planeGeometry args={[gap.w, gap.d]} />
        <meshStandardMaterial color={MAP.road} roughness={0.94} />
      </mesh>
      {gap.dashed ? <Dashes gap={gap} /> : null}
    </group>
  )
}

export function WorldRoads() {
  return (
    <group>
      {ROAD_FRAME.map((frame, i) => (
        <mesh key={`frame-${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[frame.x, 0.03, frame.z]} receiveShadow>
          <planeGeometry args={[frame.w, frame.d]} />
          <meshStandardMaterial color={MAP.road} roughness={0.94} />
        </mesh>
      ))}
      {ROAD_GAPS.map((gap) => (
        <RoadInGap key={gap.name} gap={gap} />
      ))}
    </group>
  )
}
