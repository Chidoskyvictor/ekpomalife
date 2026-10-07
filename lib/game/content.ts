import type { ActionDef, ActionId, GameEvent, LocationRecord, LocationType } from './types'

export const TYPE_META: Record<LocationType, { label: string; color: string; roof: string }> = {
  campus: { label: 'Campus', color: '#f4efe2', roof: '#2f8f5b' },
  hostel: { label: 'Hostel', color: '#efe4cf', roof: '#c4683a' },
  community: { label: 'Community', color: '#fff6d9', roof: '#e2b63a' },
  food: { label: 'Food', color: '#fbe7d8', roof: '#d9622b' },
  transport: { label: 'Transport', color: '#e6edf4', roof: '#e8c13a' },
  shop: { label: 'Shop', color: '#efe8f6', roof: '#7a5cc2' },
  leisure: { label: 'Leisure', color: '#e3f0f7', roof: '#3a7fc4' },
  worship: { label: 'Worship', color: '#f7f3ea', roof: '#8a6a4a' },
}

export const ACTIONS: Record<ActionId, ActionDef> = {
  study: { id: 'study', label: 'Study', hint: '+Academic, uses energy', energyCost: 15, periods: 1 },
  night_class: {
    id: 'night_class',
    label: 'Night reading',
    hint: 'Big academic boost, tiring',
    energyCost: 25,
    periods: 1,
  },
  socialize: { id: 'socialize', label: 'Hang out', hint: '+Reputation', energyCost: 8, periods: 1 },
  rest: { id: 'rest', label: 'Sleep / rest', hint: 'Restore energy & health', periods: 1 },
  eat: { id: 'eat', label: 'Plate of jollof', hint: '+15 energy', cost: 800, periods: 0 },
  buy_phone: { id: 'buy_phone', label: 'Buy phone', hint: 'Unlocks messages & events', cost: 2500, periods: 0 },
  buy_snack: { id: 'buy_snack', label: 'Gala & Fanta', hint: '+6 energy', cost: 300, periods: 0 },
  errand: { id: 'errand', label: 'Campus errand', hint: 'Earn ₦500', energyCost: 10, periods: 1 },
  pos_shift: { id: 'pos_shift', label: 'POS agent shift', hint: 'Earn ₦400–₦900', energyCost: 20, periods: 1 },
  watch_match: { id: 'watch_match', label: 'Watch the match', hint: '+Reputation, small fee', cost: 200, periods: 1 },
  pray: { id: 'pray', label: 'Attend service', hint: '+Health, +Reputation', periods: 1 },
  market_run: { id: 'market_run', label: 'Buy foodstuff', hint: 'Garri & groundnut, +10 energy', cost: 400, periods: 0 },
  feedback: { id: 'feedback', label: 'Drop feedback', hint: 'Help shape Ekpoma Life', periods: 0 },
  workout: { id: 'workout', label: 'Train on the pitch', hint: '+Health, uses energy', energyCost: 15, periods: 1 },
}

export const START_LOCATION_ID = 'aau_campus'

export const LOCATIONS: LocationRecord[] = [
  {
    id: 'aau_campus',
    name: 'AAU Senate',
    type: 'campus',
    emoji: '🎓',
    description: 'Ambrose Alli University main grounds. Lectures, students, and campus hustle.',
    position: [-12, -17],
    size: [7, 3.2, 5],
    actions: ['study', 'socialize', 'errand'],
    npc: { name: 'Chuks', role: 'Student', line: 'Guy, you get ₦200? I go pay you back Friday.' },
  },
  {
    id: 'aau_library',
    name: 'AAU Library',
    type: 'campus',
    emoji: '📚',
    description: 'Quiet floors, slow fans and the best place to cram before exams.',
    position: [-1, -14],
    size: [5, 2.6, 4],
    actions: ['study', 'night_class'],
  },
  {
    id: 'mbc',
    name: 'MBC',
    type: 'campus',
    emoji: '🏛️',
    description: 'A familiar AAU landmark students pass through between lectures.',
    position: [-23, -11],
    size: [5, 2.4, 4],
    actions: ['socialize', 'study'],
  },
  {
    id: 'sports_complex',
    name: 'Sports Complex',
    type: 'leisure',
    emoji: '🏟️',
    description: 'The AAU pitch. Inter-faculty matches and evening jogs.',
    position: [-22, -24],
    size: [8, 0.6, 6],
    actions: ['workout', 'socialize'],
  },
  {
    id: 'college_of_medicine',
    name: 'College of Medicine',
    type: 'campus',
    emoji: '🩺',
    description: 'Long days, heavier books, and campus stories.',
    position: [22, -20],
    size: [6, 3.6, 5],
    actions: ['study', 'night_class'],
  },
  {
    id: 'campus_shop',
    name: 'Campus Shop',
    type: 'shop',
    emoji: '🛍️',
    description: 'Phones, snacks, and the small things students always need.',
    position: [3, -5],
    size: [3.6, 2, 3],
    actions: ['buy_phone', 'buy_snack', 'pos_shift'],
    npc: { name: 'Mr. Osas', role: 'Shop owner', line: 'Fresh phones just land. No dulling.' },
  },
  {
    id: 'keke_park',
    name: 'Keke Park',
    type: 'transport',
    emoji: '🛺',
    description: 'Keke and bike park. Faster than walking, but the fare dey change.',
    position: [16, 5],
    size: [5, 0.4, 4],
    actions: [],
    npc: { name: 'Ife', role: 'Keke rider', line: 'Where you dey go? Enter make we move!' },
  },
  {
    id: 'roadside_bukka',
    name: 'Mama Amina Bukka',
    type: 'food',
    emoji: '🍲',
    description: 'Rice, stew, and gossip. Food restores energy and costs cash.',
    position: [-8, 7],
    size: [3.6, 1.8, 3],
    actions: ['eat', 'socialize'],
    npc: { name: 'Amina', role: 'Food vendor', line: 'My pepper no be for small pikin o!' },
  },
  {
    id: 'viewing_centre',
    name: 'Viewing Centre',
    type: 'leisure',
    emoji: '⚽',
    description: 'Premier League on a big screen and a generator humming outside.',
    position: [-20, 6],
    size: [4.4, 2.2, 3.4],
    actions: ['watch_match', 'socialize'],
  },
  {
    id: 'ekpoma_market',
    name: 'Ekpoma Market',
    type: 'shop',
    emoji: '🧺',
    description: 'Foodstuff, provisions and haggling at full volume.',
    position: [4, 12],
    size: [7, 1.4, 5],
    actions: ['market_run', 'socialize'],
  },
  {
    id: 'innovation_hub',
    name: 'Innovation Hub',
    type: 'community',
    emoji: '💡',
    description: "The team's in-game home. Leave reviews and suggest features.",
    position: [22, 14],
    size: [4.4, 3, 4],
    actions: ['feedback', 'socialize'],
  },
  {
    id: 'church',
    name: 'Chapel of Grace',
    type: 'worship',
    emoji: '⛪',
    description: 'Sunday service, choir practice and a peaceful compound.',
    position: [28, 2],
    size: [4, 3.4, 5],
    actions: ['pray'],
  },
  {
    id: 'mosque',
    name: 'Central Mosque',
    type: 'worship',
    emoji: '🕌',
    description: 'Calls to prayer echo across town five times a day.',
    position: [-30, 18],
    size: [4.4, 2.8, 4.4],
    actions: ['pray'],
  },
  {
    id: 'igbinedion_hostel',
    name: 'Igbinedion Hostel',
    type: 'hostel',
    emoji: '🏠',
    description: 'Off-campus living, generator noise, and hostel politics.',
    position: [-16, 22],
    size: [5, 3, 4],
    actions: ['rest', 'socialize'],
  },
  {
    id: 'maryvale_hostel',
    name: 'Maryvale Hostel',
    type: 'hostel',
    emoji: '🏘️',
    description: 'Another Ekpoma student address with its own rhythm.',
    position: [12, 24],
    size: [5, 3, 4],
    actions: ['rest'],
  },
]

