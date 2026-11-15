// Ekpoma Life chess: board UI. Rules: chess.js. Modes: local (pass & play), cpu, online.
// Online: the Games app (parent) holds the socket; the server validates moves and runs the clocks.
import { Chess } from './chess.js'
import { bestMove } from './engine.js'
import { LESSONS } from './lessons.js'

const $ = (id) => document.getElementById(id)
const GLYPH = { k: '♚︎', q: '♛︎', r: '♜︎', b: '♝︎', n: '♞︎', p: '♟︎' }
const FILES = 'abcdefgh'

let cfg = { mode: 'local', seat: 0, names: ['White', 'Black'], level: 'medium', subtitle: '' }
let game = new Chess()
let flipped = false
let selected = null
let legal = []
let last = null
let over = null // { title, text }
let pendingPromo = null
let thinking = false
let started = true
// online clocks: remaining ms for [white, black] at `clockAt`, ticking for `turnSeat`
let clocks = [0, 0]
let clockAt = 0
let turnSeat = 0
let online = { over: null, opponentHere: true }
let resignArmed = 0
let drawOffer = null
/* Learn mode: lessons, hints from a coach, a tip for the piece you touch */
const NAME = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }
const TIPS = {
  p: 'Pawn: one step forward (two from its start square). It captures diagonally.',
  n: 'Knight: moves in an L shape and can jump over other pieces.',
  b: 'Bishop: any distance diagonally, always on the same colour.',
  r: 'Rook: any distance in a straight line.',
  q: 'Queen: any distance, in a straight line or diagonally.',
  k: 'King: one step in any direction, never into danger.',
}
let lesson = null
let hint = null
let tipText = ''
let learned = new Set()
try {
  learned = new Set(JSON.parse(localStorage.getItem('ekpoma-chess-learned') || '[]'))
} catch (_) {}
const COACH_BTNS = { hint: true, undo: true, lessons: true }
const WORTH = { p: 1, n: 3, b: 3, r: 5, q: 9 }
const START = { p: 8, n: 2, b: 2, r: 2, q: 1 }

function post(msg) {
  try {
    parent.postMessage({ source: 'ekpoma-game', game: 'chess', ...msg }, '*')
  } catch (_) {}
}

/* ---------- board ---------- */
const boardEl = $('board')
const squares = {}
for (let r = 0; r < 8; r++) {
  for (let c = 0; c < 8; c++) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'sq'
    b.addEventListener('click', () => onSquare(b.dataset.sq))
    boardEl.appendChild(b)
  }
}
const cells = [...boardEl.children]

const mySide = () => (cfg.mode === 'online' ? (cfg.seat === 0 ? 'w' : 'b') : cfg.mode === 'cpu' || cfg.mode === 'learn' ? 'w' : null)

function render() {
  const order = []
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) order.push([flipped ? 7 - r : r, flipped ? 7 - c : c])
  const kingInCheck = game.isCheck() ? kingSquare(game.turn()) : null
  cells.forEach((el, i) => {
    const [r, c] = order[i]
    const sq = FILES[c] + (8 - r)
    const piece = game.get(sq)
    el.dataset.sq = sq
    el.className =
      'sq' +
      ((r + c) % 2 === 1 ? ' dark' : '') +
      (last && (last.from === sq || last.to === sq) ? ' last' : '') +
      (selected === sq ? ' sel' : '') +
      (hint && (hint.from === sq || hint.to === sq) ? ' hint' : '') +
      (kingInCheck === sq ? ' check' : '')
    const target = legal.find((m) => m.to === sq)
    el.setAttribute('aria-label', `${sq}${piece ? ' ' + piece.color + piece.type : ''}`)
    el.innerHTML =
      (piece ? `<span class="p ${piece.color}">${GLYPH[piece.type]}</span>` : '') +
      (target ? (piece ? '<span class="ring"></span>' : '<span class="dot"></span>') : '') +
      (i % 8 === 0 ? `<span class="rank">${8 - r}</span>` : '') +
      (i >= 56 ? `<span class="file">${FILES[c]}</span>` : '')
  })
  renderBars()
  renderStatus()
}

function kingSquare(color) {
  for (const row of game.board()) for (const p of row) if (p && p.type === 'k' && p.color === color) return p.square
  return null
}

