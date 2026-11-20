'use client'

import { X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { destination, HOME, type LudoMove } from '@/lib/game/ludo-engine'
import { playSfx } from '@/lib/audio/sfx'
import { COLOR_DARK, COLOR_HEX, COLOR_NAMES, LANE_CELLS, RING_CELLS, baseSlot, seedXY } from './ludo-geometry'
import styles from './ludo.module.css'

/** What the board needs to draw a match. The server sends exactly this; the local game builds it. */
export type LudoView = {
  colors: number[]
  pos: number[][]
  turn: number
  dice: [number, number] | null
  used: [boolean, boolean]
  moves: LudoMove[]
  winner: number | null
  last: {
    seat: number
    roll?: [number, number]
    move?: { token: number; from: number; to: number; steps: number; captured: { seat: number; token: number }[] }
    passed?: boolean
    n: number
  } | null
  secondsLeft: number
}

type Props = {
  view: LudoView | null
  names: string[]
  /** your seat, or null for pass & play (whoever is on turn acts) */
  mySeat: number | null
  subtitle: string
  onRoll: () => void
  onMove: (move: LudoMove) => void
  onExit: () => void
}

/* ---------- 3D dice ---------- */

const FACE_TURN: Record<number, string> = {
  1: 'rotateX(0deg) rotateY(0deg)',
  2: 'rotateX(-90deg) rotateY(0deg)',
  3: 'rotateY(-90deg)',
  4: 'rotateY(90deg)',
  5: 'rotateX(90deg)',
  6: 'rotateY(180deg)',
}

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

function Face({ n, cls }: { n: number; cls: string }) {
  return (
    <div className={`${styles.face} ${cls}`}>
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={PIPS[n]!.includes(i) ? styles.pip : styles.nopip} />
      ))}
    </div>
  )
}

export function Die3D({ value, rolling, spent }: { value: number | null; rolling: boolean; spent?: boolean }) {
  const turn = FACE_TURN[value ?? 1]!
  return (
    <div className={`${styles.die} ${spent ? styles.dieSpent : ''}`} aria-label={value ? `Die showing ${value}` : 'Die'}>
      <div
        className={`${styles.cube} ${rolling ? styles.cubeRolling : ''}`}
        style={rolling ? undefined : { transform: `rotateX(-24deg) rotateY(-30deg) ${turn}` }}
      >
        <Face n={1} cls={styles.f1} />
        <Face n={6} cls={styles.f6} />
        <Face n={3} cls={styles.f3} />
        <Face n={4} cls={styles.f4} />
        <Face n={2} cls={styles.f2} />
        <Face n={5} cls={styles.f5} />
      </div>
    </div>
  )
}

/* ---------- board ---------- */

function Board() {
  const cells: React.ReactNode[] = []
  RING_CELLS.forEach(([c, r], i) => {
    const startOf = [0, 13, 26, 39].indexOf(i)
    cells.push(
      <rect
        key={`r${i}`}
        x={c + 0.04}
        y={r + 0.04}
        width={0.92}
        height={0.92}
        rx={0.16}
        fill={startOf >= 0 ? COLOR_HEX[startOf] : '#fffdf6'}
        stroke="rgb(0 0 0 / 0.18)"
        strokeWidth={0.04}
      />,
    )
    if (startOf >= 0) {
      cells.push(
        <polygon
          key={`s${i}`}
          points={`${c + 0.5},${r + 0.2} ${c + 0.62},${r + 0.45} ${c + 0.88},${r + 0.45} ${c + 0.67},${r + 0.62} ${c + 0.75},${r + 0.88} ${c + 0.5},${r + 0.72} ${c + 0.25},${r + 0.88} ${c + 0.33},${r + 0.62} ${c + 0.12},${r + 0.45} ${c + 0.38},${r + 0.45}`}
          fill="#fffdf6"
          opacity={0.9}
        />,
      )
    }
  })
  LANE_CELLS.forEach((lane, color) =>
    lane.forEach(([c, r], i) =>
      cells.push(
        <rect
          key={`l${color}${i}`}
          x={c + 0.04}
          y={r + 0.04}
          width={0.92}
          height={0.92}
          rx={0.16}
          fill={COLOR_HEX[color]}
          opacity={0.88}
          stroke="rgb(0 0 0 / 0.18)"
          strokeWidth={0.04}
        />,
      ),
    ),
  )
  const bases = [
    [0, 0],
    [9, 0],
    [9, 9],
    [0, 9],
  ]
  return (
    <>
      <rect x={0} y={0} width={15} height={15} rx={0.7} fill="#f3e7c9" />
      {bases.map(([x, y], color) => (
        <g key={`b${color}`}>
          <rect x={x} y={y} width={6} height={6} rx={0.6} fill={COLOR_HEX[color]} />
          <rect x={x + 0.9} y={y + 0.9} width={4.2} height={4.2} rx={0.8} fill="#fffdf6" opacity={0.94} />
          {[0, 1, 2, 3].map((t) => {
            const [sx, sy] = baseSlot(color, t)
            return (
              <circle key={t} cx={sx} cy={sy} r={0.58} fill={COLOR_HEX[color]} opacity={0.22} stroke={COLOR_DARK[color]} strokeWidth={0.05} />
            )
          })}
        </g>
      ))}
      {cells}
      {/* the home triangles */}
      <polygon points="6,6 7.5,7.5 6,9" fill={COLOR_HEX[0]} />
      <polygon points="6,6 9,6 7.5,7.5" fill={COLOR_HEX[1]} />
      <polygon points="9,6 9,9 7.5,7.5" fill={COLOR_HEX[2]} />
      <polygon points="6,9 9,9 7.5,7.5" fill={COLOR_HEX[3]} />
      <rect x={6} y={6} width={3} height={3} fill="none" stroke="rgb(0 0 0 / 0.25)" strokeWidth={0.05} />
    </>
  )
}