export const EVENTS: GameEvent[] = [
  {
    id: 'keke_fare_palaver',
    title: 'Keke fare palaver',
    description: 'The driver says the price just changed because of fuel.',
    choices: [
      { label: 'Pay the extra ₦200', effects: { cash: -200, reputation: 1 }, outcome: 'You paid. The driver hailed you "Chairman".' },
      { label: 'Walk instead', effects: { energy: -12 }, outcome: 'Your legs carried you. Small sweat.' },
    ],
  },
  {
    id: 'nepa_took_light',
    title: 'NEPA don take light',
    description: 'Darkness everywhere. Your neighbour is offering to share his generator for a fee.',
    choices: [
      { label: 'Contribute ₦300 for fuel', effects: { cash: -300, energy: 5, reputation: 2 }, outcome: 'Generator roaring. You charged your phone.' },
      { label: 'Manage am', effects: { health: -4 }, outcome: 'Mosquitoes had a party. You survived.' },
    ],
  },
  {
    id: 'chuks_borrow',
    title: 'Chuks needs money',
    description: '"Bros abeg, ₦500. I go pay you back Friday, I swear."',
    choices: [
      { label: 'Give him ₦500', effects: { cash: -500, reputation: 4 }, outcome: 'Chuks is telling everyone you are a real one.' },
      { label: 'I no get', effects: { reputation: -2 }, outcome: 'Chuks hissed and walked away.' },
    ],
  },
  {
    id: 'surprise_test',
    title: 'Surprise test!',
    description: 'A lecturer walks in and announces a test. Right now.',
    choices: [
      { label: 'Write it bravely', effects: { academic: 4, energy: -8 }, outcome: 'You remembered more than you thought.' },
      { label: 'Copy from your neighbour', effects: { academic: -3, reputation: -3 }, outcome: 'The lecturer saw you. Embarrassing.' },
    ],
  },
  {
    id: 'rain_fall',
    title: 'Rain don fall',
    description: 'Heavy downpour on the laterite road. Everywhere is red mud.',
    choices: [
      { label: 'Buy umbrella ₦400', effects: { cash: -400 }, outcome: 'Dry and stylish.' },
      { label: 'Run through it', effects: { health: -6, energy: -5 }, outcome: 'You caught a small cold.' },
    ],
  },
  {
    id: 'found_money',
    title: 'Lucky find',
    description: 'You spot a ₦1,000 note on the ground near the junction.',
    choices: [
      { label: 'Pocket it', effects: { cash: 1000 }, outcome: 'Today na your day.' },
      { label: 'Ask around for the owner', effects: { reputation: 5 }, outcome: 'An old woman blessed you for returning it.' },
    ],
  },
]

export function getLocation(id: string): LocationRecord | undefined {
  return LOCATIONS.find((location) => location.id === id)
}

export const FACULTIES = ['Arts', 'Sciences', 'Law', 'Medicine', 'Engineering', 'Social Sciences'] as const

export const AVATAR_COLORS = ['#22a36b', '#d9622b', '#3a7fc4', '#7a5cc2', '#e2b63a', '#d94a72']
