'use client'

import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bed,
  BookOpen,
  Check,
  CookingPot,
  Flower2,
  Lamp,
  LayoutGrid,
  Rotate3d,
  RotateCw,
  Search,
  ShowerHead,
  SlidersHorizontal,
  Sofa,
  Store,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useGame } from '@/hooks/use-game'
import {
  fetchHomeFurniture,
  moveHomeItem,
  newIdempotencyKey,
  placeHomeItem,
  sellHomeItem,
  type HomeBuyFail,
  type HomeCategory,
  type HomeItem,
  type OwnedPiece,
} from '@/lib/game/home-buy-api'
import { checkHomePlacement, firstFreeHomeSpot, sellBackPrice, type HomeSpec } from '@/lib/game/home-buy-rules'
import {
  exitBuyMode,
  pickPlaced,
  setBuySpot,
  startPlacing,
  stopPlacing,
  turnBuyCamera,
  turnBuyItem,
  useBuyUi,
} from '@/lib/game/home-buy-store'
import { shapeMap } from '@/lib/game/home-placed'
import { formatNaira } from '@/lib/game/live'
import type { RoomView } from '@/lib/game/room-camera'
import styles from './buy-panel.module.css'

/** "Any price" cycles through these caps. */
const PRICE_STEPS = [
  { label: 'Any price', max: Infinity },
  { label: 'Under ₦5k', max: 5000 },
  { label: 'Under ₦30k', max: 30000 },
  { label: 'Under ₦100k', max: 100000 },
] as const

const CATEGORIES: { id: HomeCategory; label: string; Icon: LucideIcon }[] = [
  { id: 'sleep', label: 'Sleep', Icon: Bed },
  { id: 'kitchen', label: 'Kitchen', Icon: CookingPot },
  { id: 'bath', label: 'Bath', Icon: ShowerHead },
  { id: 'comfort', label: 'Comfort', Icon: Sofa },
  { id: 'study', label: 'Study', Icon: BookOpen },
  { id: 'light', label: 'Light', Icon: Lamp },
  { id: 'deco', label: 'Deco', Icon: Flower2 },
]

/** Which way each arrow nudges the preview, matching how the arrow keys walk in this view. */
function nudge(view: RoomView, dir: 'up' | 'down' | 'left' | 'right'): [number, number] {
  const base = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir]
  if (view === 'front') return base as [number, number]
  const turn = Math.PI / 4
  const rx = base[0] * Math.cos(turn) + base[1] * Math.sin(turn)
  const rz = base[1] * Math.cos(turn) - base[0] * Math.sin(turn)
  return [Math.sign(Math.round(rx * 1.4)), Math.sign(Math.round(rz * 1.4))]
}

const isNetwork = (res: { ok: boolean }) => !res.ok && Boolean((res as HomeBuyFail).network)

const errorOf = (fail: HomeBuyFail) => fail.error || 'Something went wrong. Try again.'

/**
 * Buy mode's bottom sheet: wallet, Turn room, Exit; a catalogue strip (category chips + search)
 * that keeps the room visible; and, once something is picked, the placing bar (arrows, turn,
 * Place · ₦X). Tapping a piece you own offers Move and Sell (half back).
 */
