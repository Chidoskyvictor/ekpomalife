import { describe, expect, it } from 'vitest'
import { pushEdit, rotateItem, undoEdit } from './room-edit'
import type { RoomItem } from './room-types'

const mattress: RoomItem = {
  uid: 'a',
  itemId: 'mattress-floor',
  placed: true,
  x: 0,
  z: 0,
  rotation: 0,
}

describe('room edit undo', () => {
  it('rotate then undo restores rotation', () => {
    const rotated = rotateItem([mattress], 'a')
    expect(rotated[0]?.rotation).toBe(90)
    const stacked = pushEdit({ past: [], future: [] }, [mattress], rotated)
    const undone = undoEdit(stacked, rotated)
    expect(undone?.items[0]?.rotation).toBe(0)
  })
})
