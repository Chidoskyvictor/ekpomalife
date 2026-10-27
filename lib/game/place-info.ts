import { getPlace, getPlaceByZone, type Place } from './places'

/*
 * What the map's place sheet says about a place: where it is, what it is, and what you can do
 * there. Ids match places.ts. Fares and times come from the server (/travel/options).
 */

export type PlaceInfo = {
  area: string
  about: string
  /** Short lines: emoji + what you can do */
  doing: { emoji: string; text: string }[]
}

const CAMPUS = 'AAU Campus'
const TOWN = 'Ekpoma town'

export const PLACE_INFO: Record<string, PlaceInfo> = {
  'admin-block': {
    area: CAMPUS,
    about: 'The seat of the school. Fees, forms and every "go and come back tomorrow" start here.',
    doing: [
      { emoji: '📚', text: 'Study in the quiet corridor' },
      { emoji: '🤝', text: 'Hang out with other students' },
      { emoji: '💼', text: 'Pick up a side hustle' },
    ],
  },
  'ict-exams': {
    area: CAMPUS,
    about: 'The ICT centre. Computer-based tests are written here, so come early and bring your ID.',
    doing: [
      { emoji: '📚', text: 'Study at the computers' },
      { emoji: '💼', text: 'Pick up a side hustle' },
    ],
  },
  education: {
    area: CAMPUS,
    about: 'Faculty of Education. Lecture halls, notice boards and future teachers rehearsing their lessons.',
    doing: [{ emoji: '📚', text: 'Sit in on a lecture' }],
  },
  'mass-comm': {
    area: CAMPUS,
    about: 'Mass Communication. Cameras, mics and plenty of students who are already famous in their own minds.',
    doing: [
      { emoji: '📚', text: 'Study with the broadcasters' },
      { emoji: '🤝', text: 'Hang out on the steps' },
    ],
  },
  'students-centre': {
    area: CAMPUS,
    about: "The Students' Centre. Where the school comes to relax between classes.",
    doing: [
      { emoji: '🤝', text: 'Hang out with friends' },
      { emoji: '🍲', text: 'Grab something to eat' },
    ],
  },
  'cordelia-hall': {
    area: CAMPUS,
    about: 'Cordelia Agbebaku Hall. Big lectures, bigger crowds, and everybody hunting for a seat.',
    doing: [
      { emoji: '📚', text: 'Study in the hall' },
      { emoji: '🤝', text: 'Hang out outside' },
    ],
  },
  'sports-complex': {
    area: CAMPUS,
    about: 'Pitch, track and courts. Train, play, then cool off before you head out.',
    doing: [
      { emoji: '⚽', text: 'Hang out and watch the game' },
      { emoji: '🚿', text: 'Freshen up' },
    ],
  },
  'college-of-medicine': {
    area: CAMPUS,
    about: 'College of Medicine. White coats, long reading hours and very serious faces.',
    doing: [{ emoji: '📚', text: 'Study with the medics' }],
  },
  clinic: {
    area: CAMPUS,
    about: 'The campus clinic. Feeling low? Get checked and get back on your feet.',
    doing: [{ emoji: '🩺', text: 'Get treated and freshen up' }],
  },
  'school-hostels-1': {
    area: CAMPUS,
    about: 'School hostels. Shared rooms, loud generators and friendships for life.',
    doing: [
      { emoji: '🛏️', text: 'Sleep and refill energy' },
      { emoji: '🚿', text: 'Take a shower' },
      { emoji: '📚', text: 'Study in the reading corner' },
    ],
  },
  'school-hostels-2': {
    area: CAMPUS,
    about: 'More school hostel blocks. Same noise, different corridor.',
    doing: [
      { emoji: '🛏️', text: 'Sleep and refill energy' },
      { emoji: '🚿', text: 'Take a shower' },
    ],
  },
  'off-campus-hostels': {
    area: TOWN,
    about: 'Hostels outside the gate. A little more space, a little more rent.',
    doing: [
      { emoji: '🛏️', text: 'Sleep and refill energy' },
      { emoji: '🚿', text: 'Take a shower' },
    ],
  },
  'town-shop-1': {
    area: CAMPUS,
    about: 'The campus shop. Provisions, recharge cards and small things you forgot to buy.',
    doing: [
      { emoji: '🛍️', text: 'Buy food and provisions' },
      { emoji: '🤝', text: 'Hang out at the counter' },
      { emoji: '💼', text: 'Pick up a side hustle' },
    ],
  },
  'relaxation-centre': {
    area: TOWN,
    about: 'The relaxation centre. Music, games and a good place to forget your CA.',
    doing: [{ emoji: '🎉', text: 'Hang out and unwind' }],
  },
  bukka: {
    area: TOWN,
    about: "Mama Amina's bukka. Hot pots, fair portions and a queue that moves faster than it looks.",
    doing: [
      { emoji: '🍲', text: 'Eat a full plate' },
      { emoji: '🤝', text: 'Gist with the regulars' },
    ],
  },
  'keke-park': {
    area: TOWN,
    about: 'Keke park. Drivers shout the routes, and one of them is always "almost full".',
    doing: [
      { emoji: '🛺', text: 'Catch a ride across town' },
      { emoji: '🤝', text: 'Gist with the drivers' },
    ],
  },
  'shuttle-park': {
    area: CAMPUS,
    about: 'Where the school shuttles load. Cheap, steady and never quite on time.',
    doing: [{ emoji: '🚌', text: 'Catch the shuttle' }],
  },
  engineering: {
    area: CAMPUS,
    about: 'Faculty of Engineering. Workshops, drawings and students who live on caffeine.',
    doing: [{ emoji: '📚', text: 'Study with the engineers' }],
  },
  'law-campus': {
    area: CAMPUS,
    about: 'The Law campus. Thick books, loud arguments and very sharp shoes.',
    doing: [{ emoji: '📚', text: 'Study with the law students' }],
  },
}

/** The place a map tap or a shared link points at (a place id or its zone id), or null. */
export function placeFor(id: string | null | undefined): Place | null {
  if (!id) return null
  return getPlace(id) ?? getPlaceByZone(id)
}

export const placeInfo = (id: string): PlaceInfo | null => PLACE_INFO[id] ?? null

/** Link that opens the map on this place. */
export function placeLink(origin: string, placeId: string) {
  return `${origin}/?place=${encodeURIComponent(placeId)}`
}
