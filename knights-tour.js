/* The Knight's Tour */
(function () {
  var boardEl = document.getElementById('k-board');
  if (!boardEl) return;
  var $ = function (id) { return document.getElementById(id); };
  var svg = $('k-trace'), msg = $('k-msg');
  var path = [], visited = {}, timer = null, closed = false;
  var DELTAS = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function moves(i) {
    var r = PZ.row(i), c = PZ.col(i), out = [];
    DELTAS.forEach(function (d) { var rr = r + d[0], cc = c + d[1]; if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) out.push(rr * 8 + cc); });
    return out;
  }
  function isKnightMove(a, b) { return moves(a).indexOf(b) >= 0; }

  // ---- closed tour: Warnsdorff's rule with random tie-breaks, retried until the end meets the start ----
  function closedTour() {
    for (var attempt = 0; attempt < 20000; attempt++) {
      var seen = new Array(64).fill(false), tour = [0], cur = 0; seen[0] = true;
      for (var step = 1; step < 64; step++) {
        var best = [], bestDeg = 9;
        moves(cur).forEach(function (m) {
          if (seen[m]) return;
          var deg = moves(m).filter(function (x) { return !seen[x]; }).length;
          if (deg < bestDeg) { bestDeg = deg; best = [m]; } else if (deg === bestDeg) best.push(m);
        });
        if (!best.length) break;
        cur = best[Math.floor(Math.random() * best.length)]; seen[cur] = true; tour.push(cur);
      }
      if (tour.length === 64 && isKnightMove(tour[63], tour[0])) return tour;
    }
    return null;
  }
  function tourFrom(start) {
    var t = closedTour(); if (!t) return null;
    var k = t.indexOf(start); t = t.slice(k).concat(t.slice(0, k));
    if (Math.random() < .5) t = [t[0]].concat(t.slice(1).reverse());   // run the loop the other way
    return t;
  }

  var squares = PZ.build(boardEl, onSquare);
  function setMsg(text, kind) { msg.textContent = text; msg.className = 'pz-msg ' + (kind || ''); }
  function cancel() { if (timer) { clearInterval(timer); timer = null; } boardEl.classList.remove('busy'); }

  function onSquare(i) {
    if (timer) return;
    if (!path.length) {
      path = [i]; visited = {}; visited[i] = 1; closed = false; draw();
      setMsg('Knight placed on ' + PZ.name(i) + '. Now move it in an L-shape to one of the marked squares.', 'info'); return;
    }
    if (path.length === 1 && i !== path[0] && !isKnightMove(path[0], i)) {          // still choosing the start square
      path = [i]; visited = {}; visited[i] = 1; draw();
      setMsg('Knight moved to ' + PZ.name(i) + ' as the starting square.', 'info'); return;
    }
    var cur = path[path.length - 1];
    if (path.length === 64) { setMsg('The tour is complete. Press “Start over” to try again.', 'ok'); return; }
    if (visited[i]) { setMsg(PZ.name(i) + ' has already been visited — every square may be visited only once.', 'bad'); return; }
    if (!isKnightMove(cur, i)) { setMsg('A knight moves in an L-shape: two squares in one direction and one at a right angle. ' + PZ.name(i) + ' is not reachable from ' + PZ.name(cur) + '.', 'bad'); return; }
    path.push(i); visited[i] = path.length; draw(); after();
  }

  function after() {
    var n = path.length, cur = path[n - 1];
    if (n === 64) {
      closed = isKnightMove(cur, path[0]);
      setMsg(closed ? 'Brilliant! All 64 squares visited — and it is a closed tour: ' + PZ.name(cur) + ' is a knight’s move from the start, ' + PZ.name(path[0]) + '.'
                    : 'All 64 squares visited — a complete (open) tour! For a closed loop the last square must be a knight’s move from ' + PZ.name(path[0]) + '. Try again, or press “Show answer”.', 'ok');
      draw(); return;
    }
    var open = moves(cur).filter(function (m) { return !visited[m]; });
    if (!open.length) setMsg('No moves left after ' + n + ' squares — the knight is stuck on ' + PZ.name(cur) + '. Use “Undo move” to back up, or start over.', 'bad');
    else setMsg(n + ' of 64 squares visited. ' + open.length + (open.length === 1 ? ' move' : ' moves') + ' available from ' + PZ.name(cur) + '.', 'info');
  }

  function draw() {
    var cur = path.length ? path[path.length - 1] : -1;
    var legal = {};
    if (cur >= 0 && path.length < 64 && !timer && $('k-hints').checked) moves(cur).forEach(function (m) { if (!visited[m]) legal[m] = true; });
    squares.forEach(function (s, i) {
      s.classList.toggle('seen', !!visited[i] && i !== cur);
      s.classList.toggle('cur', i === cur);
      s.classList.toggle('legal', !!legal[i]);
      s.classList.toggle('start', path.length > 0 && i === path[0]);
      var img = s.querySelector('.pz-piece'), num = s.querySelector('.pz-num');
      if (i === cur && !img) s.insertBefore(PZ.piece('bN'), s.firstChild);
      if (i !== cur && img) img.remove();
      if (visited[i] && i !== cur) { if (!num) { num = document.createElement('span'); num.className = 'pz-num'; s.appendChild(num); } num.textContent = visited[i]; }
      else if (num) num.remove();
      s.setAttribute('aria-label', PZ.name(i) + (i === cur ? ', knight is here' : visited[i] ? ', visited as move ' + visited[i] : legal[i] ? ', legal move' : ''));
    });
    trace();
    var n = path.length;
    $('k-count').textContent = n + ' / 64';
    $('k-bar').style.width = (n / 64 * 100) + '%';
    $('k-start').textContent = n ? PZ.name(path[0]) : '—';
    $('k-now').textContent = n ? PZ.name(cur) : '—';
    $('k-undo').disabled = n < 2 || !!timer;
  }

  function trace() {
    var pts = path.map(function (i) { return (PZ.col(i) + .5) + ',' + (PZ.row(i) + .5); });
    var h = '';
    if (path.length > 1) {
      h += '<polyline class="casing" points="' + pts.join(' ') + '"/><polyline class="line" points="' + pts.join(' ') + '"/>';
    }
    if (path.length === 64 && isKnightMove(path[63], path[0])) {
      var a = path[63], b = path[0];
      h += '<line class="close casing" x1="' + (PZ.col(a) + .5) + '" y1="' + (PZ.row(a) + .5) + '" x2="' + (PZ.col(b) + .5) + '" y2="' + (PZ.row(b) + .5) + '"/>' +
           '<line class="close" x1="' + (PZ.col(a) + .5) + '" y1="' + (PZ.row(a) + .5) + '" x2="' + (PZ.col(b) + .5) + '" y2="' + (PZ.row(b) + .5) + '"/>';
    }
    if (path.length) h += '<circle class="startdot" cx="' + (PZ.col(path[0]) + .5) + '" cy="' + (PZ.row(path[0]) + .5) + '" r=".11"/>';
    svg.innerHTML = h;
  }

  $('k-hints').addEventListener('change', draw);
  $('k-undo').addEventListener('click', function () {
    if (timer || path.length < 2) return;
    var last = path.pop(); delete visited[last]; draw(); after();
  });
  $('k-reset').addEventListener('click', function () {
    cancel(); path = []; visited = {}; draw(); setMsg('Click a square to place your knight.', '');
  });
  $('k-show').addEventListener('click', function () {
    if (timer) return;
    if (!path.length) { setMsg('First place the knight on the square you want to start from, then press “Show answer”.', 'info'); return; }
    var start = path[0], tour = tourFrom(start);
    if (!tour) { setMsg('Sorry, the answer could not be generated. Please try again.', 'bad'); return; }
    path = [start]; visited = {}; visited[start] = 1; draw();
    setMsg('Tracing a closed tour from ' + PZ.name(start) + '…', 'info');
    var k = 1;
    function step() {
      path.push(tour[k]); visited[tour[k]] = path.length; k++;
      if (k >= 64) { cancel(); draw(); setMsg('Closed tour from ' + PZ.name(start) + ': all 64 squares are visited once, and the last square, ' + PZ.name(path[63]) + ', is a knight’s move from the start — the dashed line closes the loop.', 'ok'); return; }
      draw();
    }
    if (reduce) { while (k < 64) step(); return; }
    boardEl.classList.add('busy');
    timer = setInterval(step, 60);
    draw();
  });

  draw();
  window.__knight = { closedTour: closedTour, tourFrom: tourFrom, moves: moves };
})();
