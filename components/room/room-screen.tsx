'use client'

import NumberFlow from '@number-flow/react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { HudDrawer } from '@/components/hud/hud-drawer'
import { PlayNav, type PlayTab } from '@/components/hud/play-nav'
import { stashNavIntent } from '@/lib/game/nav-intent'
import { hapticTap } from '@/components/hud/haptic'
import { useGame } from '@/hooks/use-game'
import { useLowPerf } from '@/hooks/use-low-perf'
import { FURNITURE_BY_ID } from '@/lib/game/room-constants'
import {
  firstFreeSpot,
  moveItem,
  pushEdit,
  rotateItem,
  storeItem,
  undoEdit,
  type EditStack,
} from '@/lib/game/room-edit'
import {
  buyRoomItem,
  fetchRoom,
  newIdempotencyKey,
  saveRoomLayout,
  saveRoomStyle,
  sellRoomItem,
} from '@/lib/game/room-api'
import { validateLayout } from '@/lib/game/room-rules'
import type { RoomItem, RoomState, RoomStyle } from '@/lib/game/room-types'
import { RoomCatalog } from './room-catalog'
import styles from './room.module.css'

const RoomCanvas = dynamic(() => import('./room-canvas').then((m) => m.RoomCanvas), {
  ssr: false,
})

