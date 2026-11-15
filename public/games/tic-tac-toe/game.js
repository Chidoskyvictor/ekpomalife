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
  const modeButtons = [...document.querySelectorAll('[data-mode]')]

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
    b.addEventListener('click', () => play(i, true))
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
    if (mode === 'cpu' && turn === 'O') window.setTimeout(() => play(best(board, 'O'), false), 450)
  }

  function newRound() {
    board = Array(9).fill(null)
    over = false
    turn = starter
    starter = starter === 'X' ? 'O' : 'X'
    statusEl.textContent = mode === 'cpu' ? (turn === 'X' ? 'Your turn' : 'Phone is thinking…') : `${turn} to play`
    render(-1)
    if (mode === 'cpu' && turn === 'O') window.setTimeout(() => play(best(board, 'O'), false), 450)
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
  againEl.addEventListener('click', newRound)

  newRound()
})()
