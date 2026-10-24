/**
 * ẹta NPCs: gold-verified accounts that keep the feed alive. They can be followed and their
 * profiles opened, but they never show follower counts or rank on Top voices.
 * A shout from a crypto or land NPC adds hype; it raises the odds of a pump, it never guarantees one.
 */

export type NpcKind = 'crypto' | 'land' | 'giveaway' | 'lifestyle' | 'motivation'

export type Npc = {
  id: string
  name: string
  handle: string
  emoji: string
  color: string
  bio: string
  kind: NpcKind
  /** Real minutes between posts */
  every: number
}

export const NPCS: Npc[] = [
  { id: 'bloom', name: 'Bloom All The Way', handle: 'bloomalltheway', emoji: '🌸', color: '#db2777', bio: 'I call coins before they bloom. Not financial advice, just vibes and charts.', kind: 'crypto', every: 40 },
  { id: 'plot-prophet', name: 'Plot Prophet', handle: 'plotprophet', emoji: '📍', color: '#0f766e', bio: 'Every road in Ekpoma, every new lodge. I see land moves before agents do.', kind: 'land', every: 55 },
  { id: 'giveaway-baba', name: 'Giveaway Baba', handle: 'giveawaybaba', emoji: '🎁', color: '#ca8a04', bio: 'Most-liked reply wins. I pay fast. No story, no money.', kind: 'giveaway', every: 180 },
  { id: 'soft-life-sade', name: 'Soft Life Sade', handle: 'softlifesade', emoji: '💅', color: '#9333ea', bio: 'Breakfast at Wise Gourmet. Keke on standby. Stress? I don’t know her.', kind: 'lifestyle', every: 50 },
  { id: 'osas-daily', name: 'Osas Daily', handle: 'osasdaily', emoji: '🌅', color: '#ea580c', bio: 'One line every day to keep you going. AAU no go break you.', kind: 'motivation', every: 80 },
]

export const npcById = (id: string) => NPCS.find((npc) => npc.id === id) ?? null

const pick = <T>(items: T[]) => items[Math.floor(Math.random() * items.length)]!

export function cryptoPost(coin: { ticker: string; name: string } | null, area: string) {
  if (!coin) {
    return pick([
      `No new coin worth my time today. Somebody launch something on Invest 👀`,
      `Quiet day on the charts. While you wait, ${area} land is still climbing 📍`,
      `The next 100x coin will start from an Ekpoma student. Will it be yours? 🌸`,
    ])
  }
  const t = `$${coin.ticker}`
  return pick([
    `${t} about to bloom all the way 🌸🚀 Don’t say I didn’t tell you.`,
    `Charts don’t lie. ${t} (${coin.name}) is cooking. Early people eat first 👀`,
    `My people, the ${t} community is loud today. When the crowd moves, price follows 📈`,
    `I’m not saying ${t} will moon. I’m saying I’d hate to watch it from outside 🌸`,
    `${t} holders, hold your seatbelt. Something is coming 🚀`,
  ])
}

export function landPost(area: string) {
  return pick([
    `${area} road is opening. Plots there won’t stay this cheap 👀📍`,
    `Lodges dey go up for ${area} every week. Land there go double, mark my words.`,
    `If you get small money, ${area} is where I’d put it. Not financial advice 😌`,
    `Agents are quietly buying in ${area}. You heard it here first 📍`,
    `Students are moving to ${area} next semester. Do the maths 🧮`,
  ])
}

const GIVEAWAY_TOPICS = [
  'Tell me your funniest AAU lecture story',
  'Describe Ekpoma in three words',
  'Best buka in Ekpoma and why',
  'Your worst NEPA story',
  'What would you buy first with this money?',
  'Shout out your best friend on campus',
  'Your hottest take about Ekpoma nightlife',
]

export function giveawayPost(prizeLabel: string, minutes: number) {
  return `🎁 GIVEAWAY: ${prizeLabel} to the most-liked reply in the next ${minutes} minutes. ${pick(GIVEAWAY_TOPICS)} 👇`
}

export function lifestylePost() {
  return pick([
    'Breakfast at Wise Gourmet, nails done, keke on standby. Soft life is a choice 💅',
    'Some of you are stressing over 8am lectures. I’m stressing over which outfit to wear to Playchill 🪩',
    'New hair, new wig, same old fine girl. Ekpoma, you’re welcome ✨',
    'Just tipped my keke man ₦5k because he played my song. Spread love 💸',
    'Booked the whole VIP at Forbes for my birthday. Who’s coming? 👑',
    'Weekend plan: sleep, eat, shop at Spot Rite, repeat. No lectures in my diary 🛍️',
  ])
}

export function motivationPost() {
  return pick([
    'Your carryover is not your final grade. Keep going 🌅',
    'Small money saved every day becomes the plot you brag about next year.',
    'The person who started a POS stand last semester is now buying a keke. Start small.',
    'NEPA can take light. Nobody can take your vision 💡',
    'Read one more page tonight. Future you is watching.',
    'Ekpoma is small, but your dreams don’t have to be.',
    'Don’t compare your chapter one to somebody’s chapter twenty.',
  ])
}

/** Prize ladder: mostly small, sometimes life-changing. */
export function rollPrize() {
  const roll = Math.random()
  if (roll < 0.35) return 100_000
  if (roll < 0.6) return 250_000
  if (roll < 0.8) return 500_000
  if (roll < 0.92) return 1_000_000
  if (roll < 0.98) return 5_000_000
  return 10_000_000
}