export function BuyPanel({
  spec,
  catalog,
  placements,
  view,
  onPlacements,
}: {
  spec: HomeSpec
  catalog: HomeItem[]
  placements: OwnedPiece[]
  view: RoomView
  onPlacements: (next: OwnedPiece[]) => void
}) {
  const { state, applyServerState, refreshServer } = useGame()
  const ui = useBuyUi()
  const cash = state?.cash ?? 0
  const [category, setCategory] = useState<HomeCategory>('sleep')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null)
  /** Right after a purchase: offers "Place another" of the same thing. */
  const [last, setLast] = useState<HomeItem | null>(null)
  /** "+ 1 more": after placing, line up another of the same one straight away. */
  const [more, setMore] = useState(false)
  const [price, setPrice] = useState<(typeof PRICE_STEPS)[number]>(PRICE_STEPS[0])
  /** The catalogue sheet can be tucked away (short screens start that way) to see the whole room. */
  const [open, setOpen] = useState(true)
  const [searching, setSearching] = useState(false)
  useEffect(() => {
    if (window.matchMedia('(max-height: 520px)').matches) setOpen(false)
  }, [])

  const shapes = useMemo(() => shapeMap(catalog), [catalog])
  const byId = useMemo(() => new Map(catalog.map((i) => [i.id, i])), [catalog])
  const picked = ui.pickedId ? placements.find((p) => p.id === ui.pickedId) : undefined
  const pickedItem = picked ? byId.get(picked.itemId) : undefined

  const items = useMemo(() => {
    const q = query.trim().toLowerCase()
    return catalog.filter((i) => (q ? i.name.toLowerCase().includes(q) : i.category === category) && i.price <= price.max)
  }, [catalog, category, query, price])

  const verdict = useMemo(() => {
    if (!ui.item || !ui.spot) return null
    return checkHomePlacement(
      spec,
      shapes,
      placements.filter((p) => p.id !== ui.movingId),
      ui.item.id,
      ui.spot,
    )
  }, [ui.item, ui.spot, ui.movingId, spec, shapes, placements])

  const pick = useCallback(
    (item: HomeItem) => {
      const spot = firstFreeHomeSpot(spec, shapes, placements, item.id)
      setLast(null)
      if (!spot) {
        const have = placements.filter((p) => p.itemId === item.id).length
        setNote({
          text: have >= item.maxPerHome ? `You can only keep ${item.maxPerHome} of those.` : 'No free spot left for that. Sell or move something.',
          bad: true,
        })
        return
      }
      setNote(null)
      startPlacing(item, spot)
    },
    [spec, shapes, placements],
  )

  const move = useCallback(
    (dir: 'up' | 'down' | 'left' | 'right') => {
      if (!ui.item || !ui.spot) return
      const [dx, dz] = nudge(view, dir)
      setBuySpot({ ...ui.spot, x: ui.spot.x + dx, z: ui.item.wall ? 0 : ui.spot.z + dz })
    },
    [ui.item, ui.spot, view],
  )

  // Arrow keys nudge the preview (the character stays put in Buy mode)
  useEffect(() => {
    if (!ui.item) return
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return
      const dir = ({ ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' } as const)[e.code]
      if (dir) {
        e.preventDefault()
        move(dir)
      } else if (e.code === 'KeyR') turnBuyItem()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ui.item, move])

  const finish = (res: { ok: true; placements: OwnedPiece[]; state: Parameters<typeof applyServerState>[0]; message: string } | HomeBuyFail) => {
    if (!res.ok) {
      setNote({ text: errorOf(res), bad: true })
      return false
    }
    onPlacements(res.placements)
    applyServerState(res.state)
    setNote({ text: res.message })
    return true
  }

  /** The request timed out but the server may have finished: reload what is really in the home. */
  const resync = async () => {
    const res = await fetchHomeFurniture()
    if (!res.ok) return false
    const changed = res.placements.length !== placements.length || res.placements.some((p, i) => p.id !== placements[i]?.id)
    onPlacements(res.placements)
    void refreshServer()
    setNote(changed ? { text: 'Done. The connection was slow.' } : { text: 'Could not confirm that. Check your wallet.', bad: true })
    return changed
  }

  const commit = async () => {
    if (!ui.item || !ui.spot || busy || !verdict?.ok) return
    const item = ui.item
    setBusy(true)
    try {
      const key = newIdempotencyKey()
      if (ui.movingId) {
        const res = await moveHomeItem(ui.movingId, ui.spot, key)
        if (finish(res) || (isNetwork(res) && (await resync()))) stopPlacing()
        return
      }
      const res = await placeHomeItem(item.id, ui.spot, key)
      if (finish(res) || (isNetwork(res) && (await resync()))) {
        stopPlacing()
        if (more) pick(item)
        else setLast(item)
      }
    } finally {
      setBusy(false)
    }
  }

  const sell = async () => {
    if (!picked || busy) return
    setBusy(true)
    try {
      const res = await sellHomeItem(picked.id, newIdempotencyKey())
      if (finish(res) || (isNetwork(res) && (await resync()))) pickPlaced(null)
    } finally {
      setBusy(false)
    }
  }

  const placing = ui.item !== null
  const cost = ui.movingId ? 0 : (ui.item?.price ?? 0)
  const short = cost > cash
  const arrows = [
    ['up', ArrowUp, 'Move up'],
    ['left', ArrowLeft, 'Move left'],
    ['down', ArrowDown, 'Move down'],
    ['right', ArrowRight, 'Move right'],
  ] as const

  const closeSearch = () => {
    setSearching(false)
    setQuery('')
  }

  return (
    <>
      {/* Wallet, turn and exit float over the room (not inside the sheet) */}
      <header className={styles.floatBar}>
        <span className={styles.modePill}>
          <LayoutGrid size={16} aria-hidden="true" /> Buy mode
        </span>
        <span className={styles.wallet} aria-label={`Wallet ${formatNaira(cash)}`}>
          {formatNaira(cash)}
        </span>
        <span className={styles.actions}>
          <button type="button" className={styles.iconBtn} aria-label="Turn room" onClick={turnBuyCamera}>
            <Rotate3d size={20} aria-hidden="true" />
          </button>
          <button type="button" className={styles.iconBtn} aria-label="Exit Buy mode" onClick={exitBuyMode}>
            <X size={20} aria-hidden="true" />
          </button>
        </span>
      </header>

      {!open && !placing && !picked ? (
        <button type="button" className={styles.openBtn} onClick={() => setOpen(true)}>
          <Store size={18} aria-hidden="true" /> Shop items
        </button>
      ) : (
        <section className={`${styles.sheet} ${placing || picked ? styles.sheetCompact : ''}`} aria-label="Shop items">
          <span className={styles.handle} aria-hidden="true" />
          {placing && ui.item ? (
            <div className={styles.placing}>
              <div className={styles.placingHead}>
                <span className={styles.placingIcon} aria-hidden="true">
                  {ui.item.emoji}
                </span>
                <span className={styles.placingText}>
                  <strong>{ui.item.name}</strong>
                  <span role="status">
                    {note?.bad
                      ? note.text
                      : verdict && !verdict.ok
                        ? verdict.error
                        : short
                          ? `${formatNaira(cost - cash)} more to go.`
                          : `${ui.item.w}×${ui.item.d} · drag in the room or use the arrows`}
                  </span>
                </span>
                <button type="button" className={styles.round} aria-label="Turn item" disabled={ui.item.wall} onClick={turnBuyItem}>
                  <RotateCw size={18} aria-hidden="true" />
                </button>
              </div>
              <div className={styles.arrows} role="group" aria-label="Move preview">
                {arrows.map(([dir, Icon, label]) => (
                  <button key={dir} type="button" className={styles.round} aria-label={label} onClick={() => move(dir)}>
                    <Icon size={18} aria-hidden="true" />
                  </button>
                ))}
              </div>
              <div className={styles.twoUp}>
                <button type="button" className={styles.pill} onClick={stopPlacing}>
                  Cancel
                </button>
                {ui.movingId ? null : (
                  <button type="button" className={`${styles.pill} ${more ? styles.pillOn : ''}`} aria-pressed={more} onClick={() => setMore(!more)}>
                    + 1 more
                  </button>
                )}
                <button type="button" className={`${styles.go} ${styles.goFlex}`} disabled={busy || !verdict?.ok || short} onClick={() => void commit()}>
                  {ui.movingId ? 'Done' : `Place · ${formatNaira(cost)}`}
                </button>
              </div>
            </div>
          ) : picked && pickedItem ? (
            <div className={styles.placing}>
              <div className={styles.placingHead}>
                <span className={styles.placingIcon} aria-hidden="true">
                  {pickedItem.emoji}
                </span>
                <span className={styles.placingText}>
                  <strong>{pickedItem.name}</strong>
                  {note?.bad ? <span role="status">{note.text}</span> : null}
                </span>
                <button type="button" className={styles.round} aria-label="Close" onClick={() => pickPlaced(null)}>
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
              <div className={styles.twoUp}>
                <button
                  type="button"
                  className={`${styles.pill} ${styles.goFlex}`}
                  onClick={() => startPlacing(pickedItem, { x: picked.x, z: picked.z, rot: picked.rot }, picked.id)}
                >
                  Move
                </button>
                <button type="button" className={`${styles.pill} ${styles.goFlex}`} disabled={busy} onClick={() => void sell()}>
                  Sell · {formatNaira(sellBackPrice(picked.paid ?? pickedItem.price))}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className={styles.head}>
                <strong>Items</strong>
                <button
                  type="button"
                  className={styles.iconBtnFlat}
                  aria-label="Search items"
                  aria-pressed={searching}
                  onClick={() => (searching ? closeSearch() : setSearching(true))}
                >
                  <Search size={18} aria-hidden="true" />
                </button>
                <button type="button" className={styles.iconBtnFlat} aria-label="Hide shop" onClick={() => setOpen(false)}>
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
              {searching ? (
                <div className={styles.search}>
                  <Search size={16} aria-hidden="true" />
                  <input
                    type="search"
                    value={query}
                    placeholder="Search items"
                    aria-label="Search items"
                    autoFocus
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
              ) : null}
              <div
                className={styles.chips}
                role="tablist"
                aria-label="Categories"
                // A mouse wheel over the chips scrolls them sideways
                onWheel={(e) => {
                  if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY
                }}
              >
                {CATEGORIES.map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={!query && category === id}
                    className={`${styles.chip} ${!query && category === id ? styles.chipOn : ''}`}
                    onClick={() => {
                      closeSearch()
                      setCategory(id)
                    }}
                  >
                    <Icon size={16} aria-hidden="true" /> {label}
                  </button>
                ))}
                <button
                  type="button"
                  className={`${styles.chip} ${price.max === Infinity ? '' : styles.chipOn}`}
                  onClick={() => setPrice(PRICE_STEPS[(PRICE_STEPS.indexOf(price) + 1) % PRICE_STEPS.length])}
                >
                  <SlidersHorizontal size={16} aria-hidden="true" /> {price.label}
                </button>
              </div>
              {last ? (
                <div className={styles.again}>
                  <span>
                    <Check size={16} aria-hidden="true" /> {last.name} placed
                  </span>
                  <button type="button" className={styles.pill} onClick={() => pick(last)}>
                    Place another
                  </button>
                </div>
              ) : null}
              {note?.bad ? (
                <p className={styles.bad} role="status">
                  {note.text}
                </p>
              ) : null}
              <div className={styles.cards}>
                {items.length === 0 ? <p className={styles.hint}>Nothing like that. Try another word.</p> : null}
                {items.map((item) => (
                  <button key={item.id} type="button" className={styles.card} onClick={() => pick(item)}>
                    <span className={styles.sizeBadge}>
                      {item.w}×{item.d}
                      {item.wall ? ' · wall' : ''}
                    </span>
                    <span className={styles.cardEmoji} aria-hidden="true">
                      {item.emoji}
                    </span>
                    <strong className={styles.cardName}>{item.name}</strong>
                    <span className={item.price > cash ? styles.priceShort : styles.price}>{formatNaira(item.price)}</span>
                    <span className={styles.tags}>
                      {item.helps.slice(0, 2).map((need) => (
                        <span key={need} className={styles.tag}>
                          +{need}
                        </span>
                      ))}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
      )}
    </>
  )
}
