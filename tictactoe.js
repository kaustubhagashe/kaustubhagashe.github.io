// Tic Tac Toe against the computer (Easy / Medium / Unbeatable).
(function () {
  var G = window.Games, LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  function winner(b) { for (var i = 0; i < 8; i++) { var l = LINES[i]; if (b[l[0]] && b[l[0]] === b[l[1]] && b[l[1]] === b[l[2]]) return { who: b[l[0]], line: l }; } return b.every(Boolean) ? { who: 'draw' } : null; }
  function empties(b) { var r = []; b.forEach(function (v, i) { if (!v) r.push(i); }); return r; }
  function minimax(b, turn, ai, hu, depth) {
    var w = winner(b); if (w) return w.who === ai ? 10 - depth : w.who === hu ? depth - 10 : 0;
    var best = turn === ai ? -99 : 99;
    empties(b).forEach(function (i) { b[i] = turn; var s = minimax(b, turn === ai ? hu : ai, ai, hu, depth + 1); b[i] = null; best = turn === ai ? Math.max(best, s) : Math.min(best, s); });
    return best;
  }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function winningMove(b, who) { var m = empties(b).filter(function (i) { b[i] = who; var w = winner(b); b[i] = null; return w && w.who === who; }); return m.length ? m[0] : -1; }
  function bestMove(b, ai, hu, level) {
    var free = empties(b);
    if (level === 'easy') return pick(free);
    if (level === 'medium') { var w = winningMove(b, ai); if (w < 0) w = winningMove(b, hu); return w >= 0 && Math.random() < .85 ? w : pick(free); }
    if (free.length === 9) return pick([0, 2, 4, 6, 8]);
    var best = -99, moves = [];
    free.forEach(function (i) { b[i] = ai; var s = minimax(b, hu, ai, hu, 1); b[i] = null; if (s > best) { best = s; moves = [i]; } else if (s === best) moves.push(i); });
    return pick(moves);
  }
  G.logic.ttt = { winner: winner, bestMove: bestMove };

  G.register('tic-tac-toe', {
    init: function (host) {
      var me = 'X', cpu = 'O', level = G.store('ttt-level') || 'hard', first = 'you', board, over, busy, score = G.store('ttt-score') || { you: 0, draw: 0, cpu: 0 };
      host.innerHTML =
        '<div class="gm-bar">' +
        '<label>You play<select data-k="side"><option value="X">X (goes first)</option><option value="O">O</option></select></label>' +
        '<label>Computer<select data-k="level"><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Unbeatable</option></select></label>' +
        '<button class="btn btn-primary" data-k="new" type="button">New game</button></div>' +
        '<div class="ttt-wrap"><div class="ttt-board" role="grid" aria-label="Tic Tac Toe board"></div>' +
        '<aside class="gm-side"><div class="gm-msg" role="status" aria-live="polite"></div>' +
        '<dl class="gm-score"><div><dt>You</dt><dd data-s="you">0</dd></div><div><dt>Draws</dt><dd data-s="draw">0</dd></div><div><dt>Computer</dt><dd data-s="cpu">0</dd></div></dl>' +
        '<button class="btn" data-k="reset" type="button">Reset scores</button></aside></div>';
      var bd = host.querySelector('.ttt-board'), msg = host.querySelector('.gm-msg'), sideSel = host.querySelector('[data-k=side]'), lvSel = host.querySelector('[data-k=level]');
      lvSel.value = level;
      var cells = [];
      for (var i = 0; i < 9; i++) (function (i) { var b = G.el('button', 'ttt-cell'); b.type = 'button'; b.setAttribute('role', 'gridcell'); b.setAttribute('aria-label', 'Square ' + (i + 1)); b.addEventListener('click', function () { play(i); }); bd.appendChild(b); cells.push(b); })(i);
      function paint(win) {
        cells.forEach(function (c, i) { c.textContent = board[i] || ''; c.className = 'ttt-cell' + (board[i] ? ' m' + board[i] : '') + (win && win.line && win.line.indexOf(i) > -1 ? ' win' : ''); c.disabled = over || !!board[i]; c.setAttribute('aria-label', 'Square ' + (i + 1) + (board[i] ? ', ' + board[i] : ', empty')); });
        ['you', 'draw', 'cpu'].forEach(function (k) { host.querySelector('[data-s=' + k + ']').textContent = score[k]; });
      }
      function reset() {
        me = sideSel.value; cpu = me === 'X' ? 'O' : 'X'; board = Array(9).fill(null); over = false; busy = false; paint();
        if (me === 'O') { msg.textContent = 'Computer starts…'; busy = true; setTimeout(cpuMove, 450); } else msg.textContent = 'Your move.';
      }
      function finish() {
        var w = winner(board); if (!w) return false;
        over = true;
        if (w.who === 'draw') { score.draw++; msg.textContent = 'It’s a draw.'; } else if (w.who === me) { score.you++; msg.textContent = 'You win! 🎉'; } else { score.cpu++; msg.textContent = 'The computer wins.'; }
        G.store('ttt-score', score); paint(w); return true;
      }
      function play(i) { if (over || busy || board[i]) return; board[i] = me; paint(); if (finish()) return; msg.textContent = 'Computer is thinking…'; busy = true; setTimeout(cpuMove, 420); }
      function cpuMove() { var m = bestMove(board, cpu, me, lvSel.value); board[m] = cpu; busy = false; paint(); if (!finish()) msg.textContent = 'Your move.'; }
      host.querySelector('[data-k=new]').addEventListener('click', reset);
      sideSel.addEventListener('change', reset);
      lvSel.addEventListener('change', function () { G.store('ttt-level', lvSel.value); reset(); });
      host.querySelector('[data-k=reset]').addEventListener('click', function () { score = { you: 0, draw: 0, cpu: 0 }; G.store('ttt-score', score); reset(); });
      reset();
    }
  });
})();
