import type { HomeItem, HomeStyle, OwnedPiece } from './home-buy-api'
import { planStyle, type HomeSpec, type StylePlan } from './home-buy-rules'
import { shapeMap } from './home-placed'
import { decorPrice, decorZones, type DecorZone, type HomeDecor } from './home-decor'

/*
 * What a style would do to this home right now: same planning as the server (planStyle), so the
 * preview and the price match what Buy does. Pieces you own are reused; only the rest is paid for.
 */
export type StyleQuote = {
  plan: StylePlan
  /** Naira for the missing pieces. */
  piecesCost: number
  /** Naira for wall paint / floor the style changes (0 when your home already has them). */
  decorCost: number
  /** The wall / floor the style sets (only zones this home has and doesn't have already). */
  decor: HomeDecor
  total: number
}

export function quoteStyle(
  style: HomeStyle,
  spec: HomeSpec,
  catalog: HomeItem[],
  placements: OwnedPiece[],
  lodgingId: string | null | undefined,
  ownedDecor: HomeDecor,
): StyleQuote {
  const byId = new Map(catalog.map((i) => [i.id, i]))
  // Same filter as the server: only things for sale can be bought; owned ones are reused anyway
  const entries = style.items.filter((e) => {
    const item = byId.get(e.item)
    return item && !item.starter && (item.available !== false || placements.some((p) => p.itemId === e.item))
  })
  const plan = planStyle(spec, shapeMap(catalog), placements, entries)
  const piecesCost = plan.buys.reduce((sum, b) => sum + (byId.get(b.itemId)?.price ?? 0), 0)
  const zones = decorZones(lodgingId)
  const decor: HomeDecor = {}
  let decorCost = 0
  for (const zone of ['wall', 'floor'] as const satisfies readonly DecorZone[]) {
    const value = style[zone]
    if (!value || !zones.includes(zone) || ownedDecor[zone] === value) continue
    const price = decorPrice(zone, value)
    if (price === null) continue
    decor[zone] = value
    decorCost += price
  }
  return { plan, piecesCost, decorCost, decor, total: piecesCost + decorCost }
}

/** A small icon row for a style card: its theme emoji, then up to four different items. */
export function styleIcons(style: HomeStyle, catalog: HomeItem[]): string[] {
  const byId = new Map(catalog.map((i) => [i.id, i]))
  const seen = new Set<string>()
  for (const e of style.items) {
    const emoji = byId.get(e.item)?.emoji
    if (emoji) seen.add(emoji)
    if (seen.size >= 4) break
  }
  return [style.emoji, ...seen]
}

/** "about ₦1.2m" / "about ₦85k": rounded, since the price shifts with what you already own. */
export function aboutNaira(n: number): string {
  if (n >= 1_000_000) return `about ₦${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}m`
  if (n >= 1000) return `about ₦${Math.round(n / 1000).toLocaleString('en-NG')}k`
  return `about ₦${n.toLocaleString('en-NG')}`
}
