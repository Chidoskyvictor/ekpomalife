// Ekpoma Life — Tic tac toe. Pass & play with a friend, or play the phone (it never loses).
;(() => {
  const LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ]

  const boardEl = document.getElementById('board')
  const statusEl = document.getElementById('status')
  const againEl = document.getElementById('again')
  const scoreEl = { X: document.getElementById('score-x'), O: document.getElementById('score-o'), D: document.getElementById('score-d') }
  const online = new URLSearchParams(window.location.search).get('online') === '1'
  const whoEl = document.getElementById('who')
  const modeButtons = [...document.querySelectorAll('[data-mode]')]
  const levelButtons = [...document.querySelectorAll('[data-level]')]
  /** How hard the phone plays: easy (mostly random), medium (blocks and wins, but slips), hard (perfect). */
  let level = 'medium'
  try {
    const saved = window.localStorage.getItem('ekpoma-ttt-level')
    if (saved === 'easy' || saved === 'medium' || saved === 'hard') level = saved
  } catch (_) {
    /* storage blocked: stay on medium */
  }

  let board = Array(9).fill(null)
  let turn = 'X'
  let starter = 'X' // who opens the round; swaps every round
  let over = false
  let mode = 'friend' // 'friend' | 'cpu' (you are X, the phone is O)
  const score = { X: 0, O: 0, D: 0 }

  const cells = board.map((_, i) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'cell'
    b.setAttribute('aria-label', `Square ${i + 1}`)
    b.addEventListener('click', () => (online ? onlineTap(i) : play(i, true)))
    boardEl.appendChild(b)
    return b
  })

  function winnerOf(b) {
    for (const line of LINES) {
      const [a, c, d] = line
      if (b[a] && b[a] === b[c] && b[a] === b[d]) return { mark: b[a], line }
    }
    return b.every(Boolean) ? { mark: 'D', line: [] } : null
  }

  // Perfect play for the phone: score each move by looking ahead to the end of the game
  function best(b, me) {
    const them = me === 'X' ? 'O' : 'X'
    function search(state, player, depth) {
      const w = winnerOf(state)
      if (w) return w.mark === me ? 10 - depth : w.mark === them ? depth - 10 : 0
      let top = player === me ? -Infinity : Infinity
      for (let i = 0; i < 9; i++) {
        if (state[i]) continue
        state[i] = player
        const v = search(state, player === 'X' ? 'O' : 'X', depth + 1)
        state[i] = null
        top = player === me ? Math.max(top, v) : Math.min(top, v)
      }
      return top
    }
    let move = -1
    let top = -Infinity
    const open = b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0)
    // A little variety on an empty board
    if (open.length === 9) return [0, 2, 4, 6, 8][Math.floor(Math.random() * 5)]
    for (const i of open) {
      b[i] = me
      const v = search(b, them, 1)
      b[i] = null
      if (v > top) {
        top = v
        move = i
      }
    }
    return move
  }

  /** A square that would finish a line for `who` right now, or -1. */
  function finishing(b, who) {
    for (let i = 0; i < 9; i++) {
      if (b[i]) continue
      b[i] = who
      const w = winnerOf(b)
      b[i] = null
      if (w && w.mark === who) return i
    }
    return -1
  }

  /** The phone's move at the chosen difficulty (the phone is O). */
  function phoneMove(b) {
    const open = b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0)
    const random = () => open[Math.floor(Math.random() * open.length)]
    if (level === 'hard') return best(b, 'O')
    if (level === 'easy') {
      // Takes a win only sometimes, never blocks on purpose
      const win = finishing(b, 'O')
      return win >= 0 && Math.random() < 0.4 ? win : random()
    }
    // Medium: wins when it can, usually blocks, otherwise prefers the middle, and slips now and then
    const win = finishing(b, 'O')
    if (win >= 0) return win
    const block = finishing(b, 'X')
    if (block >= 0 && Math.random() < 0.8) return block
    if (Math.random() < 0.3) return random()
    if (!b[4]) return 4
    return random()
  }

  function render(justPlayed) {
    cells.forEach((c, i) => {
      c.textContent = board[i] || ''
      c.className = `cell${board[i] ? ` ${board[i].toLowerCase()}` : ''}${i === justPlayed ? ' mark' : ''}`
      c.disabled = over || Boolean(board[i]) || (mode === 'cpu' && turn === 'O')
    })
    scoreEl.X.textContent = score.X
    scoreEl.O.textContent = score.O
    scoreEl.D.textContent = score.D
  }

  function play(i, byPerson) {
    if (over || board[i]) return
    if (byPerson && mode === 'cpu' && turn === 'O') return
    board[i] = turn
    const w = winnerOf(board)
    if (w) {
      over = true
      score[w.mark] += 1
      render(i)
      w.line.forEach((k) => cells[k].classList.add('win'))
      statusEl.textContent =
        w.mark === 'D' ? 'Draw!' : mode === 'cpu' ? (w.mark === 'X' ? 'You win! 🎉' : 'The phone wins') : `${w.mark} wins! 🎉`
      return
    }
    turn = turn === 'X' ? 'O' : 'X'
    statusEl.textContent = mode === 'cpu' ? (turn === 'X' ? 'Your turn' : 'Phone is thinking…') : `${turn} to play`
    render(i)
    if (mode === 'cpu' && turn === 'O') window.setTimeout(() => play(phoneMove(board), false), 450)
  }

  function newRound() {
    board = Array(9).fill(null)
    over = false
    turn = starter
    starter = starter === 'X' ? 'O' : 'X'
    statusEl.textContent = mode === 'cpu' ? (turn === 'X' ? 'Your turn' : 'Phone is thinking…') : `${turn} to play`
    render(-1)
    if (mode === 'cpu' && turn === 'O') window.setTimeout(() => play(phoneMove(board), false), 450)
  }

  modeButtons.forEach((b) =>
    b.addEventListener('click', () => {
      if (mode === b.dataset.mode) return
      mode = b.dataset.mode
      modeButtons.forEach((x) => x.setAttribute('aria-checked', String(x === b)))
      score.X = score.O = score.D = 0
      starter = 'X'
      newRound()
    }),
  )
  function showLevel() {
    document.body.classList.toggle('cpu', mode === 'cpu')
    levelButtons.forEach((x) => x.setAttribute('aria-checked', String(x.dataset.level === level)))
  }
  levelButtons.forEach((b) =>
    b.addEventListener('click', () => {
      if (level === b.dataset.level) return
      level = b.dataset.level
      try {
        window.localStorage.setItem('ekpoma-ttt-level', level)
      } catch (_) {
        /* storage blocked */
      }
      showLevel()
      score.X = score.O = score.D = 0
      starter = 'X'
      newRound()
    }),
  )
  modeButtons.forEach((b) => b.addEventListener('click', showLevel))
  showLevel()
  againEl.addEventListener('click', newRound)

  // —— Online: the server keeps the board and judges the win; this page only shows it ——
  // The Games app (parent) passes messages both ways: { target: 'ekpoma-ttt', type: 'init' | 'state' }
  // in, { source: 'ekpoma-ttt', type: 'ready' | 'move' } out.
  let net = { mySeat: 0, names: ['X', 'O'], state: null }

  function onlineTap(i) {
    const st = net.state
    if (!st || st.winnerSeat !== null || st.board[i] || st.turn !== (net.mySeat === 0 ? 'X' : 'O')) return
    window.parent.postMessage({ source: 'ekpoma-ttt', type: 'move', cell: i }, window.location.origin)
  }

  function onlineRender() {
    const st = net.state
    if (!st) {
      statusEl.textContent = 'Connecting…'
      return
    }
    const mine = net.mySeat === 0 ? 'X' : 'O'
    const over = st.winnerSeat !== null
    board = st.board.slice()
    cells.forEach((c, i) => {
      c.textContent = board[i] || ''
      c.className = `cell${board[i] ? ` ${board[i].toLowerCase()}` : ''}${i === st.last ? ' mark' : ''}`
      c.disabled = over || Boolean(board[i]) || st.turn !== mine
    })
    ;(st.line || []).forEach((k) => cells[k].classList.add('win'))
    scoreEl.X.textContent = st.winnerSeat === 0 ? 1 : 0
    scoreEl.O.textContent = st.winnerSeat === 1 ? 1 : 0
    scoreEl.D.textContent = st.draws
    if (over) statusEl.textContent = st.winnerSeat === net.mySeat ? 'You win! 🎉' : `${net.names[st.winnerSeat]} wins`
    else statusEl.textContent = st.turn === mine ? `Your turn (${mine})` : `${net.names[st.turn === 'X' ? 0 : 1]} to play…`
  }

  if (online) {
    document.body.classList.add('online')
    statusEl.textContent = 'Connecting…'
    window.addEventListener('message', (event) => {
      if (event.source !== window.parent || event.origin !== window.location.origin) return
      const m = event.data
      if (!m || m.target !== 'ekpoma-ttt') return
      if (m.type === 'init') {
        net.mySeat = m.mySeat === 1 ? 1 : 0
        net.names = Array.isArray(m.names) ? m.names : net.names
        if (whoEl) whoEl.textContent = m.subtitle || ''
        document.querySelector('.side.x b').textContent = `${net.names[0]} · X`
        document.querySelector('.side.o b').textContent = `${net.names[1]} · O`
        onlineRender()
      } else if (m.type === 'state') {
        net.state = m.state
        onlineRender()
      }
    })
    window.parent.postMessage({ source: 'ekpoma-ttt', type: 'ready' }, window.location.origin)
  } else {
    newRound()
  }
})()
