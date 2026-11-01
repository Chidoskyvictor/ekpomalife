/** Server-side source of truth for real-money top-up packs (Naira only). */
export type WalletPack = {
  id: string
  name: string
  emoji: string
  naira: number
  gameMoney: number
  tag?: string
  highlight?: boolean
}

export const WALLET_PACKS: readonly WalletPack[] = [
  { id: 'small_chops', name: 'Small Chops', emoji: '🍢', naira: 200, gameMoney: 30_000 },
  { id: 'fresher', name: 'Fresher', emoji: '🎒', naira: 500, gameMoney: 90_000 },
  { id: 'jambite', name: 'Jambite', emoji: '📚', naira: 1_000, gameMoney: 200_000 },
  { id: 'pablo', name: 'Pablo', emoji: '😎', naira: 2_500, gameMoney: 550_000 },
  { id: 'big_boy', name: 'Big Boy', emoji: '💰', naira: 5_000, gameMoney: 1_200_000, tag: 'best value', highlight: true },
  { id: 'odogwu', name: 'Odogwu', emoji: '🦁', naira: 10_000, gameMoney: 2_600_000 },
  { id: 'celeb_money', name: 'Celeb Money', emoji: '👑', naira: 20_000, gameMoney: 5_500_000, tag: 'for the big boys' },
]

export function findWalletPack(id: string) {
  return WALLET_PACKS.find((pack) => pack.id === id) ?? null
}
