import { describe, expect, it } from 'vitest'
import { adminSet, buildBoard, detailLine, type WorthRow } from './forbes-rules.js'

const p = (userId: string, username: string, netWorth: number): WorthRow => ({
  userId, username, displayName: username, netWorth, detail: 'Student', appearance: null, avatarColor: '#000',
})

describe('forbes board', () => {
  const rows = [p('1', 'ada', 500), p('2', 'SamuelBlaze', 99_000_000), p('3', 'bola', 900), p('4', 'chidosky_victory', 5_000_000)]
  const admins = adminSet(' samuelblaze, Chidosky_Victory ,')

  it('drops admins (case-insensitive) from the list and the total', () => {
    const board = buildBoard(rows, admins, '1')
    expect(board.entries.map((e) => e.username)).toEqual(['bola', 'ada'])
    expect(board.total).toBe(2)
    expect(board.me).toMatchObject({ username: 'ada', rank: 2 })
  })

  it('gives admins no rank bar', () => {
    expect(buildBoard(rows, admins, '2').me).toBeNull()
    expect(buildBoard(rows, admins, '4').me).toBeNull()
  })

  it('caps the list but still ranks players below it', () => {
    const many = Array.from({ length: 150 }, (_, i) => p(`u${i}`, `user${i}`, 1000 - i))
    const board = buildBoard(many, new Set(), 'u120')
    expect(board.entries).toHaveLength(100)
    expect(board.total).toBe(150)
    expect(board.me?.rank).toBe(121)
    const next = buildBoard(many, new Set(), 'u120', 100)
    expect(next.entries.map((e) => e.rank)).toEqual(Array.from({ length: 50 }, (_, i) => 101 + i))
  })
})

describe('forbes detail line', () => {
  it('reads role, department and home', () => {
    expect(detailLine('Law', 'selfcon-g2')).toBe('Student · Law · Self-con')
    expect(detailLine('Graduate', 'single-poultry')).toBe('Graduate · Single room')
    expect(detailLine('Law', null)).toBe('Student · Law')
  })
})