export function RoomScreen() {
  const router = useRouter()
  const { state, applyServerState, notifyToast } = useGame()
  const lowPerf = useLowPerf()
  const [room, setRoom] = useState<RoomState | null>(null)
  const [draft, setDraft] = useState<RoomItem[]>([])
  const [editing, setEditing] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [stack, setStack] = useState<EditStack>({ past: [], future: [] })
  const [busy, setBusy] = useState(false)
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [tab, setTab] = useState('sleep')
  const [comfortOpen, setComfortOpen] = useState(false)
  const [sellUid, setSellUid] = useState<string | null>(null)
  const [leaveAsk, setLeaveAsk] = useState(false)
  const [styleDraft, setStyleDraft] = useState<RoomStyle | null>(null)
  const [ownedFloors, setOwnedFloors] = useState<Set<RoomStyle['floorId']>>(new Set(['cement']))
  const [toast, setToast] = useState<string | null>(null)

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(room?.items ?? []), [draft, room])

  const showToast = (text: string) => {
    setToast(text)
    window.setTimeout(() => setToast(null), 2800)
  }

  const load = useCallback(async () => {
    const result = await fetchRoom()
    if (!result.ok) {
      showToast(result.error)
      return
    }
    setRoom(result.room)
    setDraft(result.room.items)
    setStyleDraft(result.room.style)
    setStack({ past: [], future: [] })
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const applyItems = (next: RoomItem[]) => {
    setStack((current) => pushEdit(current, draft, next))
    setDraft(next)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!editing || !selected || !room) return
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        const undone = undoEdit(stack, draft)
        if (!undone) return
        setStack(undone.stack)
        setDraft(undone.items)
        return
      }
      if (event.key === 'r' || event.key === 'R') {
        hapticTap()
        applyItems(rotateItem(draft, selected))
      }
      const delta =
        event.key === 'ArrowLeft'
          ? [-1, 0]
          : event.key === 'ArrowRight'
            ? [1, 0]
            : event.key === 'ArrowUp'
              ? [0, -1]
              : event.key === 'ArrowDown'
                ? [0, 1]
                : null
      if (!delta) return
      event.preventDefault()
      hapticTap()
      applyItems(moveItem(draft, selected, delta[0]!, delta[1]!))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing, selected, room, draft, stack])

  const ghost = useMemo(() => {
    if (!editing || !selected || !room) return null
    const item = draft.find((row) => row.uid === selected)
    if (!item?.placed) return null
    const check = validateLayout(draft, FURNITURE_BY_ID, room.tier)
    return { item, valid: check.ok || ('uid' in check && check.uid !== selected) }
  }, [editing, selected, draft, room])

  const saveLayout = async () => {
    if (!room || busy) return
    setBusy(true)
    const result = await saveRoomLayout(
      room.version,
      draft.map((row) => ({
        uid: row.uid,
        placed: row.placed,
        x: row.x,
        z: row.z,
        rotation: row.rotation,
      })),
      newIdempotencyKey(),
    )
    setBusy(false)
    if (!result.ok) {
      if (result.code === 'VERSION_CONFLICT' && result.room) {
        setRoom(result.room)
        setDraft(result.room.items)
        showToast(result.error)
      } else {
        showToast(result.error)
      }
      return
    }
    hapticTap()
    setRoom(result.room)
    setDraft(result.room.items)
    setStack({ past: [], future: [] })
    setEditing(false)
    showToast("Saved. Room's looking fresh.")
  }

  const buy = async (itemId: string) => {
    if (!room || busy) return
    setBusy(true)
    const result = await buyRoomItem(itemId, 1, newIdempotencyKey())
    setBusy(false)
    if (!result.ok) {
      showToast(result.error)
      return
    }
    applyServerState(result.state)
    setRoom(result.room)
    setDraft(result.room.items)
    setTab('bag')
    const bought = result.bought[0]
    if (bought) {
      const spot = firstFreeSpot(result.room.items, bought.itemId, bought.uid, result.room.tier)
      if (spot) {
        const placed = result.room.items.map((row) =>
          row.uid === bought.uid ? { ...row, placed: true, x: spot.x, z: spot.z } : row,
        )
        setDraft(placed)
        setSelected(bought.uid)
        setEditing(true)
      }
    }
    const def = FURNITURE_BY_ID.get(itemId)
    showToast(def?.id === 'standing-fan' ? 'Fan don land! Sleep go sweet now.' : result.message)
  }

  const confirmSell = async () => {
    if (!sellUid || busy) return
    setBusy(true)
    const result = await sellRoomItem(sellUid, newIdempotencyKey())
    setBusy(false)
    setSellUid(null)
    if (!result.ok) {
      showToast(result.error)
      return
    }
    applyServerState(result.state)
    setRoom(result.room)
    setDraft(result.room.items)
    showToast(result.message)
  }

  const confirmStyle = async () => {
    if (!room || !styleDraft || busy) return
    setBusy(true)
    const result = await saveRoomStyle(
      room.version,
      { wallColor: styleDraft.wallColor, floorId: styleDraft.floorId },
      newIdempotencyKey(),
    )
    setBusy(false)
    if (!result.ok) {
      showToast(result.error)
      return
    }
    applyServerState(result.state)
    setRoom(result.room)
    setStyleDraft(result.room.style)
    setOwnedFloors((prev) => new Set(prev).add(result.room.style.floorId))
    showToast(result.charged === 0 ? 'Saved. Room\'s looking fresh.' : result.message)
  }

  const onNav = (tab: PlayTab) => {
    if (tab === 'home') return
    if (tab === 'map') {
      router.push('/')
      return
    }
    stashNavIntent(tab)
    router.push('/')
  }

  const leave = () => {
    if (dirty) {
      setLeaveAsk(true)
      return
    }
    router.push('/')
  }

  if (!room || !styleDraft) {
    return (
      <div className={styles.root}>
        <p className={styles.sub} style={{ margin: 'auto' }}>
          Opening your corner of Ekpoma…
        </p>
      </div>
    )
  }

  const previewRoom = { ...room, style: styleDraft }
  const storage = draft
    .filter((row) => !row.placed)
    .map((row) => {
      const def = FURNITURE_BY_ID.get(row.itemId)
      return { uid: row.uid, itemId: row.itemId, name: def?.name ?? row.itemId, emoji: def?.emoji ?? '📦' }
    })
  const sellDef = sellUid ? FURNITURE_BY_ID.get(draft.find((row) => row.uid === sellUid)?.itemId ?? '') : null
  const refund = Math.floor((sellDef?.price ?? 0) * 0.4)

  const catalog = (
    <RoomCatalog
      room={previewRoom}
      cash={state?.cash ?? 0}
      tab={tab}
      onTab={setTab}
      storageCount={storage.length}
      storageItems={storage}
      busy={busy}
      onBuy={(id) => void buy(id)}
      onSelectStorage={(uid) => {
        const spot = firstFreeSpot(draft, draft.find((r) => r.uid === uid)?.itemId ?? '', uid, room.tier)
        if (!spot) {
          showToast("Something's already there. Try another spot.")
          return
        }
        applyItems(
          draft.map((row) => (row.uid === uid ? { ...row, placed: true, x: spot.x, z: spot.z } : row)),
        )
        setSelected(uid)
        setEditing(true)
      }}
      draftStyle={styleDraft}
      onPreviewStyle={(patch) => setStyleDraft((current) => (current ? { ...current, ...patch } : current))}
      onConfirmStyle={() => void confirmStyle()}
      ownedFloors={ownedFloors}
    />
  )

  return (
    <div className={styles.root}>
      <div className={styles.mainCol}>
        <header className={styles.topBar}>
          <button type="button" className={styles.backBtn} aria-label="Back to map" onClick={leave}>
            ←
          </button>
          <div className={styles.titleBlock}>
            <h1 className={styles.title}>{room.tier.label}</h1>
            <p className={styles.sub}>Your corner of Ekpoma.</p>
          </div>
          <div className={styles.pills}>
            <span className={styles.cashPill} aria-label="Cash">
              <NumberFlow value={state?.cash ?? 0} prefix="₦" format={{ maximumFractionDigits: 0 }} />
            </span>
            <button type="button" className={styles.comfortPill} onClick={() => setComfortOpen(true)}>
              {room.comfort.score} · {room.comfort.label}
            </button>
          </div>
        </header>
        <div className={styles.canvasWrap}>
          <RoomCanvas
            room={previewRoom}
            draftItems={draft}
            selectedUid={selected}
            ghost={ghost}
            editMode={editing}
            period={state?.period}
            lowPerf={lowPerf}
          />
          {editing && selected ? (
            <div className={styles.toolbar}>
              <button type="button" className={styles.ghostBtn} aria-label="Rotate" onClick={() => { hapticTap(); applyItems(rotateItem(draft, selected)) }}>
                Rotate
              </button>
              <button type="button" className={styles.ghostBtn} aria-label="Store" onClick={() => applyItems(storeItem(draft, selected))}>
                Store
              </button>
              <button type="button" className={styles.ghostBtn} aria-label="Sell" onClick={() => setSellUid(selected)}>
                Sell
              </button>
            </div>
          ) : null}
          {toast ? <p className={styles.toast}>{toast}</p> : null}
        </div>
        <footer className={styles.bottomBar}>
          {editing ? (
            <div className={styles.editRow}>
              <button type="button" className={styles.ghostBtn} aria-label="Undo" onClick={() => {
                const undone = undoEdit(stack, draft)
                if (!undone) return
                setStack(undone.stack)
                setDraft(undone.items)
              }}>
                Undo
              </button>
              <button type="button" className={styles.ghostBtn} disabled={busy} onClick={() => {
                setDraft(room.items)
                setStack({ past: [], future: [] })
                setEditing(false)
              }}>
                Cancel
              </button>
              <button type="button" className={styles.primaryBtn} disabled={busy || !dirty} onClick={() => void saveLayout()}>
                Save
              </button>
            </div>
          ) : (
            <button type="button" className={styles.primaryBtn} onClick={() => { setEditing(true); setCatalogOpen(true) }}>
              Edit room
            </button>
          )}
          <div className={styles.mobileCatalog}>
            <button type="button" className={styles.ghostBtn} onClick={() => setCatalogOpen(true)}>
              Catalog
            </button>
          </div>
        </footer>
        <div className={styles.navDock}>
          <PlayNav value="home" onValueChange={onNav} />
        </div>
      </div>
      <aside className={styles.sidePanel}>{catalog}</aside>
      <HudDrawer open={catalogOpen} onOpenChange={setCatalogOpen} title="Furnish your room">
        {catalog}
      </HudDrawer>
      <HudDrawer open={comfortOpen} onOpenChange={setComfortOpen} title="Comfort" description={room.comfort.label}>
        <p>Sleep quality {room.comfort.sleepQuality} · +{room.comfort.sleepEnergyBonusPct}% sleep energy</p>
        <p>Happiness {room.comfort.happiness} · daily fun +{room.comfort.dailyFunBonus}</p>
        <p>Study {room.comfort.study} · Hygiene {room.comfort.hygiene}</p>
      </HudDrawer>
      {sellUid ? (
        <div className={styles.toast} role="dialog" aria-label="Sell item" style={{ top: '40%' }}>
          <p>Sell for ₦{refund.toLocaleString()}?</p>
          <button type="button" className={styles.primaryBtn} disabled={busy} onClick={() => void confirmSell()}>
            Sell
          </button>
          <button type="button" className={styles.ghostBtn} onClick={() => setSellUid(null)}>
            Keep
          </button>
        </div>
      ) : null}
      {leaveAsk ? (
        <div className={styles.toast} role="dialog" aria-label="Unsaved changes" style={{ top: '40%' }}>
          <p>Keep your changes?</p>
          <button type="button" className={styles.primaryBtn} onClick={() => void saveLayout().then(() => router.push('/'))}>
            Save
          </button>
          <button type="button" className={styles.ghostBtn} onClick={() => router.push('/')}>
            Discard
          </button>
        </div>
      ) : null}
    </div>
  )
}
