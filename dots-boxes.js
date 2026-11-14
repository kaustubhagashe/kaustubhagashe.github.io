// Dots and Boxes against the computer.
(function () {
  var G = window.Games;
  // Board model: n x n boxes. h[r][c]: horizontal edge (r 0..n, c 0..n-1). v[r][c]: vertical edge (r 0..n-1, c 0..n).
  function make(n) { var h = [], v = [], o = [], r, c; for (r = 0; r <= n; r++) h.push(Array(n).fill(0)); for (r = 0; r < n; r++) { v.push(Array(n + 1).fill(0)); o.push(Array(n).fill(0)); } return { n: n, h: h, v: v, o: o }; }
  function sides(s, r, c) { return s.h[r][c] + s.h[r + 1][c] + s.v[r][c] + s.v[r][c + 1]; }
  function adj(s, e) {            // boxes touching an edge
    var r = e.r, c = e.c, out = [];
    if (e.t === 'h') { if (r > 0) out.push([r - 1, c]); if (r < s.n) out.push([r, c]); } else { if (c > 0) out.push([r, c - 1]); if (c < s.n) out.push([r, c]); }
    return out;
  }
  function edges(s) { var out = [], n = s.n, r, c; for (r = 0; r <= n; r++) for (c = 0; c < n; c++) if (!s.h[r][c]) out.push({ t: 'h', r: r, c: c }); for (r = 0; r < n; r++) for (c = 0; c <= n; c++) if (!s.v[r][c]) out.push({ t: 'v', r: r, c: c }); return out; }
  function draw(s, e, who) {       // returns boxes completed
    (e.t === 'h' ? s.h : s.v)[e.r][e.c] = 1; var got = [];
    adj(s, e).forEach(function (b) { if (!s.o[b[0]][b[1]] && sides(s, b[0], b[1]) === 4) { s.o[b[0]][b[1]] = who; got.push(b); } });
    return got;
  }
  function clone(s) { return { n: s.n, h: s.h.map(function (a) { return a.slice(); }), v: s.v.map(function (a) { return a.slice(); }), o: s.o.map(function (a) { return a.slice(); }) }; }
  function completes(s, e) { return adj(s, e).filter(function (b) { return !s.o[b[0]][b[1]] && sides(s, b[0], b[1]) === 3; }).length; }
  function givesThird(s, e) { return adj(s, e).some(function (b) { return !s.o[b[0]][b[1]] && sides(s, b[0], b[1]) === 2; }); }
  function sacrifice(s, e) {       // boxes the opponent could grab greedily after this move
    var t = clone(s); draw(t, e, 9); var total = 0, again = true;
    while (again) { again = false; var es = edges(t); for (var i = 0; i < es.length; i++) { if (completes(t, es[i])) { total += draw(t, es[i], 9).length; again = true; break; } } }
    return total;
  }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function choose(s, level) {
    var es = edges(s), take = es.filter(function (e) { return completes(s, e) > 0; });
    if (take.length) return pick(take);
    if (level === 'easy') return pick(es);
    var safe = es.filter(function (e) { return !givesThird(s, e); });
    if (safe.length) return pick(safe);
    if (level === 'medium') return pick(es);
    var best = 99, pool = []; es.forEach(function (e) { var k = sacrifice(s, e); if (k < best) { best = k; pool = [e]; } else if (k === best) pool.push(e); });
    return pick(pool);
  }
  G.logic.dots = { make: make, draw: draw, edges: edges, choose: choose, sides: sides, clone: clone };

  G.register('dots-boxes', {
    init: function (host) {
      var N = G.store('db-size') || 4, level = G.store('db-level') || 'medium', S, turn, busy, over, last = null, score;
      host.innerHTML =
        '<div class="gm-bar"><label>Board<select data-k="size"><option value="3">3 × 3 boxes</option><option value="4">4 × 4 boxes</option><option value="5">5 × 5 boxes</option><option value="6">6 × 6 boxes</option></select></label>' +
        '<label>Computer<select data-k="level"><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label>' +
        '<label>First move<select data-k="first"><option value="you">You</option><option value="cpu">Computer</option></select></label>' +
        '<button class="btn btn-primary" data-k="new" type="button">New game</button></div>' +
        '<div class="db-wrap"><div class="db-board"></div><aside class="gm-side"><div class="gm-msg" role="status" aria-live="polite"></div>' +
        '<dl class="gm-score"><div><dt>You</dt><dd data-s="you">0</dd></div><div><dt>Computer</dt><dd data-s="cpu">0</dd></div></dl>' +
        '<p class="pz-note">Draw a line between two neighbouring dots by clicking between them. Finishing the fourth side of a box wins it and gives you another turn.</p></aside></div>';
      var board = host.querySelector('.db-board'), msg = host.querySelector('.gm-msg'), sizeSel = host.querySelector('[data-k=size]'), lvSel = host.querySelector('[data-k=level]'), firstSel = host.querySelector('[data-k=first]');
      sizeSel.value = N; lvSel.value = level;
      var NS = 'http://www.w3.org/2000/svg';
      function render() {
        var n = S.n, step = 64, pad = 22, W = n * step + pad * 2, svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', '0 0 ' + W + ' ' + W); svg.setAttribute('class', 'db-svg'); svg.setAttribute('role', 'group'); svg.setAttribute('aria-label', 'Dots and boxes board');
        function add(tag, attrs, parent) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); (parent || svg).appendChild(e); return e; }
        for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) {
          var who = S.o[r][c];
          if (who) { add('rect', { x: pad + c * step + 4, y: pad + r * step + 4, width: step - 8, height: step - 8, rx: 6, class: 'db-box ' + (who === 1 ? 'you' : 'cpu') });
            var t = add('text', { x: pad + c * step + step / 2, y: pad + r * step + step / 2 + 7, class: 'db-init', 'text-anchor': 'middle' }); t.textContent = who === 1 ? 'You'.charAt(0) : 'C'; }
        }
        function edge(t, r, c) {
          var x1 = pad + c * step, y1 = pad + r * step, x2 = t === 'h' ? x1 + step : x1, y2 = t === 'v' ? y1 + step : y1, taken = (t === 'h' ? S.h : S.v)[r][c];
          var isLast = last && last.t === t && last.r === r && last.c === c;
          add('line', { x1: x1, y1: y1, x2: x2, y2: y2, class: 'db-line' + (taken ? ' on' : '') + (isLast ? ' last' : '') });
          if (!taken && !over) { var hit = add('line', { x1: x1, y1: y1, x2: x2, y2: y2, class: 'db-hit', tabindex: 0, role: 'button', 'aria-label': 'Draw ' + (t === 'h' ? 'horizontal' : 'vertical') + ' line, row ' + (r + 1) + ' column ' + (c + 1) });
            hit.addEventListener('click', function () { move({ t: t, r: r, c: c }); }); hit.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); move({ t: t, r: r, c: c }); } }); }
        }
        for (r = 0; r <= n; r++) for (c = 0; c < n; c++) edge('h', r, c);
        for (r = 0; r < n; r++) for (c = 0; c <= n; c++) edge('v', r, c);
        for (r = 0; r <= n; r++) for (c = 0; c <= n; c++) add('circle', { cx: pad + c * step, cy: pad + r * step, r: 5.5, class: 'db-dot' });
        board.innerHTML = ''; board.appendChild(svg);
        host.querySelector('[data-s=you]').textContent = score.you; host.querySelector('[data-s=cpu]').textContent = score.cpu;
      }
      function reset() {
        N = +sizeSel.value; level = lvSel.value; G.store('db-size', N); G.store('db-level', level);
        S = make(N); score = { you: 0, cpu: 0 }; over = false; busy = false; last = null; turn = firstSel.value === 'you' ? 1 : 2; render();
        if (turn === 2) { msg.textContent = 'Computer starts…'; busy = true; setTimeout(cpuTurn, 500); } else msg.textContent = 'Your turn: draw a line.';
      }
      function after(got, who) {
        score[who === 1 ? 'you' : 'cpu'] += got.length;
        if (score.you + score.cpu === N * N) { over = true; busy = false; render(); msg.textContent = score.you > score.cpu ? 'You win ' + score.you + ' to ' + score.cpu + '! 🎉' : score.you < score.cpu ? 'The computer wins ' + score.cpu + ' to ' + score.you + '.' : 'A draw, ' + score.you + ' each.'; return true; }
        return false;
      }
      function move(e) {
        if (over || busy || turn !== 1) return;
        var got = draw(S, e, 1); last = e; render(); if (after(got, 1)) return;
        if (got.length) { msg.textContent = 'You completed a box! Go again.'; return; }
        turn = 2; busy = true; msg.textContent = 'Computer is thinking…'; setTimeout(cpuTurn, 550);
      }
      function cpuTurn() {
        if (over) return;
        var e = choose(S, lvSel.value), got = draw(S, e, 2); last = e; render(); if (after(got, 2)) return;
        if (got.length) { msg.textContent = 'Computer completed a box and moves again…'; setTimeout(cpuTurn, 600); return; }
        turn = 1; busy = false; msg.textContent = 'Your turn: draw a line.';
      }
      host.querySelector('[data-k=new]').addEventListener('click', reset);
      [sizeSel, lvSel, firstSel].forEach(function (s) { s.addEventListener('change', reset); });
      reset();
    }
  });
})();