/* ---------- names, clocks, status ---------- */
function nameOfSide(color) {
  return cfg.names[color === 'w' ? 0 : 1]
}
/* Pieces each side has taken, worked out from what is missing on the board */
function tookLine(color) {
  // pieces `color` has captured = opponent pieces missing
  const opp = color === 'w' ? 'b' : 'w'
  const have = { p: 0, n: 0, b: 0, r: 0, q: 0 }
  let mine = 0
  let theirs = 0
  for (const row of game.board())
    for (const p of row) {
      if (!p || p.type === 'k') continue
      if (p.color === opp) have[p.type]++
      const w = WORTH[p.type]
      if (p.color === color) mine += w
      else theirs += w
    }
  let glyphs = ''
  for (const t of ['q', 'r', 'b', 'n', 'p']) glyphs += GLYPH[t].repeat(Math.max(0, START[t] - have[t]))
  const lead = mine - theirs
  return { glyphs, lead }
}
function setTook(el, color) {
  if (cfg.mode === 'learn') return void (el.innerHTML = '') // lesson positions aren't full games
  const { glyphs, lead } = tookLine(color)
  el.innerHTML = glyphs + (lead > 0 ? `<small>+${lead}</small>` : '')
}
function renderBars() {
  const bottomColor = flipped ? 'b' : 'w'
  const topColor = bottomColor === 'w' ? 'b' : 'w'
  $('botName').textContent = nameOfSide(bottomColor)
  $('topName').textContent = nameOfSide(topColor)
  setTook($('botTook'), bottomColor)
  setTook($('topTook'), topColor)
  const turn = game.turn()
  $('botBar').classList.toggle('turn', !over && started && turn === bottomColor)
  $('topBar').classList.toggle('turn', !over && started && turn === topColor)
  const showClock = cfg.mode === 'online'
  $('botClock').hidden = $('topClock').hidden = !showClock
  tickClocks()
}
const fmt = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
function tickClocks() {
  if (cfg.mode !== 'online') return
  const now = Date.now()
  const left = clocks.slice()
  if (started && !online.over && !over) left[turnSeat] = Math.max(0, left[turnSeat] - (now - clockAt))
  const bottomSeat = flipped ? 1 : 0
  const set = (el, ms) => {
    el.textContent = fmt(ms)
    el.classList.toggle('low', ms < 30_000)
  }
  set($('botClock'), left[bottomSeat])
  set($('topClock'), left[1 - bottomSeat])
}
setInterval(tickClocks, 250)

function renderStatus() {
  const el = $('status')
  let text = ''
  let alert = false
  if (over) text = over.title
  else if (cfg.mode === 'online' && !started) text = `Waiting for ${cfg.names[1 - cfg.seat]} to sit down…`
  else if (selected && tipText && (cfg.mode === 'learn' || cfg.coach)) text = tipText
  else if (cfg.mode === 'learn') text = lesson ? (lesson.done ? 'Well done!' : `Lesson ${lesson.i + 1} of ${LESSONS.length}`) : ''
  else if (thinking) text = cfg.coach ? 'Coach is thinking…' : 'Phone is thinking…'
  else {
    const mine = mySide()
    const turn = game.turn()
    const who = mine ? (turn === mine ? 'Your move' : `${cfg.mode === 'cpu' ? 'Phone' : cfg.names[1 - cfg.seat]} to move`) : turn === 'w' ? 'White to move' : 'Black to move'
    alert = game.isCheck()
    text = alert ? `Check! ${who}` : who
  }
  el.textContent = text
  el.classList.toggle('alert', alert)
}

/* ---------- input ---------- */
function canAct() {
  if (over || pendingPromo || thinking) return false
  if (cfg.mode === 'learn' && (!lesson || lesson.done)) return false
  if (cfg.mode === 'online') return started && !online.over
  return true
}
function onSquare(sq) {
  if (!canAct()) return
  if (selected && legal.some((m) => m.to === sq)) return tryMove(selected, sq)
  const piece = game.get(sq)
  const mine = mySide()
  if (piece && piece.color === game.turn() && (!mine || piece.color === mine)) {
    selected = sq
    tipText = TIPS[piece.type]
    legal = game.moves({ square: sq, verbose: true })
  } else {
    selected = null
    tipText = ''
    legal = []
  }
  render()
}
function tryMove(from, to) {
  const candidates = legal.filter((m) => m.to === to)
  if (candidates.some((m) => m.promotion)) {
    pendingPromo = { from, to }
    const box = $('promo')
    box.innerHTML = ''
    for (const t of ['q', 'r', 'b', 'n']) {
      const b = document.createElement('button')
      b.type = 'button'
      b.textContent = GLYPH[t]
      b.setAttribute('aria-label', 'Promote')
      b.addEventListener('click', () => {
        const p = pendingPromo
        pendingPromo = null
        $('promoBox').classList.remove('on')
        play(p.from, p.to, t)
      })
      box.appendChild(b)
    }
    $('promoBox').classList.add('on')
    return
  }
  play(from, to, undefined)
}