function Seed({
  color,
  x,
  y,
  movable,
  selected,
  onClick,
  label,
}: {
  color: number
  x: number
  y: number
  movable: boolean
  selected: boolean
  onClick: () => void
  label: string
}) {
  return (
    <g
      className={`${styles.seed} ${movable ? styles.seedMovable : ''} ${selected ? styles.seedSelected : ''}`}
      style={{ transform: `translate(${x}px, ${y}px)` }}
      onClick={movable ? onClick : undefined}
      role={movable ? 'button' : undefined}
      aria-label={movable ? label : undefined}
    >
      <ellipse cx={0.04} cy={0.36} rx={0.4} ry={0.15} fill="rgb(0 0 0 / 0.3)" />
      {movable ? <circle r={0.62} fill="none" stroke="#fff" strokeWidth={0.1} className={styles.halo} /> : null}
      <circle r={0.44} fill={COLOR_DARK[color]} />
      <circle r={0.4} cy={-0.05} fill={COLOR_HEX[color]} stroke="#fff" strokeWidth={0.07} />
      <circle r={0.16} cx={-0.13} cy={-0.2} fill="#fff" opacity={0.7} />
      {/* big touch target */}
      {movable ? <circle r={0.75} fill="transparent" /> : null}
    </g>
  )
}

/* ---------- screen ---------- */

