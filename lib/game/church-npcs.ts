import type { Appearance } from './look'

/*
 * A few NPCs in Above the Hills Church (layout CHURCH): the pastor at the pulpit on the altar and
 * four worshippers on the pews. Their pews are taken, so players never get sent to them.
 * A character with heading 0 faces +z (toward the pews and the camera); π faces −z (the altar).
 */
export type ChurchNpc = {
  id: string
  name: string | null
  x: number
  y: number
  z: number
  heading: number
  seated: boolean
  /** Pew seat id (CHURCH_SEATS) this NPC sits on */
  seat?: string
  appearance: Appearance
}

const look = (
  body: Appearance['body'],
  hair: Appearance['hair'],
  outfit: Appearance['outfit'],
  skin: string,
  top: string,
  bottom: string,
): Appearance => ({ body, hair, outfit, skin, hairColor: '#1b1410', topColor: top, bottomColor: bottom })

export const CHURCH_NPCS: ChurchNpc[] = [
  // Behind the pulpit on the altar platform (0.36 m up), facing the congregation
  { id: 'pastor', name: 'Pastor Ben', x: 2.4, y: 0.36, z: -5.05, heading: 0, seated: false, appearance: look('man', 'lowcut', 'corporate', '#6B3F28', '#1c1c24', '#1c1c24') },
  { id: 'w1', name: null, x: 1.8, y: -0.26, z: 5.5 - 2.5 - 0.32, heading: Math.PI, seated: true, seat: 'pew-2-1', appearance: look('woman', 'gele', 'owambe', '#8D4E2A', '#c9a227', '#f3f0e6') },
  { id: 'w2', name: null, x: -1.8, y: -0.26, z: 5.5 - 3.7 - 0.32, heading: Math.PI, seated: true, seat: 'pew-3-4', appearance: look('man', 'classic', 'office', '#5C3317', '#f3f0e6', '#2b2f3a') },
  { id: 'w3', name: null, x: 3.45, y: -0.26, z: 5.5 - 4.9 - 0.32, heading: Math.PI, seated: true, seat: 'pew-4-2', appearance: look('woman', 'braids', 'casual', '#A56C3A', '#7c3aed', '#1f2937') },
  { id: 'w4', name: null, x: -3.45, y: -0.26, z: 5.5 - 6.1 - 0.32, heading: Math.PI, seated: true, seat: 'pew-5-5', appearance: look('woman', 'bun', 'owambe', '#6B3F28', '#e85d9a', '#f3f0e6') },
]

export const NPC_PEWS = new Set(CHURCH_NPCS.flatMap((n) => (n.seat ? [n.seat] : [])))
