// Block Blast: drag three blocks onto an 8 x 8 grid; full rows and columns clear.
(function () {
  var G = window.Games, N = 8;
  function norm(cells) { var mr = Math.min.apply(null, cells.map(function (c) { return c[0]; })), mc = Math.min.apply(null, cells.map(function (c) { return c[1]; })); return cells.map(function (c) { return [c[0] - mr, c[1] - mc]; }).sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; }); }
  function rot(cells) { return norm(cells.map(function (c) { return [c[1], -c[0]]; })); }
  function mirror(cells) { return norm(cells.map(function (c) { return [c[0], -c[1]]; })); }
  function variants(base) { var out = {}, cur = base; for (var i = 0; i < 4; i++) { [cur, mirror(cur)].forEach(function (s) { out[JSON.stringify(s)] = s; }); cur = rot(cur); } return Object.keys(out).map(function (k) { return out[k]; }); }
  function rect(h, w) { var c = []; for (var r = 0; r < h; r++) for (var x = 0; x < w; x++) c.push([r, x]); return c; }
  var SHAPES = [];
  [[1, 1, 1], [1, 2, 3], [2, 1, 3], [1, 3, 4], [3, 1, 4], [1, 4, 2], [4, 1, 2], [1, 5, 1], [5, 1, 1], [2, 2, 4], [2, 3, 2], [3, 2, 2], [3, 3, 1]].forEach(function (d) { for (var i = 0; i < d[2]; i++) SHAPES.push(rect(d[0], d[1])); });
  var BASES = [[[0, 0], [1, 0], [1, 1]], [[0, 0], [1, 0], [2, 0], [2, 1]], [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]], [[0, 0], [0, 1], [0, 2], [1, 1]], [[0, 0], [0, 1], [1, 1], [1, 2]]];
  var WT = [4, 3, 2, 3, 2];
  BASES.forEach(function (b, k) { variants(b).forEach(function (v) { for (var i = 0; i < WT[k]; i++) SHAPES.push(v); }); });
  function fits(grid, shape, r, c) { return shape.every(function (p) { var y = r + p[0], x = c + p[1]; return y >= 0 && y < N && x >= 0 && x < N && !grid[y][x]; }); }
  function canPlace(grid, shape) { for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) if (fits(grid, shape, r, c)) return true; return false; }
  function fullLines(grid) { var rows = [], cols = [], i, j; for (i = 0; i < N; i++) { if (grid[i].every(Boolean)) rows.push(i); } for (j = 0; j < N; j++) { var all = true; for (i = 0; i < N; i++) if (!grid[i][j]) { all = false; break; } if (all) cols.push(j); } return { rows: rows, cols: cols }; }
  function newPieces(grid) {
    var best = null;
    for (var t = 0; t < 40; t++) {
      var set = [0, 1, 2].map(function () { return { shape: SHAPES[Math.floor(Math.random() * SHAPES.length)], color: Math.floor(Math.random() * 7) + 1 }; });
      best = set; if (set.some(function (p) { return canPlace(grid, p.shape); })) return set;
    }
    return best;
  }
  G.logic.blast = { SHAPES: SHAPES, fits: fits, fullLines: fullLines, canPlace: canPlace, newPieces: newPieces };

  G.register('block-blast', {
    init: function (host) {
      host.innerHTML =
        '<div class="bb-wrap"><div class="bb-main">' +
        '<div class="bb-stats"><div><span>Score</span><b data-s="score">0</b></div><div><span>Best</span><b data-s="best">0</b></div><button class="btn" data-k="new" type="button">New game</button></div>' +
        '<div class="bb-board-wrap"><div class="bb-board" aria-label="Block Blast board"></div><div class="bb-pop" aria-hidden="true"></div>' +
        '<div class="bb-over" hidden><div><h3>No more moves</h3><p>Final score <b data-s="final">0</b></p><button class="btn btn-primary" data-k="again" type="button">Play again</button></div></div></div>' +
        '<div class="bb-tray" aria-label="Your blocks"></div></div>' +
        '<aside class="gm-side"><div class="gm-msg" role="status" aria-live="polite">Drag a block onto the grid.</div>' +
        '<p class="pz-note">Fill a complete row or column to clear it. Clearing on back-to-back moves builds a combo and scores more. Blocks cannot be rotated. The game ends when none of your three blocks can be placed.</p></aside></div>';
      var boardEl = host.querySelector('.bb-board'), tray = host.querySelector('.bb-tray'), msg = host.querySelector('.gm-msg'), over = host.querySelector('.bb-over'), pop = host.querySelector('.bb-pop');
      var grid, pieces, score, best = G.store('bb-best') || 0, streak, cells = [], drag = null;
      for (var i = 0; i < N * N; i++) { var d = G.el('div', 'bb-cell'); boardEl.appendChild(d); cells.push(d); }
      function S(k, v) { host.querySelector('[data-s=' + k + ']').textContent = v; }
      function paint() {
        for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) cells[r * N + c].className = 'bb-cell' + (grid[r][c] ? ' on c' + grid[r][c] : '');
        S('score', score); S('best', best);
      }
      function trayPiece(p) {
        var h = Math.max.apply(null, p.shape.map(function (c) { return c[0]; })) + 1, w = Math.max.apply(null, p.shape.map(function (c) { return c[1]; })) + 1;
        var g = G.el('div', 'bb-mini'); g.style.gridTemplateColumns = 'repeat(' + w + ', var(--mc))'; g.style.gridTemplateRows = 'repeat(' + h + ', var(--mc))';
        var occ = {}; p.shape.forEach(function (c) { occ[c[0] + ',' + c[1]] = 1; });
        for (var r = 0; r < h; r++) for (var c = 0; c < w; c++) g.appendChild(G.el('i', occ[r + ',' + c] ? 'on c' + p.color : ''));
        return g;
      }
      function drawTray() {
        tray.innerHTML = '';
        pieces.forEach(function (p, idx) {
          var slot = G.el('div', 'bb-slot' + (p ? '' : ' empty') + (p && !canPlace(grid, p.shape) ? ' nofit' : ''));
          if (p) { var m = trayPiece(p); slot.appendChild(m); slot.setAttribute('aria-label', 'Block ' + (idx + 1) + ', drag to the board'); slot.addEventListener('pointerdown', function (e) { startDrag(e, idx, slot); }); }
          tray.appendChild(slot);
        });
      }
      function reset() {
        grid = []; for (var r = 0; r < N; r++) grid.push(Array(N).fill(0));
        score = 0; streak = 0; pieces = newPieces(grid); over.hidden = true; paint(); drawTray(); msg.textContent = 'Drag a block onto the grid.';
      }
      // ---- dragging
      function cellSize() { return boardEl.getBoundingClientRect().width / N; }
      function startDrag(e, idx, slot) {
        if (e.button > 0 || drag) return; e.preventDefault();
        var p = pieces[idx], cs = cellSize(), ghost = G.el('div', 'bb-ghost'), h = Math.max.apply(null, p.shape.map(function (c) { return c[0]; })) + 1, w = Math.max.apply(null, p.shape.map(function (c) { return c[1]; })) + 1;
        ghost.style.cssText = 'width:' + (w * cs) + 'px;height:' + (h * cs) + 'px;grid-template-columns:repeat(' + w + ',1fr);grid-template-rows:repeat(' + h + ',1fr)';
        var occ = {}; p.shape.forEach(function (c) { occ[c[0] + ',' + c[1]] = 1; });
        for (var r = 0; r < h; r++) for (var c = 0; c < w; c++) ghost.appendChild(G.el('i', occ[r + ',' + c] ? 'on c' + p.color : ''));
        document.body.appendChild(ghost); slot.classList.add('lifted');
        drag = { idx: idx, p: p, ghost: ghost, w: w, h: h, cs: cs, slot: slot, at: null, lift: e.pointerType === 'mouse' ? 10 : 64 };
        move(e); window.addEventListener('pointermove', move); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', cancel);
      }
      function move(e) {
        if (!drag) return;
        var gx = e.clientX - drag.w * drag.cs / 2, gy = e.clientY - drag.h * drag.cs - drag.lift;
        drag.ghost.style.transform = 'translate(' + gx + 'px,' + gy + 'px)';
        var br = boardEl.getBoundingClientRect(), col = Math.round((gx - br.left) / drag.cs), row = Math.round((gy - br.top) / drag.cs);
        var ok = fits(grid, drag.p.shape, row, col); drag.at = ok ? [row, col] : null; preview();
      }
      function preview() {
        paint();
        if (!drag.at) return;
        var g2 = grid.map(function (r) { return r.slice(); }); drag.p.shape.forEach(function (c) { g2[drag.at[0] + c[0]][drag.at[1] + c[1]] = drag.p.color; });
        var fl = fullLines(g2);
        for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) { if (g2[r][c] && !grid[r][c]) cells[r * N + c].className = 'bb-cell pv c' + drag.p.color; if ((fl.rows.indexOf(r) > -1 || fl.cols.indexOf(c) > -1) && g2[r][c]) cells[r * N + c].classList.add('will'); }
      }
      function unbind() { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', cancel); drag.ghost.remove(); drag.slot.classList.remove('lifted'); }
      function cancel() { if (!drag) return; unbind(); drag = null; paint(); }
      function end() {
        if (!drag) return; var d = drag; unbind(); drag = null;
        if (!d.at) { paint(); return; } place(d.idx, d.at[0], d.at[1]);
      }
      function place(idx, r0, c0) {
        var p = pieces[idx]; p.shape.forEach(function (c) { grid[r0 + c[0]][c0 + c[1]] = p.color; }); pieces[idx] = null;
        var fl = fullLines(grid), L = fl.rows.length + fl.cols.length, gain = p.shape.length;
        if (L) { streak++; gain += L * L * 10 + (streak > 1 ? streak * 10 : 0); } else streak = 0;
        var clearing = [];
        fl.rows.forEach(function (r) { for (var c = 0; c < N; c++) clearing.push([r, c]); }); fl.cols.forEach(function (c) { for (var r = 0; r < N; r++) clearing.push([r, c]); });
        paint(); clearing.forEach(function (q) { cells[q[0] * N + q[1]].classList.add('clearing'); });
        score += gain; if (score > best) { best = score; G.store('bb-best', best); }
        S('score', score); S('best', best);
        if (L) { msg.textContent = (L > 1 ? L + ' lines! ' : 'Line cleared! ') + (streak > 1 ? 'Combo ×' + streak + '.' : ''); popup('+' + gain); } else msg.textContent = 'Drag a block onto the grid.';
        setTimeout(function () {
          clearing.forEach(function (q) { grid[q[0]][q[1]] = 0; });
          if (pieces.every(function (x) { return !x; })) pieces = newPieces(grid);
          paint(); drawTray();
          if (pieces.every(function (x) { return !x || !canPlace(grid, x.shape); })) finish();
        }, L ? 320 : 0);
      }
      function popup(t) { pop.textContent = t; pop.classList.remove('go'); void pop.offsetWidth; pop.classList.add('go'); }
      function finish() { S('final', score); over.hidden = false; msg.textContent = 'Game over. Final score ' + score + (score >= best ? ' (a new best!)' : '') + '.'; }
      host.querySelector('[data-k=new]').addEventListener('click', reset);
      host.querySelector('[data-k=again]').addEventListener('click', reset);
      reset();
    }
  });
})();
