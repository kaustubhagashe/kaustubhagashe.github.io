/* The Eight Queens puzzle */
(function () {
  var boardEl = document.getElementById('q-board');
  if (!boardEl) return;
  var $ = function (id) { return document.getElementById(id); };
  var msg = $('q-msg'), tray = $('q-tray');
  var queens = [];                       // board indexes (0 = a8)

  // ---- all 92 solutions by backtracking; sol[r] = column of the queen in row r ----
  var solutions = [];
  (function solve(r, cols, d1, d2, cur) {
    if (r === 8) { solutions.push(cur.map(function (c, rr) { return rr * 8 + c; })); return; }
    for (var c = 0; c < 8; c++) {
      if (cols[c] || d1[r - c + 7] || d2[r + c]) continue;
      cols[c] = d1[r - c + 7] = d2[r + c] = true; cur.push(c);
      solve(r + 1, cols, d1, d2, cur);
      cur.pop(); cols[c] = d1[r - c + 7] = d2[r + c] = false;
    }
  })(0, [], [], [], []);

  function attacks(a, b) {
    var ra = PZ.row(a), ca = PZ.col(a), rb = PZ.row(b), cb = PZ.col(b);
    return ra === rb || ca === cb || Math.abs(ra - rb) === Math.abs(ca - cb);
  }
  function pairs() {
    var out = [];
    for (var i = 0; i < queens.length; i++) for (var j = i + 1; j < queens.length; j++) if (attacks(queens[i], queens[j])) out.push([queens[i], queens[j]]);
    return out;
  }

  var squares = PZ.build(boardEl, function (i) { toggle(i); });
  squares.forEach(function (s) {
    s.addEventListener('dragover', function (e) { e.preventDefault(); });
    s.addEventListener('drop', function (e) { e.preventDefault(); var i = +s.dataset.i; if (queens.indexOf(i) < 0) place(i); });
  });

  function setMsg(text, kind) { msg.textContent = text; msg.className = 'pz-msg ' + (kind || ''); }
  function nm(i) { return PZ.name(i); }

  function toggle(i) {
    var at = queens.indexOf(i);
    if (at >= 0) { queens.splice(at, 1); draw(); describe(null); return; }
    place(i);
  }
  function place(i) {
    if (queens.length >= 8) { setMsg('All 8 queens are already on the board. Click a queen to take it back before placing another.', 'info'); return; }
    var clash = queens.filter(function (q) { return attacks(q, i); });
    queens.push(i); draw(); describe({ placed: i, clash: clash });
  }

  function describe(ctx) {
    var ps = pairs(), n = queens.length;
    if (ps.length) {
      var p = ps[0], more = ps.length > 1 ? ' (and ' + (ps.length - 1) + ' more clash' + (ps.length > 2 ? 'es' : '') + ')' : '';
      setMsg('Wrong combination — the queens on ' + nm(p[0]) + ' and ' + nm(p[1]) + ' attack each other' + more + '. Click a highlighted queen to take it back.', 'bad');
    } else if (n === 8) {
      var k = solutions.findIndex(function (s) { return s.slice().sort(function (a, b) { return a - b; }).join() === queens.slice().sort(function (a, b) { return a - b; }).join(); });
      setMsg('Solved! All 8 queens are safe' + (k >= 0 ? ' — this is solution no. ' + (k + 1) + ' of 92.' : '.'), 'ok');
    } else if (n === 0) {
      setMsg('Place your first queen to begin.', '');
    } else {
      setMsg(n + (n === 1 ? ' queen is' : ' queens are') + ' placed and none attack each other. ' + (8 - n) + ' to go.', 'info');
    }
  }

  function draw(attackerSet) {
    var ps = pairs(), bad = {};
    ps.forEach(function (p) { bad[p[0]] = bad[p[1]] = true; });
    squares.forEach(function (s, i) {
      var has = queens.indexOf(i) >= 0;
      s.classList.toggle('bad', !!bad[i]);
      var img = s.querySelector('.pz-piece');
      if (has && !img) s.insertBefore(PZ.piece('bQ'), s.firstChild);
      if (!has && img) img.remove();
      s.setAttribute('aria-label', nm(i) + (has ? ', queen' + (bad[i] ? ', under attack' : '') : ', empty'));
    });
    // tray
    tray.innerHTML = '';
    for (var k = 0; k < 8; k++) {
      var slot = document.createElement('div');
      slot.className = 'pz-slot' + (k < queens.length ? ' used' : '');
      if (k >= queens.length) {
        var im = PZ.piece('bQ'); im.draggable = true;
        im.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', 'queen'); e.dataTransfer.effectAllowed = 'move'; });
        slot.appendChild(im);
      }
      tray.appendChild(slot);
    }
    $('q-left').textContent = (8 - queens.length) + ' left';
    $('q-placed').textContent = queens.length + ' / 8';
    $('q-pairs').textContent = ps.length;
  }

  var shown = -1;
  $('q-show').addEventListener('click', function () {
    var cand = solutions;
    var ok = !pairs().length && queens.length > 0;
    if (ok) {
      var mine = queens.slice(), narrowed = solutions.filter(function (s) { return mine.every(function (q) { return s.indexOf(q) >= 0; }); });
      if (narrowed.length) cand = narrowed;
    }
    var pool = cand.filter(function (s) { return solutions.indexOf(s) !== shown; });
    if (!pool.length) pool = cand;
    var pick = pool[Math.floor(Math.random() * pool.length)];
    shown = solutions.indexOf(pick);
    queens = pick.slice(); draw();
    setMsg('Here is one valid arrangement — no queen attacks another.', 'ok');
    $('q-which').textContent = 'Showing solution ' + (shown + 1) + ' of 92' + (ok && cand !== solutions ? ' (it keeps the queens you had placed)' : '') + '. Click “Show answer” again for another.';
  });
  $('q-clear').addEventListener('click', function () {
    queens = []; shown = -1; draw(); describe(null);
    $('q-which').textContent = 'There are 92 solutions in all. “Show answer” displays one of them.';
  });

  draw();
  window.__queens = { solutions: solutions, get queens() { return queens; } };   // handy for testing
})();