function play(from, to, promotion) {
  let made
  try {
    made = game.move({ from, to, promotion })
  } catch (_) {
    selected = null
    legal = []
    return render()
  }
  hint = null
  tipText = ''
  if (cfg.mode === 'learn') return checkLesson(made)
  last = { from: made.from, to: made.to }
  selected = null
  legal = []
  if (cfg.mode === 'online') {
    post({ type: 'move', from, to, promotion })
    render()
    return
  }
  afterMove()
}

function offlineEnd() {
  if (game.isCheckmate()) {
    const winner = game.turn() === 'w' ? 'b' : 'w'
    const you = cfg.mode === 'cpu' ? (winner === 'w' ? 'You win!' : 'Phone wins') : `${winner === 'w' ? 'White' : 'Black'} wins`
    return { title: 'Checkmate', text: you, winner: winner === 'w' ? 0 : 1 }
  }
  if (game.isStalemate()) return { title: 'Stalemate', text: 'Draw — no legal moves.', winner: null }
  if (game.isInsufficientMaterial()) return { title: 'Draw', text: 'Not enough pieces to checkmate.', winner: null }
  if (game.isThreefoldRepetition()) return { title: 'Draw', text: 'Same position three times.', winner: null }
  if (game.isDraw()) return { title: 'Draw', text: '50 moves without a capture or pawn move.', winner: null }
  return null
}

function afterMove() {
  const end = offlineEnd()
  if (end) {
    over = end
    render()
    showOver(end.title, end.text, true)
    post({ type: 'over', winner: end.winner })
    return
  }
  render()
  if (cfg.mode === 'cpu' && game.turn() === 'b') phoneMove()
}

/* ---------- vs the phone ---------- */
let worker = null
let workerFailed = false
let jobId = 0
function ask(fen, level) {
  return new Promise((resolve) => {
    const id = ++jobId
    if (!worker && !workerFailed) {
      try {
        worker = new Worker('engine.js', { type: 'module' })
      } catch (_) {
        workerFailed = true
      }
    }
    if (worker) {
      worker.onmessage = (e) => e.data.id === id && resolve(e.data.move)
      worker.onerror = () => {
        workerFailed = true
        worker = null
        resolve(bestMove(fen, level))
      }
      worker.postMessage({ id, fen, level })
    } else setTimeout(() => resolve(bestMove(fen, level)), 30)
  })
}
async function phoneMove() {
  thinking = true
  renderStatus()
  const started = Date.now()
  const move = await ask(game.fen(), cfg.level)
  // Never snap back instantly: feels more like an opponent
  await new Promise((r) => setTimeout(r, Math.max(0, 450 - (Date.now() - started))))
  thinking = false
  if (!move || over || cfg.mode !== 'cpu') return render()
  const made = game.move(move)
  last = { from: made.from, to: made.to }
  if (cfg.coach && !offlineEnd()) setCoach(`The coach played ${made.san}. Your move! Stuck? Tap Hint.`, COACH_BTNS)
  afterMove()
}

/* ---------- learn mode ---------- */
function setCoach(text, btns = {}) {
  const on = cfg.mode === 'learn' || !!cfg.coach
  $('coach').hidden = !on
  $('shell').classList.toggle('learn', on)
  if (!on) return
  $('coachText').textContent = text
  for (const [id, key] of [['coachHint', 'hint'], ['coachUndo', 'undo'], ['coachRetry', 'retry'], ['coachLessons', 'lessons'], ['coachNext', 'next']]) {
    $(id).hidden = !btns[key]
  }
}

function showLearn() {
  const list = $('learnList')
  list.innerHTML = ''
  LESSONS.forEach((l, i) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = `${i + 1}. ${l.title}`
    if (learned.has(i)) b.className = 'done'
    b.addEventListener('click', () => startLesson(i))
    list.appendChild(b)
  })
  $('learn').classList.add('on')
}

function startLesson(i) {
  lesson = { i, done: false }
  const l = LESSONS[i]
  cfg = { ...cfg, mode: 'learn', coach: false, names: ['You', 'Teacher'] }
  $('learn').classList.remove('on')
  $('over').classList.remove('on')
  game = new Chess(l.fen)
  selected = null
  legal = []
  last = null
  over = null
  hint = null
  tipText = ''
  flipped = false
  $('again').hidden = true
  $('draw').hidden = $('resign').hidden = true
  $('subtitle').textContent = `Lesson ${i + 1} of ${LESSONS.length} · ${l.title}`
  setCoach(l.text, { lessons: true, retry: !!l.goal, next: !l.goal })
  render()
}

