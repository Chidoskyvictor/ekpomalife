import { beforeEach, describe, expect, it } from 'vitest'
import {
  buyRoomItem,
  fetchRoom,
  fetchVisitRoom,
  newIdempotencyKey,
  saveRoomLayout,
  saveRoomStyle,
  sellRoomItem,
} from './room-api'
import { resetRoomMock } from './room-mock'

describe('room-api (mocks)', () => {
  beforeEach(() => {
    resetRoomMock({ cash: 25_000 })
  })

  it('loads room with free mattress', async () => {
    const result = await fetchRoom()
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.room.items.some((row) => row.itemId === 'mattress-floor' && row.placed)).toBe(true)
    expect(result.catalog.length).toBeGreaterThan(10)
  })

  it('buy success updates cash once on idempotent retry', async () => {
    const key = newIdempotencyKey()
    const first = await buyRoomItem('plastic-chair', 1, key)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const cashAfter = first.state.cash
    const second = await buyRoomItem('plastic-chair', 1, key)
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.state.cash).toBe(cashAfter)
  })

  it('insufficient funds copy', async () => {
    resetRoomMock({ cash: 100 })
    const result = await buyRoomItem('standing-fan', 1, newIdempotencyKey())
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/shortfall/i)
  })

  it('layout save and overlap reject with uid', async () => {
    const room = await fetchRoom()
    if (!room.ok) throw new Error('room')
    const keyBuy = newIdempotencyKey()
    const bought = await buyRoomItem('standing-fan', 1, keyBuy)
    expect(bought.ok).toBe(true)
    if (!bought.ok) return
    const latest = bought.room
    const fan = latest.items.find((row) => row.itemId === 'standing-fan')!
    const mattress = latest.items.find((row) => row.itemId === 'mattress-floor')!
    const bad = await saveRoomLayout(
      latest.version,
      latest.items.map((row) =>
        row.uid === fan.uid
          ? { uid: row.uid, placed: true, x: mattress.x, z: mattress.z, rotation: 0 as const }
          : {
              uid: row.uid,
              placed: row.placed,
              x: row.x,
              z: row.z,
              rotation: row.rotation,
            },
      ),
      newIdempotencyKey(),
    )
    expect(bad.ok).toBe(false)
    if (bad.ok) return
    expect(bad.code).toBe('OVERLAP')

    const good = await saveRoomLayout(
      latest.version,
      latest.items.map((row) =>
        row.uid === fan.uid
          ? { uid: row.uid, placed: true, x: 4, z: 0, rotation: 0 as const }
          : {
              uid: row.uid,
              placed: row.placed,
              x: row.x,
              z: row.z,
              rotation: row.rotation,
            },
      ),
      newIdempotencyKey(),
    )
    expect(good.ok).toBe(true)
  })

  it('version conflict reloads room', async () => {
    const room = await fetchRoom()
    if (!room.ok) throw new Error('room')
    const stale = await saveRoomLayout(
      room.room.version - 1,
      room.room.items.map((row) => ({
        uid: row.uid,
        placed: row.placed,
        x: row.x,
        z: row.z,
        rotation: row.rotation,
      })),
      newIdempotencyKey(),
    )
    expect(stale.ok).toBe(false)
    if (stale.ok) return
    expect(stale.code).toBe('VERSION_CONFLICT')
    expect(stale.room).toBeTruthy()
  })

  it('style charge vs free default colour', async () => {
    const room = await fetchRoom()
    if (!room.ok) throw new Error('room')
    const painted = await saveRoomStyle(room.room.version, { wallColor: '#DCE8F2' }, newIdempotencyKey())
    expect(painted.ok).toBe(true)
    if (!painted.ok) return
    expect(painted.charged).toBe(1500)

    const free = await saveRoomStyle(
      painted.room.version,
      { wallColor: '#F2EDE4' },
      newIdempotencyKey(),
    )
    expect(free.ok).toBe(true)
    if (!free.ok) return
    expect(free.charged).toBe(0)
  })

  it('visit other username is 403 stub', async () => {
    const result = await fetchVisitRoom('someone-else')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('VISITS_DISABLED')
  })

  it('cannot sell starter mattress', async () => {
    const room = await fetchRoom()
    if (!room.ok) throw new Error('room')
    const starter = room.room.items.find((row) => row.itemId === 'mattress-floor')!
    const result = await sellRoomItem(starter.uid, newIdempotencyKey())
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('CANT_SELL_STARTER')
  })
})