export function LudoScreen({ view, names, mySeat, subtitle, onRoll, onMove, onExit }: Props) {
  const [selected, setSelected] = useState<number | null>(null)
  const [rolling, setRolling] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const lastN = useRef<number | null>(null)

  const turn = view?.turn ?? 0
  const iAct = view != null && view.winner == null && (mySeat == null || mySeat === turn)
  const canRoll = iAct && view!.dice == null
  const moves = useMemo(() => (iAct && view ? view.moves : []), [iAct, view])

  // Dice tumble and little announcements when something new happens
  useEffect(() => {
    const last = view?.last
    if (!last || last.n === lastN.current) return
    const first = lastN.current == null
    lastN.current = last.n
    if (first) return
    let timer: number | undefined
    if (last.roll) {
      setRolling(true)
      playSfx('cardPlay')
      timer = window.setTimeout(() => setRolling(false), 650)
    }
    const who = names[last.seat] ?? 'Player'
    if (last.move?.captured.length) {
      setToast(`${who} sent ${last.move.captured.length > 1 ? 'seeds' : 'a seed'} home!`)
      playSfx('lose')
    } else if (last.move && last.move.to === HOME) setToast(`${who} got a seed home!`)
    else if (last.move && last.move.from === -1) setToast(`${who} brought a seed out`)
    else if (last.passed) setToast(`${who} has no move`)
    else setToast(null)
    const t2 = window.setTimeout(() => setToast(null), 2000)
    return () => {
      window.clearTimeout(timer)
      window.clearTimeout(t2)
    }
  }, [view?.last, names])

  useEffect(() => setSelected(null), [view?.dice, view?.turn, view?.used])

  const shown = view?.dice ?? view?.last?.roll ?? null
  const spent = view?.dice ? view.used : [true, true]

  const options = (token: number) => {
    const seen = new Set<string>()
    return moves
      .filter((m) => m.token === token)
      .filter((m) => {
        if (!view?.dice) return false
        const steps = m.die === 'sum' ? view.dice[0] + view.dice[1] : view.dice[m.die]
        const key = `${m.die === 'sum' ? 's' : 'd'}${steps}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
  }

  const movableTokens = new Set(moves.map((m) => m.token))
  // a base seed counts once: the first base seed stands for all of them
  const firstBase = view ? view.pos[turn]?.findIndex((p) => p === -1) ?? -1 : -1

  const tapSeed = (token: number) => {
    const opts = options(token)
    if (opts.length === 1) return onMove(opts[0]!)
    setSelected(token === selected ? null : token)
  }

  const stepsOf = (m: LudoMove) => (m.die === 'sum' ? view!.dice![0] + view!.dice![1] : view!.dice![m.die])

  // group seeds sharing a cell so they sit side by side
  const seeds: { seat: number; token: number; x: number; y: number; step: number }[] = []
  if (view) {
    const groups = new Map<string, { seat: number; token: number; step: number; xy: [number, number] }[]>()
    view.pos.forEach((tokens, seat) =>
      tokens.forEach((step, token) => {
        const xy = seedXY(view.colors[seat]!, step, token)
        const key = step < 0 || step === HOME ? `${seat}-${token}` : `${xy[0]},${xy[1]}`
        const list = groups.get(key) ?? []
        list.push({ seat, token, step, xy })
        groups.set(key, list)
      }),
    )
    groups.forEach((list) =>
      list.forEach((s, i) => {
        const n = list.length
        const off = n === 1 ? 0 : (i - (n - 1) / 2) * 0.34
        seeds.push({ seat: s.seat, token: s.token, step: s.step, x: s.xy[0] + off, y: s.xy[1] - (n > 1 ? 0.05 : 0) })
      }),
    )
  }
  seeds.sort((a, b) => a.y - b.y)

  const selectedOptions = selected != null ? options(selected) : []
  const ghosts =
    view && selected != null
      ? selectedOptions.map((m) => {
          const from = view.pos[turn]![selected]!
          const to = destination(from, stepsOf(m))!
          const xy = seedXY(view.colors[turn]!, to, selected)
          return { m, xy, steps: stepsOf(m) }
        })
      : []

  const status = !view
    ? 'Connecting…'
    : view.winner != null
      ? view.winner === mySeat
        ? 'You won! 🏆'
        : `${names[view.winner] ?? COLOR_NAMES[view.colors[view.winner]!]} won`
      : iAct
        ? view.dice == null
          ? 'Your turn — roll the dice'
          : selectedOptions.length
            ? 'Tap where to move'
            : 'Tap a glowing seed'
        : `${names[turn] ?? 'Player'} is playing…`

  return (
    <div className={styles.root}>
      <div className={styles.topBar}>
        <button type="button" onClick={onExit} aria-label="Exit">
          <X size={18} />
        </button>
        <div className={styles.title}>
          <strong>Naija Ludo</strong>
          <span>{subtitle}</span>
        </div>
        <div className={`${styles.timer} ${iAct ? styles.timerMine : ''}`}>{view && view.winner == null ? view.secondsLeft : '—'}</div>
      </div>

      <div className={styles.players}>
        {(view?.colors ?? []).map((color, seat) => {
          const home = view!.pos[seat]!.filter((p) => p === HOME).length
          return (
            <div key={seat} className={`${styles.chip} ${view!.turn === seat && view!.winner == null ? styles.chipTurn : ''}`}>
              <span className={styles.chipDot} style={{ background: COLOR_HEX[color] }} />
              <span className={styles.chipName}>{seat === mySeat ? 'You' : (names[seat] ?? COLOR_NAMES[color])}</span>
              <b>{home}/4</b>
            </div>
          )
        })}
      </div>

      <div className={styles.boardWrap}>
        <svg className={styles.board} viewBox="0 0 15 15" role="img" aria-label="Ludo board">
          <Board />
          {ghosts.map((g) => (
            <g key={`${g.m.die}`} className={styles.ghost} style={{ transform: `translate(${g.xy[0]}px, ${g.xy[1]}px)` }} onClick={() => onMove(g.m)} role="button" aria-label={`Move ${g.steps}`}>
              <circle r={0.52} fill="#fff" stroke={COLOR_HEX[view!.colors[turn]!]} strokeWidth={0.12} />
              <text y={0.2} textAnchor="middle" fontSize={0.62} fontWeight={900} fill="#222">
                {g.steps}
              </text>
              <circle r={0.85} fill="transparent" />
            </g>
          ))}
          {seeds.map((s) => {
            const mine = view!.turn === s.seat && movableTokens.has(s.token)
            const movable = mine && (s.step !== -1 || s.token === firstBase)
            return (
              <Seed
                key={`${s.seat}-${s.token}`}
                color={view!.colors[s.seat]!}
                x={s.x}
                y={s.y}
                movable={movable}
                selected={selected === s.token && view!.turn === s.seat}
                onClick={() => tapSeed(s.token)}
                label={`Move ${COLOR_NAMES[view!.colors[s.seat]!]} seed`}
              />
            )
          })}
        </svg>
        {toast ? <div className={styles.toast}>{toast}</div> : null}
      </div>

      <div className={`${styles.status} ${iAct ? styles.statusMine : ''}`}>{status}</div>

      <div className={styles.tray}>
        <div className={styles.dicePair}>
          <Die3D value={shown ? shown[0] : null} rolling={rolling} spent={Boolean(view?.dice && spent[0])} />
          <Die3D value={shown ? shown[1] : null} rolling={rolling} spent={Boolean(view?.dice && spent[1])} />
        </div>
        <button type="button" className={styles.rollBtn} disabled={!canRoll} onClick={onRoll}>
          {canRoll ? 'Roll dice' : view?.dice && iAct ? `${view.dice[0] + view.dice[1]} to play` : 'Wait…'}
        </button>
      </div>

      {view?.winner != null ? (
        <div className={styles.over}>
          <div className={styles.overCard}>
            <span className={styles.overDot} style={{ background: COLOR_HEX[view.colors[view.winner]!] }} />
            <strong>{status}</strong>
            <button type="button" className={styles.rollBtn} onClick={onExit}>
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
