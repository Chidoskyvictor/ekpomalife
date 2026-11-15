/*
 * Ludo for Ekpoma Life: our own code. One page, three ways to play:
 *   local  – 2–4 players pass & play on one phone
 *   cpu    – you against 1–3 phone players
 *   online – 1v1; the SERVER rolls the dice and checks every move (backend ludo-live.ts).
 *            This page only draws the board the server sends and asks to "roll" / "move".
 * The phone app talks to this page by postMessage (source/target 'ekpoma-ludo').
 *
 * Rules: ring of 52 cells; colour c enters at ring cell c*13, walks steps 0..50, then its home
 * lane (51..55), home = 56. Roll a 6 to leave base; a 6 rolls again; landing on an opponent
 * outside a safe cell sends it back to base; exact roll needed to get home.
 * (The rule functions below mirror backend/src/game/ludo-engine.ts, used offline only.)
 */
(function () {
  'use strict';

  var HOME = 56;
  var COLOR = ['#e53935', '#43a047', '#fdd835', '#1e88e5'];
  var COLOR_DARK = ['#b71c1c', '#1b5e20', '#f9a825', '#0d47a1'];
  var COLOR_SOFT = ['#ffcdd2', '#c8e6c9', '#fff9c4', '#bbdefb'];
  var COLOR_NAME = ['Red', 'Green', 'Yellow', 'Blue'];

  // The 52 ring cells (x, y on a 15×15 grid), clockwise from red's start cell
  var RING = [
    [1, 6], [2, 6], [3, 6], [4, 6], [5, 6], [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0], [7, 0], [8, 0],
    [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6], [14, 7], [14, 8],
    [13, 8], [12, 8], [11, 8], [10, 8], [9, 8], [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14], [7, 14], [6, 14],
    [6, 13], [6, 12], [6, 11], [6, 10], [6, 9], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8], [0, 7], [0, 6]
  ];
  var LANE = [
    [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
    [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
    [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
    [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]]
  ];
  var HOME_SPOT = [[6.55, 7.5], [7.5, 6.55], [8.45, 7.5], [7.5, 8.45]];
  var BASE_ORIGIN = [[0, 0], [9, 0], [9, 9], [0, 9]];
  var SLOT = [[2.2, 2.2], [3.8, 2.2], [2.2, 3.8], [3.8, 3.8]];

  var NS = 'http://www.w3.org/2000/svg';
  var $ = function (id) { return document.getElementById(id); };
  var svg = $('board');

  /* ---------- rules (offline) ---------- */
  function newState(colors) {
    return { colors: colors.slice(), pos: colors.map(function () { return [-1, -1, -1, -1]; }), turn: 0, dice: null, winner: null };
  }
  function ringCell(color, step) { return step < 0 || step > 50 ? null : (color * 13 + step) % 52; }
  function isSafe(cell) { return cell % 13 === 0 || cell % 13 === 8; }
  function legalOf(s) {
    if (s.winner != null || s.dice == null) return [];
    var out = [];
    s.pos[s.turn].forEach(function (p, t) {
      if (p === -1 ? s.dice === 6 : p + s.dice <= HOME) out.push(t);
    });
    return out;
  }
  function nextTurn(s) { s.turn = (s.turn + 1) % s.colors.length; s.dice = null; }
  function rollInto(s, v) {
    s.dice = v;
    if (!legalOf(s).length) { nextTurn(s); return true; }
    return false;
  }
  function moveToken(s, t) {
    var dice = s.dice, seat = s.turn, from = s.pos[seat][t];
    var to = from === -1 ? 0 : from + dice;
    s.pos[seat][t] = to;
    var captured = [];
    var cell = ringCell(s.colors[seat], to);
    if (cell != null && !isSafe(cell)) {
      s.pos.forEach(function (tokens, other) {
        if (other === seat) return;
        tokens.forEach(function (p, i) {
          if (ringCell(s.colors[other], p) === cell) { tokens[i] = -1; captured.push({ seat: other, token: i }); }
        });
      });
    }
    if (s.pos[seat].every(function (p) { return p === HOME; })) { s.winner = seat; s.dice = null; }
    else if (dice === 6) s.dice = null;
    else nextTurn(s);
    return { token: t, from: from, to: to, captured: captured, extra: dice === 6 };
  }
  function cryptoDie() {
    try {
      var a = new Uint32Array(1);
      crypto.getRandomValues(a);
      return (a[0] % 6) + 1;
    } catch (e) { return 1 + Math.floor(Math.random() * 6); }
  }
  function botPick(s) {
    var legal = legalOf(s), best = legal[0], bestScore = -1e9;
    legal.forEach(function (t) {
      var from = s.pos[s.turn][t], to = from === -1 ? 0 : from + s.dice, score = Math.random() * 6;
      if (to === HOME) score += 100;
      var cell = ringCell(s.colors[s.turn], to);
      if (cell != null) {
        if (isSafe(cell)) score += 18;
        else {
          s.pos.forEach(function (tokens, o) {
            if (o === s.turn) return;
            tokens.forEach(function (p) { if (ringCell(s.colors[o], p) === cell) score += 60; });
          });
        }
      }
      if (from === -1) score += 40;
      if (to > 50) score += 15;
      score += from * 0.4;
      if (score > bestScore) { bestScore = score; best = t; }
    });
    return best;
  }

  /* ---------- game session ---------- */
  var cfg = null;          // { mode, n, myIndex, names, subtitle }
  var S = null;            // offline state
  var view = null;         // what we draw: { colors,pos,turn,dice,legal,winner,last,secondsLeft }
  var lastKey = '';
  var timers = [];
  var secondsLeft = null, tickAt = 0;
  var noteText = '';

  function later(fn, ms) { var id = setTimeout(fn, ms); timers.push(id); }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }

  function humanSeat(seat) {
    if (!cfg) return false;
    if (cfg.mode === 'online') return seat === cfg.myIndex;
    if (cfg.mode === 'cpu') return seat === 0;
    return true;
  }

  function start(c) {
    clearTimers();
    cfg = c;
    $('over').hidden = true;
    $('subtitle').textContent = c.subtitle || '';
    if (c.mode === 'online') {
      view = null;
      S = null;
      setStatus('Connecting…');
      renderPlayers();
      return;
    }
    var n = Math.min(4, Math.max(2, c.n || 2));
    cfg.n = n;
    var colors = n === 2 ? [0, 2] : n === 3 ? [0, 1, 2] : [0, 1, 2, 3];
    S = newState(colors);
    if (!cfg.names || cfg.names.length < n) {
      cfg.names = colors.map(function (col, i) {
        return c.mode === 'cpu' ? (i === 0 ? 'You' : 'Phone' + (n > 2 ? ' ' + i : '')) : COLOR_NAME[col];
      });
    }
    lastKey = '';
    setLocalView(null);
    schedule();
  }

  function setLocalView(last) {
    view = { colors: S.colors, pos: S.pos.map(function (a) { return a.slice(); }), turn: S.turn, dice: S.dice, legal: legalOf(S), winner: S.winner, last: last };
    draw();
  }

  function localRoll() {
    if (!S || S.dice != null || S.winner != null) return;
    var seat = S.turn, v = cryptoDie();
    var passed = rollInto(S, v);
    setLocalView({ seat: seat, roll: v, passed: passed });
    schedule();
  }
  function localMove(t) {
    if (!S || legalOf(S).indexOf(t) < 0) return;
    var seat = S.turn, roll = S.dice;
    var move = moveToken(S, t);
    setLocalView({ seat: seat, roll: roll, move: move });
    schedule();
  }
  function schedule() {
    if (!S || S.winner != null) return;
    if (humanSeat(S.turn)) {
      return;
    }
    // A phone player's turn (or a pass): wait a moment so it can be followed
    if (S.dice == null) later(localRoll, 900);
    else later(function () { localMove(botPick(S)); }, 800);
  }

  /* ---------- drawing ---------- */
  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  var tokenEls = {};
  var tokenLayer = null;

  function buildBoard() {
    svg.innerHTML = '';
    el('rect', { x: 0, y: 0, width: 15, height: 15, rx: 0.5, fill: '#fff8e7' }, svg);
    // bases
    for (var c = 0; c < 4; c++) {
      var o = BASE_ORIGIN[c];
      el('rect', { x: o[0], y: o[1], width: 6, height: 6, fill: COLOR[c] }, svg);
      el('rect', { x: o[0] + 1, y: o[1] + 1, width: 4, height: 4, rx: 0.5, fill: '#fff8e7' }, svg);
      SLOT.forEach(function (sl) {
        el('circle', { cx: o[0] + sl[0], cy: o[1] + sl[1], r: 0.5, fill: COLOR_SOFT[c], stroke: COLOR_DARK[c], 'stroke-width': 0.06 }, svg);
      });
    }
    // ring cells
    RING.forEach(function (cell, i) {
      var startOf = i % 13 === 0 ? i / 13 : -1;
      el('rect', { x: cell[0], y: cell[1], width: 1, height: 1, fill: startOf >= 0 ? COLOR[startOf] : '#fff', stroke: '#8d8d8d', 'stroke-width': 0.04 }, svg);
      if (i % 13 === 8) {
        var star = el('text', { x: cell[0] + 0.5, y: cell[1] + 0.72, 'text-anchor': 'middle', 'font-size': 0.75, fill: '#9e9e9e' }, svg);
        star.textContent = '★';
      }
      if (startOf >= 0) {
        var arrow = el('text', { x: cell[0] + 0.5, y: cell[1] + 0.72, 'text-anchor': 'middle', 'font-size': 0.7, fill: 'rgba(255,255,255,.85)' }, svg);
        arrow.textContent = '★';
      }
    });
    // home lanes
    LANE.forEach(function (lane, c) {
      lane.forEach(function (cell) {
        el('rect', { x: cell[0], y: cell[1], width: 1, height: 1, fill: COLOR[c], stroke: '#8d8d8d', 'stroke-width': 0.04 }, svg);
      });
    });
    // centre
    el('polygon', { points: '6,6 9,6 7.5,7.5', fill: COLOR[1] }, svg);
    el('polygon', { points: '9,6 9,9 7.5,7.5', fill: COLOR[2] }, svg);
    el('polygon', { points: '9,9 6,9 7.5,7.5', fill: COLOR[3] }, svg);
    el('polygon', { points: '6,9 6,6 7.5,7.5', fill: COLOR[0] }, svg);
    tokenLayer = el('g', {}, svg);
    tokenEls = {};
  }

  function tokenXY(color, p, t) {
    if (p < 0) { var o = BASE_ORIGIN[color], s = SLOT[t]; return [o[0] + s[0], o[1] + s[1]]; }
    if (p <= 50) { var c = RING[(color * 13 + p) % 52]; return [c[0] + 0.5, c[1] + 0.5]; }
    if (p <= 55) { var l = LANE[color][p - 51]; return [l[0] + 0.5, l[1] + 0.5]; }
    var h = HOME_SPOT[color], d = (t - 1.5) * 0.14;
    return color % 2 === 0 ? [h[0], h[1] + d] : [h[0] + d, h[1]];
  }

  function ensureToken(seat, t, color) {
    var key = seat + '-' + t;
    if (tokenEls[key]) return tokenEls[key];
    var g = el('g', { class: 'token' }, tokenLayer);
    el('circle', { class: 'ring', r: 0.52, fill: 'none', stroke: '#fff', 'stroke-width': 0.14 }, g);
    el('circle', { r: 0.4, fill: COLOR[color], stroke: COLOR_DARK[color], 'stroke-width': 0.1 }, g);
    el('circle', { r: 0.14, fill: 'rgba(255,255,255,.55)', cx: -0.1, cy: -0.1 }, g);
    var hit = el('circle', { r: 0.62, fill: 'transparent' }, g);
    hit.setAttribute('pointer-events', 'all');
    g.addEventListener('click', function () { onToken(seat, t); });
    tokenEls[key] = g;
    return g;
  }

  function drawTokens() {
    if (!view) return;
    // group by cell to fan out stacked tokens
    var groups = {};
    view.pos.forEach(function (tokens, seat) {
      tokens.forEach(function (p, t) {
        var xy = tokenXY(view.colors[seat], p, t);
        var k = p < 0 ? 'b' + seat + t : xy[0].toFixed(2) + ',' + xy[1].toFixed(2);
        (groups[k] = groups[k] || []).push({ seat: seat, t: t, xy: xy });
      });
    });
    Object.keys(groups).forEach(function (k) {
      var list = groups[k];
      list.forEach(function (it, i) {
        var g = ensureToken(it.seat, it.t, view.colors[it.seat]);
        var n = list.length, off = n > 1 ? (i - (n - 1) / 2) * 0.28 : 0, sc = n > 1 ? 0.8 : 1;
        g.style.transform = 'translate(' + (it.xy[0] + off) + 'px,' + (it.xy[1] + off * 0.4) + 'px) scale(' + sc + ')';
        var legal = view.turn === it.seat && view.legal.indexOf(it.t) >= 0 && humanSeat(it.seat) && view.winner == null;
        g.classList.toggle('legal', legal);
      });
    });
  }

  var PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  function drawFace(v) {
    var f = $('face');
    f.innerHTML = '';
    for (var i = 0; i < 9; i++) {
      var d = document.createElement('i');
      if (v && PIPS[v].indexOf(i) >= 0) d.className = 'd';
      f.appendChild(d);
    }
  }

  function nameOf(seat) { return (cfg && cfg.names && cfg.names[seat]) || COLOR_NAME[view ? view.colors[seat] : seat]; }

  function renderPlayers() {
    var box = $('players');
    box.innerHTML = '';
    if (!cfg) return;
    var colors = view ? view.colors : (cfg.mode === 'online' ? [0, 2] : S ? S.colors : []);
    colors.forEach(function (col, seat) {
      var home = view ? view.pos[seat].filter(function (p) { return p === HOME; }).length : 0;
      var chip = document.createElement('div');
      chip.className = 'chip' + (view && view.turn === seat && view.winner == null ? ' on' : '');
      var dot = document.createElement('i');
      dot.style.background = COLOR[col];
      var label = document.createElement('span');
      label.textContent = nameOf(seat);
      var sm = document.createElement('small');
      sm.textContent = home + '/4 home';
      chip.appendChild(dot); chip.appendChild(label); chip.appendChild(sm);
      box.appendChild(chip);
    });
  }

  function setStatus(t) { $('status').textContent = t; }

  function eventNote() {
    var l = view && view.last;
    if (!l) return '';
    var who = l.seat === (cfg && cfg.myIndex) && cfg.mode === 'online' ? 'You' : nameOf(l.seat);
    var verb = (who === 'You' ? 'rolled' : 'rolled');
    var s = who + ' ' + verb + ' ' + l.roll;
    if (l.passed) s += ' · no move';
    if (l.move && l.move.captured && l.move.captured.length) s += ' · captured ' + l.move.captured.length + '!';
    else if (l.move && l.move.to === HOME) s += ' · home!';
    return s;
  }

  function draw() {
    if (!view) return;
    if (!tokenLayer) buildBoard();
    drawTokens();
    renderPlayers();
    var seat = view.turn, mine = humanSeat(seat);
    var shown = view.dice != null ? view.dice : view.last && view.last.roll ? view.last.roll : null;
    drawFace(shown);
    var canRoll = mine && view.dice == null && view.winner == null;
    var btn = $('dice');
    btn.disabled = !canRoll;
    btn.classList.toggle('ready', canRoll);
    $('diceLabel').textContent = canRoll ? 'Roll' : view.winner != null ? 'Done' : 'Wait';
    var key = JSON.stringify(view.last);
    if (key !== lastKey) {
      lastKey = key;
      btn.classList.remove('rolling');
      void btn.offsetWidth;
      if (view.last && view.last.roll) btn.classList.add('rolling');
    }
    var turnText;
    if (view.winner != null) turnText = nameOf(view.winner) + ' won! 🏆';
    else if (cfg.mode === 'online') {
      turnText = mine ? (view.dice == null ? 'Your turn — roll the dice' : 'Tap a glowing token to move') : nameOf(seat) + ' is playing…';
    } else if (mine) {
      var who = cfg.mode === 'local' ? nameOf(seat) + ': ' : '';
      turnText = who + (view.dice == null ? 'roll the dice' : 'tap a glowing token');
    } else turnText = nameOf(seat) + ' is thinking…';
    var note = eventNote();
    setStatus(note ? turnText + '  ·  ' + note : turnText);
    if (view.winner != null) showOver();
    if (view.secondsLeft != null) { secondsLeft = view.secondsLeft; tickAt = Date.now(); }
    else secondsLeft = null;
    drawTimer();
  }

  function drawTimer() {
    var t = $('timer');
    if (cfg && cfg.mode === 'online' && secondsLeft != null && view && view.winner == null) {
      var left = Math.max(0, secondsLeft - Math.floor((Date.now() - tickAt) / 1000));
      t.textContent = left + 's';
      t.classList.toggle('low', left <= 10);
    } else t.textContent = '';
  }
  setInterval(drawTimer, 500);

  function showOver() {
    var online = cfg.mode === 'online';
    var iWon = view.winner === (online ? cfg.myIndex : 0);
    $('overTitle').textContent = online ? (iWon ? 'You won! 🏆' : nameOf(view.winner) + ' won') : nameOf(view.winner) + ' wins! 🏆';
    $('overSub').textContent = online ? 'The server settled this match.' : cfg.mode === 'cpu' ? (iWon ? 'You beat the phone.' : 'The phone won this one.') : '';
    $('again').hidden = online;
    $('over').hidden = false;
    if (!sentOver) {
      sentOver = true;
      post({ type: 'over', winner: view.winner });
    }
  }
  var sentOver = false;

  /* ---------- input ---------- */
  function onToken(seat, t) {
    if (!view || view.winner != null || view.turn !== seat || !humanSeat(seat) || view.legal.indexOf(t) < 0) return;
    if (cfg.mode === 'online') post({ type: 'move', token: t });
    else localMove(t);
  }
  $('dice').addEventListener('click', function () {
    if (!view || view.dice != null || view.winner != null || !humanSeat(view.turn)) return;
    if (cfg.mode === 'online') post({ type: 'roll' });
    else localRoll();
  });
  $('close').addEventListener('click', function () { post({ type: 'exit' }); });
  $('leave').addEventListener('click', function () { post({ type: 'exit' }); });
  $('again').addEventListener('click', function () { sentOver = false; start({ mode: cfg.mode, n: cfg.n, names: cfg.names, subtitle: cfg.subtitle }); });

  /* ---------- bridge to the phone app ---------- */
  function post(msg) {
    try {
      var out = { source: 'ekpoma-ludo', game: 'ludo' };
      for (var k in msg) out[k] = msg[k];
      parent.postMessage(out, '*');
    } catch (e) { /* standalone */ }
  }

  window.addEventListener('message', function (event) {
    if (event.source !== parent) return;
    var m = event.data;
    if (!m || m.target !== 'ekpoma-ludo') return;
    if (m.type === 'init') {
      clearTimeout(standalone);
      sentOver = false;
      start({ mode: m.mode, n: m.players, myIndex: m.myIndex || 0, names: m.names, subtitle: m.subtitle });
    } else if (m.type === 'state' && cfg && cfg.mode === 'online' && m.state) {
      var s = m.state;
      view = { colors: s.colors, pos: s.pos, turn: s.turn, dice: s.dice, legal: s.legal || [], winner: s.winner, last: s.last, secondsLeft: s.secondsLeft };
      draw();
    } else if (m.type === 'error' && m.error) {
      setStatus(String(m.error));
    }
  });

  // Opened on its own (no phone app around): offer a 2-player pass & play game
  var standalone = setTimeout(function () {
    if (!cfg) start({ mode: 'local', n: 2, subtitle: 'Pass & play' });
  }, 700);
  buildBoard();
  drawFace(null);
  post({ type: 'ready' });
})();
