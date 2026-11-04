/**
 * Lecture halls and faculties. They all use one 3D hall (public/models/lecture-hall.glb);
 * each has its own wall colour, the same for every player (unlike hostels, which are per player).
 * Ids match the map zones / places and the backend venues (backend/src/game/venues.ts HALLS).
 */
export type Hall = { id: string; name: string; color: string }

export const HALLS: Record<string, Hall> = Object.fromEntries(
  (
    [
      ['hall-100', '100 Level Hall', '#2f7d6b'],
      ['hall-200', '200 Level Hall', '#3d6fb3'],
      ['etf-hall', 'ETF Hall', '#7b4bb3'],
      ['mls-hall', 'MLS Hall', '#c0603a'],
      ['twin-hall', 'Twin Hall', '#b58a1b'],
      ['cordelia-hall', 'Cordelia Agbebaku Hall', '#a3263f'],
      ['education', 'Education', '#2e8b57'],
      ['mass-comm', 'Mass Comm', '#d2691e'],
      ['law-campus', 'Law', '#34495e'],
      ['physical-science', 'Physical Science', '#1f6b8f'],
      ['social-science', 'Social Science', '#8e44ad'],
      ['life-science', 'Life Science', '#3c8d2f'],
      ['management-science', 'Management Science', '#2c3e70'],
      ['engineering', 'Engineering', '#c27c0e'],
    ] as const
  ).map(([id, name, color]) => [id, { id, name, color }]),
)

export const hallFor = (id: string | null | undefined): Hall | null => (id ? (HALLS[id] ?? null) : null)

/**
 * Offices (public/models/office.glb). `color: null` keeps the model's original navy walls
 * (the Admin Block); any other office gets its own wall colour. Add BAMSSA here (and to the
 * backend HALLS list in backend/src/game/venues.ts) once it has a place on the map.
 */
export type Office = { id: string; name: string; color: string | null; /** Its own 3D room instead of the shared office */ layout?: 'innovation-hub' | 'church' | 'food' }

export const OFFICES: Record<string, Office> = {
  'admin-block': { id: 'admin-block', name: 'Admin Block', color: null },
  // Its own room (innovation-hub.glb) keeps its own colours, so no paint
  'innovation-hub': { id: 'innovation-hub', name: 'Innovation Hub', color: null, layout: 'innovation-hub' },
  // Its own room (church.glb): pews to sit on, altar at the back
  // Its own room (spot-rite.glb): order food at the counter, eat at the tables
  'spot-rite': { id: 'spot-rite', name: 'Spot Rite', color: null, layout: 'food' },
  // Its own room (bukka.glb): the same counter ordering, cheaper food
  bukka: { id: 'bukka', name: 'Mama Amina Bukka', color: null, layout: 'food' },
  'above-the-hills-church': { id: 'above-the-hills-church', name: 'Above the Hills Church', color: null, layout: 'church' },
}

export const officeFor = (id: string | null | undefined): Office | null => (id ? (OFFICES[id] ?? null) : null)
