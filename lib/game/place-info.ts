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
  home: {
    area: TOWN,
    about: 'Your house. Your room is inside, just how you left it.',
    doing: [
      { emoji: '😴', text: 'Sleep' },
      { emoji: '🚿', text: 'Shower' },
      { emoji: '📚', text: 'Study in peace' },
    ],
  },
  'admin-block': {
    area: CAMPUS,
    about: 'The seat of the school. Fees, forms and every "go and come back tomorrow" start here.',
    doing: [
      { emoji: '🧾', text: 'Pay fees and print your receipt' },
      { emoji: '🔁', text: 'Change your course' },
      { emoji: '🎩', text: 'See the VC' },
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
    about: 'The Student Conference. Where the school comes to relax between classes.',
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
  'etf-hall': {
    area: CAMPUS,
    about: 'ETF Hall. Big lectures, fans spinning, and a seat is a prize.',
    doing: [
      { emoji: '📚', text: 'Attend lectures' },
      { emoji: '🤝', text: 'Hang out outside' },
    ],
  },
  'hall-200': {
    area: CAMPUS,
    about: '200 Level Hall. Second-year lectures and last-minute reading.',
    doing: [
      { emoji: '📚', text: 'Attend lectures' },
      { emoji: '🤝', text: 'Hang out outside' },
    ],
  },
  'hall-100': {
    area: CAMPUS,
    about: '100 Level Hall. Where every fresher learns the ropes.',
    doing: [
      { emoji: '📚', text: 'Attend lectures' },
      { emoji: '🤝', text: 'Hang out outside' },
    ],
  },
  'mls-hall': {
    area: CAMPUS,
    about: 'MLS Hall. Lab coats, long notes, longer lectures.',
    doing: [
      { emoji: '📚', text: 'Attend lectures' },
      { emoji: '🤝', text: 'Hang out outside' },
    ],
  },
  'twin-hall': {
    area: CAMPUS,
    about: 'Twin Hall. Two halls side by side, always one exam away.',
    doing: [
      { emoji: '📚', text: 'Attend lectures' },
      { emoji: '🤝', text: 'Hang out outside' },
    ],
  },
  'physical-science': {
    area: CAMPUS,
    about: 'Faculty of Physical Sciences. Formulas on every board.',
    doing: [
      { emoji: '📚', text: 'Study' },
      { emoji: '🤝', text: 'Hang out' },
    ],
  },
  'social-science': {
    area: CAMPUS,
    about: 'Faculty of Social Sciences. Debates in every corridor.',
    doing: [
      { emoji: '📚', text: 'Study' },
      { emoji: '🤝', text: 'Hang out' },
    ],
  },
  'life-science': {
    area: CAMPUS,
    about: 'Faculty of Life Sciences. Specimens, practicals and lab reports.',
    doing: [
      { emoji: '📚', text: 'Study' },
      { emoji: '🤝', text: 'Hang out' },
    ],
  },
  'management-science': {
    area: CAMPUS,
    about: 'Faculty of Management Sciences. Future CEOs in training.',
    doing: [
      { emoji: '📚', text: 'Study' },
      { emoji: '🤝', text: 'Hang out' },
    ],
  },
  'aau-gate': {
    area: CAMPUS,
    about: 'The AAU main gate. Everyone passes through here.',
    doing: [
      { emoji: '🤝', text: 'Hang out at the gate' },
    ],
  },
  'town-shop-4': {
    area: TOWN,
    about: 'Corner shop. Snacks, drinks and everyday things.',
    doing: [
      { emoji: '🛒', text: 'Buy snacks and drinks' },
    ],
  },
  'cattle-market': {
    area: TOWN,
    about: 'Ekpoma cattle market. Loud, busy and full of deals.',
    doing: [
      { emoji: '🤝', text: 'Walk the market' },
    ],
  },
  'sazza': {
    area: TOWN,
    about: 'Sazza nightclub. Music, lights and the biggest nights in Ekpoma.',
    doing: [
      { emoji: '🪩', text: 'Club night: dance, drinks, VIP' },
      { emoji: '🎟️', text: 'Entry ₦5,000' },
    ],
  },
  'market-square': {
    area: TOWN,
    about: 'Ekpoma market square. Traders, noise and good prices.',
    doing: [
      { emoji: '🛒', text: 'Shop for food and things' },
      { emoji: '🤝', text: 'Hang out' },
    ],
  },
  'dubious': {
    area: TOWN,
    about: 'Dublous supermarket. Provisions, drinks and snacks. Out of stock for now, new goods coming soon.',
    doing: [
      { emoji: '🛒', text: 'Walk the aisles' },
      { emoji: '🤝', text: 'Hang out' },
    ],
  },
  'innovation-hub': {
    area: TOWN,
    about: 'Innovation Hub. Laptops, Wi-Fi and big ideas.',
    doing: [
      { emoji: '💻', text: 'Work and study' },
      { emoji: '🤝', text: 'Meet people' },
    ],
  },
  'magmus-autos': {
    area: TOWN,
    about: 'Magmus Autos. Tokunbo and brand new cars, from Corolla to GT3.',
    doing: [
      { emoji: '🚗', text: 'Buy a car' },
      { emoji: '🎨', text: 'Paint or sell yours' },
    ],
  },
  'above-the-hills-church': {
    area: TOWN,
    about: 'Above the Hills Church. Sunday service and midweek fellowship.',
    doing: [
      { emoji: '⛪', text: 'Attend service' },
      { emoji: '🤝', text: 'Meet people' },
    ],
  },
  'wise-gourmet': {
    area: TOWN,
    about: 'Wise Gourmet. Order at the window, eat at the VIP tables out front.',
    doing: [
      { emoji: '🌯', text: 'Buy shawarma' },
      { emoji: '🍗', text: 'Buy chicken and chips' },
      { emoji: '🍹', text: 'Chapman and ice cream' },
    ],
  },
  'park': {
    area: TOWN,
    about: 'The park. Shade, benches and a breather.',
    doing: [
      { emoji: '🌳', text: 'Relax' },
      { emoji: '🤝', text: 'Hang out' },
    ],
  },
  'shop-mid-1': {
    area: TOWN,
    about: 'Corner shop. Snacks, drinks and everyday things.',
    doing: [
      { emoji: '🛒', text: 'Buy snacks and drinks' },
    ],
  },
  'shop-mid-2': {
    area: TOWN,
    about: 'Corner shop. Snacks, drinks and everyday things.',
    doing: [
      { emoji: '🛒', text: 'Buy snacks and drinks' },
    ],
  },
  'forbes': {
    area: TOWN,
    about: 'Forbes nightclub. Lights, music and a long night out.',
    doing: [
      { emoji: '🪩', text: 'Club night' },
    ],
  },
  'spot-rite': {
    area: TOWN,
    about: 'Spot Rite. Burgers, shawarma and quick bites.',
    doing: [
      { emoji: '🍔', text: 'Grab a quick bite' },
    ],
  },
  'shop-low-1': {
    area: TOWN,
    about: 'Corner shop. Snacks, drinks and everyday things.',
    doing: [
      { emoji: '🛒', text: 'Buy snacks and drinks' },
    ],
  },
  'shop-low-2': {
    area: TOWN,
    about: 'Corner shop. Snacks, drinks and everyday things.',
    doing: [
      { emoji: '🛒', text: 'Buy snacks and drinks' },
    ],
  },
  'shop-low-3': {
    area: TOWN,
    about: 'Corner shop. Snacks, drinks and everyday things.',
    doing: [
      { emoji: '🛒', text: 'Buy snacks and drinks' },
    ],
  },
  'anonymous-zone': {
    area: TOWN,
    about: 'Anonymous Zone. An open plot where nobody asks questions.',
    doing: [
      { emoji: '🤝', text: 'Hang out' },
    ],
  },
  'denco': {
    area: TOWN,
    about: 'Denco. A busy spot on the south side of town.',
    doing: [
      { emoji: '🤝', text: 'Hang out' },
    ],
  },
  'playchill-climax': {
    area: TOWN,
    about: 'Play and Chill. Five-a-side turf pitch: play a match or sit by the cage and watch.',
    doing: [
      { emoji: '⚽', text: 'Play football' },
      { emoji: '🤝', text: 'Hang out' },
    ],
  },
}

/** A place on the map that is not open yet: tapping it shows what is coming instead of a way to get there. */
export type ComingSoon = {
  title: string
  /** Smaller line under the title */
  by: string
  about: string
  soon: { emoji: string; text: string }[]
}

export const COMING_SOON: Record<string, ComingSoon> = {
  'market-hub': {
    title: 'Market Hub',
    by: 'Prodigy Market Hub',
    about:
      'Under construction. When it opens you will be able to buy and sell real things with real money, and get what you buy delivered to you for real.',
    soon: [
      { emoji: '🛏️', text: 'Bed stands and other hostel furniture' },
      { emoji: '⚡', text: 'Generators for when NEPA strikes' },
      { emoji: '📚', text: 'Textbooks, new and second-hand' },
      { emoji: '💰', text: 'Sell your own stuff to other students' },
      { emoji: '🚚', text: 'Delivery to you in real life' },
    ],
  },
}

export const isComingSoon = (id: string | null | undefined) => Boolean(id && COMING_SOON[id])

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
