import type { Appearance } from './look'

/*
 * The Innovation Hub's desks (room: scripts/blender/innovation-hub.py, layout INNOVATION_HUB).
 * Each NPC sits on their desk's chair; tapping their task (or the desk, or them) walks you to the
 * other side of the desk (spot `seat:hub-<id>`) and opens the task there.
 *
 * Room coordinates (after the mirror): desk centres x 0.25 / −1.95 / −4.15; front-row desks
 * z 1.55…2.3 with chairs at z 2.85; back-row desks z −0.85…−0.1 with chairs at z 0.45. Chair
 * centres sit 0.2 right of their desk centre (x 0.45 / −1.75 / −3.95). Chairs face −z (the desk).
 * A character with heading 0 faces +z (the camera); π faces −z.
 */
export type HubDeskId = 'feedback' | 'ideas' | 'dev' | 'pitch'

export type HubDesk = {
  id: HubDeskId
  title: string
  emoji: string
  blurb: string
  npc: { name: string; role: string; x: number; z: number; heading: number; appearance: Appearance }
  /** The desk top (for taps): centre x, z */
  desk: { x: number; z: number }
  /** Where you stand to talk to them (across the desk, facing them) */
  you: { x: number; z: number; heading: number }
  soon?: boolean
}

const man = (skin: string, hair: Appearance['hair'], outfit: Appearance['outfit'], top: string, bottom: string): Appearance => ({
  body: 'man',
  hair,
  outfit,
  skin,
  hairColor: '#1b1410',
  topColor: top,
  bottomColor: bottom,
})

const FRONT_CHAIR_Z = 2.85
const BACK_CHAIR_Z = 0.45
/** Seated figures sit this far down so they're on the seat (as the lecture hall's chairs). */
export const SEATED_Y = -0.26

export const HUB_DESKS: HubDesk[] = [
  {
    id: 'feedback',
    title: 'Feedback Centre',
    emoji: '📝',
    blurb: 'Reviews, complaints, bug reports and your experience.',
    npc: { name: 'Francis', role: 'Feedback Desk', x: -3.95, z: FRONT_CHAIR_Z, heading: Math.PI, appearance: man('#8D4E2A', 'lowcut', 'office', '#1f6b8f', '#2b2f3a') },
    desk: { x: -4.15, z: 1.92 },
    you: { x: -4.15, z: 1.12, heading: 0 },
  },
  {
    id: 'ideas',
    title: 'Ideas & Suggestions',
    emoji: '💡',
    blurb: 'Suggest new features and vote on other players’ ideas.',
    npc: { name: 'JOD', role: 'Ideas Desk', x: -1.75, z: FRONT_CHAIR_Z, heading: Math.PI, appearance: man('#6B3F28', 'afro', 'hoodie', '#e8a33d', '#1f2937') },
    desk: { x: -1.95, z: 1.92 },
    you: { x: -1.95, z: 1.12, heading: 0 },
  },
  {
    id: 'dev',
    title: "Developers' Corner",
    emoji: '🛠️',
    blurb: 'Updates and announcements from the team.',
    npc: { name: 'Chidosky', role: 'Dev Team', x: 0.45, z: FRONT_CHAIR_Z, heading: Math.PI, appearance: man('#5C3317', 'curls', 'chiller', '#2fa36b', '#24324a') },
    desk: { x: 0.25, z: 1.92 },
    you: { x: 0.25, z: 1.12, heading: 0 },
  },
  {
    id: 'pitch',
    title: 'Pitch Room',
    emoji: '🚀',
    blurb: 'Pitch your tech to an investor. 5 pitches a day.',
    npc: { name: 'Sammy', role: 'Pitch Room', x: -1.75, z: BACK_CHAIR_Z, heading: Math.PI, appearance: man('#A56C3A', 'classic', 'corporate', '#3b3f8f', '#1c1c24') },
    desk: { x: -1.95, z: -0.48 },
    you: { x: -1.95, z: -1.3, heading: 0 },
  },
]

export const hubSpotKey = (id: HubDeskId) => `seat:hub-${id}` as const

/** Free seats in the hub: the two back-row chairs nobody works at, and the coffee-bar stools. */
export type HubSeat = { id: string; x: number; z: number; label: string; /** facing, character heading */ heading: number; y: number; approach: [number, number] }
export const HUB_SEATS: HubSeat[] = [
  { id: 'hub-chair-1', x: -3.95, z: BACK_CHAIR_Z, label: 'Back desk', heading: Math.PI, y: SEATED_Y, approach: [-3.95, BACK_CHAIR_Z + 0.62] },
  { id: 'hub-chair-2', x: 0.45, z: BACK_CHAIR_Z, label: 'Back desk', heading: Math.PI, y: SEATED_Y, approach: [0.45, BACK_CHAIR_Z + 0.62] },
  // Stools face the coffee bar on the right wall (+x)
  ...[3.05, 2.05, 1.05, 0.05].map((z, i) => ({
    id: `hub-stool-${i + 1}`,
    x: 4.65,
    z,
    label: 'Coffee bar',
    heading: Math.PI / 2,
    y: -0.08,
    approach: [4.0, z] as [number, number],
  })),
]

/** Layout spots: the desks (stand) and the free seats (sit). Merged into INNOVATION_HUB.spots. */
export function hubDeskSpots() {
  return Object.fromEntries([
    ...HUB_DESKS.map((d) => [
      hubSpotKey(d.id),
      { approach: [d.you.x, d.you.z] as [number, number], at: [d.you.x, 0, d.you.z] as [number, number, number], heading: d.you.heading },
    ]),
    ...HUB_SEATS.map((s) => [`seat:${s.id}`, { approach: s.approach, at: [s.x, s.y, s.z] as [number, number, number], heading: s.heading }]),
  ])
}