function checkLesson(made) {
  const l = LESSONS[lesson.i]
  const g = l.goal
  let ok = false
  if (g === 'check') ok = /[+#]/.test(made.san)
  else if (g === 'mate') ok = made.san.includes('#')
  else if (g) ok = g.to.includes(made.to) && (!g.from || g.from === made.from)
  selected = null
  legal = []
  if (ok) {
    lesson.done = true
    learned.add(lesson.i)
    try {
      localStorage.setItem('ekpoma-chess-learned', JSON.stringify([...learned]))
    } catch (_) {}
    last = { from: made.from, to: made.to }
    setCoach('✅ ' + l.done, { lessons: true, retry: true, next: true })
  } else {
    game.undo()
    setCoach(g ? '🙂 Not quite. ' + l.retry : 'Just look around — nothing counts here. Tap Next when you are ready.', { lessons: true, retry: !!g, next: !g })
  }
  render()
}

function startCoachGame() {
  lesson = null
  cfg = { mode: 'cpu', seat: 0, names: ['You', 'Coach'], level: 'easy', coach: true, subtitle: 'Game with a coach' }
  $('learn').classList.remove('on')
  newGame()
}

async function giveHint() {
  if (thinking || over || game.turn() !== 'w') return
  thinking = true
  setCoach('Let me think…', {})
  renderStatus()
  const m = await ask(game.fen(), 'medium')
  thinking = false
  if (!m || over) return render()
  hint = { from: m.from, to: m.to }
  const mv = game.moves({ verbose: true }).find((x) => x.from === m.from && x.to === m.to)
  let why = ''
  if (mv.captured) why = ` It captures a ${NAME[mv.captured]}.`
  else if (mv.flags.includes('k') || mv.flags.includes('q')) why = ' That is castling — it keeps your king safe.'
  else if (/[+#]/.test(mv.san)) why = ' It gives check!'
  else if (mv.promotion) why = ' Your pawn becomes a new piece!'
  else if ((mv.piece === 'n' || mv.piece === 'b') && m.from[1] === '1') why = ' It brings a piece into the game.'
  setCoach(`💡 Try moving the ${NAME[mv.piece]} from ${m.from} to ${m.to}.${why}`, COACH_BTNS)
  render()
}

function takeBack() {
  if (thinking) return
  const hist = game.history().length
  if (!hist) return
  game.undo()
  if (game.turn() !== 'w' && game.history().length) game.undo()
  over = null
  last = null
  hint = null
  selected = null
  legal = []
  $('over').classList.remove('on')
  setCoach('Taken back. Try a different move!', COACH_BTNS)
  render()
}

$('coachHint').addEventListener('click', giveHint)
$('coachUndo').addEventListener('click', takeBack)
$('coachRetry').addEventListener('click', () => lesson && startLesson(lesson.i))
$('coachLessons').addEventListener('click', showLearn)
$('coachNext').addEventListener('click', () => (lesson && lesson.i + 1 < LESSONS.length ? startLesson(lesson.i + 1) : showLearn()))
$('learnCoach').addEventListener('click', startCoachGame)
$('learnClose').addEventListener('click', () => {
  $('learn').classList.remove('on')
  if (cfg.mode === 'learn' && !lesson) post({ type: 'exit' })
})

/* ---------- overlays ---------- */
function showOver(title, text, canPlayAgain) {
  $('overTitle').textContent = title
  $('overText').textContent = text
  $('overAgain').hidden = !canPlayAgain
  $('over').classList.add('on')
}

/* ---------- start / modes ---------- */
function newGame() {
  game = new Chess()
  selected = null
  legal = []
  last = null
  over = null
  pendingPromo = null
  thinking = false
  started = true
  resignArmed = 0
  hint = null
  tipText = ''
  $('over').classList.remove('on')
  $('promoBox').classList.remove('on')
  $('offer').classList.remove('on')
  drawOffer = null
  const online_ = cfg.mode === 'online'
  $('resign').hidden = !online_
  $('draw').hidden = !online_
  $('again').hidden = online_
  $('resign').textContent = 'Resign'
  $('subtitle').textContent = cfg.subtitle
  if (cfg.coach) setCoach('Welcome! You play white. I will help: tap a piece to see how it moves, tap Hint for a suggestion, or Take back a move.', COACH_BTNS)
  else if (cfg.mode !== 'learn') setCoach('')
  flipped = online_ ? cfg.seat === 1 : false
  if (online_) started = false
  render()
}
function startMode(mode, level) {
  if (mode === 'learn') {
    cfg = { mode: 'learn', seat: 0, names: ['You', 'Teacher'], level: 'easy', coach: false, subtitle: 'Learn to play' }
    lesson = null
    $('menu').classList.remove('on')
    newGame()
    return showLearn()
  }
  cfg = {
    mode,
    seat: 0,
    names: mode === 'cpu' ? ['You', 'Phone'] : ['White', 'Black'],
    level: level || 'medium',
    coach: false,
    subtitle: mode === 'cpu' ? `vs Phone · ${level[0].toUpperCase() + level.slice(1)}` : 'Pass & play',
  }
  $('menu').classList.remove('on')
  newGame()
}

for (const b of document.querySelectorAll('#menu button')) {
  b.addEventListener('click', () => startMode(b.dataset.mode, b.dataset.level))
}
$('close').addEventListener('click', () => post({ type: 'exit' }))
$('overClose').addEventListener('click', () => post({ type: 'exit' }))
$('overView').addEventListener('click', () => $('over').classList.remove('on'))
$('overAgain').addEventListener('click', () => newGame())
$('again').addEventListener('click', () => newGame())
$('flip').addEventListener('click', () => {
  flipped = !flipped
  render()
})
$('draw').addEventListener('click', () => {
  if (drawOffer !== cfg.seat) post({ type: 'draw' })
})
$('offerYes').addEventListener('click', () => post({ type: 'draw' }))
$('offerNo').addEventListener('click', () => post({ type: 'decline' }))
$('resign').addEventListener('click', () => {
  const now = Date.now()
  if (now - resignArmed < 3000) {
    resignArmed = 0
    $('resign').textContent = 'Resign'
    post({ type: 'resign' })
  } else {
    resignArmed = now
    $('resign').textContent = 'Sure?'
    setTimeout(() => {
      if (Date.now() - resignArmed >= 3000) {
        resignArmed = 0
        $('resign').textContent = 'Resign'
      }
    }, 3100)
  }
})

/* ---------- messages from the Games app ---------- */
function applyServerState(s) {
  const prev = game.fen()
  game = new Chess(s.fen)
  last = s.last ? { from: s.last.from, to: s.last.to } : null
  started = s.started
  drawOffer = s.drawOffer ?? null
  const asked = drawOffer != null && drawOffer !== cfg.seat && !s.over
  $('offerText').textContent = `${cfg.names[1 - cfg.seat]} offers a draw.`
  $('offer').classList.toggle('on', asked)
  $('draw').textContent = drawOffer === cfg.seat ? 'Offered' : 'Draw'
  turnSeat = s.turn
  clocks = s.clocks
  clockAt = Date.now()
  if (game.fen() !== prev) {
    selected = null
    legal = []
  }
  if (s.over && !online.over) {
    online.over = s.over
    const iWon = s.over.winner === cfg.seat
    const draw = s.over.winner == null
    const them = cfg.names[1 - cfg.seat]
    const reasons = {
      checkmate: iWon ? 'Checkmate!' : 'Checkmated',
      resign: iWon ? `${them} resigned.` : 'You resigned.',
      timeout: iWon ? `${them} ran out of time.` : 'You ran out of time.',
      agreed: 'Draw agreed.',
      stalemate: 'Stalemate — draw.',
      draw: 'Draw.',
      abandoned: iWon ? `${them} never showed up.` : draw ? 'Nobody showed up.' : 'You were away too long.',
    }
    over = { title: draw ? 'Draw' : iWon ? 'You won! 🏆' : `${them} won`, text: reasons[s.over.reason] || '' }
    showOver(over.title, over.text, false)
  }
  render()
}

window.addEventListener('message', (event) => {
  if (event.source !== parent) return
  const m = event.data
  if (!m || m.target !== 'ekpoma-chess') return
  if (m.type === 'init') {
    cfg = {
      mode: m.mode,
      seat: m.seat ?? 0,
      names: m.names || ['White', 'Black'],
      level: m.level || 'medium',
      coach: false,
      subtitle: m.subtitle || '',
    }
    online = { over: null }
    lesson = null
    $('menu').classList.remove('on')
    clearTimeout(menuTimer)
    newGame()
    if (cfg.mode === 'learn') showLearn()
    if (cfg.mode === 'online') post({ type: 'sync' })
  } else if (m.type === 'state' && cfg.mode === 'online') applyServerState(m.state)
  else if (m.type === 'error' && cfg.mode === 'online') {
    $('status').textContent = m.error
    $('status').classList.add('alert')
  }
})

// Opened on its own (no Games app answering): offer the offline modes
let menuTimer = setTimeout(() => $('menu').classList.add('on'), 700)
newGame()
post({ type: 'ready' })
