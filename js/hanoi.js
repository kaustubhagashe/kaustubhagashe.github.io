/* Tower of Hanoi — 3 to 5 towers, 3 to 8 rings. Four or more towers are solved with the Frame–Stewart algorithm. */
(function () {
  var root = document.getElementById('hn-board');
  if (!root) return;
  var $ = function (id) { return document.getElementById(id); };
  var msg = $('hn-msg');
  var P = 3, N = 4, pegs = [], history = [], selected = -1, runner = null, solved = false, bestCache = {};

  // ---------- optimal move counts / solution generator ----------
  function fs(n, p) {                       // minimum moves (Frame–Stewart) for n rings on p towers
    if (n === 0) return 0;
    if (n === 1) return 1;
    if (p < 3) return Infinity;
    var key = n + ',' + p; if (bestCache[key] != null) return bestCache[key];
    var best = Infinity;
    if (p === 3) best = Math.pow(2, n) - 1;
    else for (var k = 1; k < n; k++) best = Math.min(best, 2 * fs(k, p) + fs(n - k, p - 1));
    return (bestCache[key] = best);
  }
  function solution(n, p) {
    var out = [];
    (function go(n, src, dst, avail) {
      if (n === 0) return;
      if (n === 1) { out.push([src, dst]); return; }
      var spares = avail.filter(function (x) { return x !== src && x !== dst; });
      if (avail.length === 3) { go(n - 1, src, spares[0], avail); out.push([src, dst]); go(n - 1, spares[0], dst, avail); return; }
      var bestK = 1, bestV = Infinity;
      for (var k = 1; k < n; k++) { var v = 2 * fs(k, avail.length) + fs(n - k, avail.length - 1); if (v < bestV) { bestV = v; bestK = k; } }
      var mid = spares[0];
      go(bestK, src, mid, avail);
      go(n - bestK, src, dst, avail.filter(function (x) { return x !== mid; }));
      go(bestK, mid, dst, avail);
    })(n, 0, p - 1, Array.apply(null, Array(p)).map(function (_, i) { return i; }));
    return out;
  }

  // ---------- state ----------
  function reset() {
    stop();
    pegs = []; for (var i = 0; i < P; i++) pegs.push([]);
    for (var r = N; r >= 1; r--) pegs[0].push(r);       // bottom = N (largest) … top = 1
    history = []; selected = -1; solved = false;
    render();
    setMsg('Move all ' + N + ' rings from the Source tower to the Target tower. Click a tower to pick up its top ring, then click where it should go.', 'info');
  }
  function top(i) { return pegs[i].length ? pegs[i][pegs[i].length - 1] : Infinity; }
  function canMove(a, b) { return a !== b && pegs[a].length > 0 && top(a) < top(b); }
  function targetsFor(a) { var t = []; for (var b = 0; b < P; b++) if (canMove(a, b)) t.push(b); return t; }
  function anyMove() { for (var a = 0; a < P; a++) if (targetsFor(a).length) return true; return false; }
  function tname(i) { return 'Tower ' + (i + 1) + (i === 0 ? ' (Source)' : i === P - 1 ? ' (Target)' : ''); }
  function setMsg(t, kind) { msg.textContent = t; msg.className = 'pz-msg ' + (kind || ''); }

  function doMove(a, b, auto) {
    var ring = pegs[a].pop(); pegs[b].push(ring); history.push([a, b]); selected = -1;
    render();
    if (pegs[P - 1].length === N) {
      solved = true; var best = fs(N, P);
      if (!auto) setMsg(history.length === best ? 'Perfect! Solved in ' + history.length + ' moves — the minimum possible.' : 'Solved in ' + history.length + ' moves. The minimum possible is ' + best + ' — can you do it in fewer?', 'ok');
      return;
    }
    if (!auto) {
      if (!anyMove()) setMsg('Deadlock — no ring can be moved anywhere. Use “Undo move” or “Start over”.', 'bad');
      else setMsg('Moved ring ' + ring + ' from ' + tname(a) + ' to ' + tname(b) + '.', 'info');
    }
  }

  function onPeg(i) {
    if (runner) return;
    if (solved) { setMsg('This one is solved. Press “Start over” to play again.', 'ok'); return; }
    if (selected < 0) {
      if (!pegs[i].length) { setMsg(tname(i) + ' is empty — pick a tower that has a ring.', 'bad'); return; }
      if (!targetsFor(i).length) { setMsg('Deadlock for this ring: the top ring of ' + tname(i) + ' cannot go onto any other tower right now (each is topped by a smaller ring). Move a different ring first.', 'bad'); flash(i); return; }
      selected = i; render(); setMsg('Ring ' + top(i) + ' lifted from ' + tname(i) + '. Click the tower where it should go (glowing towers are allowed).', 'info'); return;
    }
    if (i === selected) { selected = -1; render(); setMsg('Ring put back. Pick a tower.', ''); return; }
    if (!canMove(selected, i)) { setMsg('Not allowed: ring ' + top(selected) + ' cannot be placed on the smaller ring ' + top(i) + '. A larger ring may never sit on a smaller one.', 'bad'); flash(i); return; }
    doMove(selected, i, false);
  }
  function flash(i) { var el = root.children[i]; if (!el) return; el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }

  // ---------- drawing ----------
  function render() {
    var ringH = N > 6 ? 18 : 22, height = N * ringH + 70;
    root.style.setProperty('--hn-cols', P); root.style.setProperty('--hn-h', height + 'px'); root.style.setProperty('--hn-ring', ringH + 'px');
    root.innerHTML = '';
    var targets = selected >= 0 ? targetsFor(selected) : [];
    for (var i = 0; i < P; i++) {
      var b = document.createElement('button'); b.type = 'button';
      b.className = 'hn-peg' + (i === selected ? ' sel' : '') + (targets.indexOf(i) >= 0 ? ' ok' : '') + (i === P - 1 ? ' target' : '') + (i === 0 ? ' source' : '');
      b.setAttribute('aria-label', tname(i) + ', ' + pegs[i].length + ' rings' + (pegs[i].length ? ', top ring ' + top(i) : ''));
      var stack = document.createElement('span'); stack.className = 'hn-stack';
      pegs[i].forEach(function (r, idx) {
        var d = document.createElement('span'); d.className = 'hn-ring' + (i === selected && idx === pegs[i].length - 1 ? ' lift' : '');
        d.style.width = (26 + 70 * r / N) + '%'; d.style.setProperty('--h', Math.round(32 + 300 * (r - 1) / Math.max(1, N - 1)));
        d.textContent = r; stack.appendChild(d);
      });
      var lab = document.createElement('span'); lab.className = 'hn-label'; lab.textContent = i === 0 ? 'Source' : i === P - 1 ? 'Target' : 'Spare ' + i;
      b.appendChild(stack); b.appendChild(lab);
      b.addEventListener('click', (function (k) { return function () { onPeg(k); }; })(i));
      root.appendChild(b);
    }
    $('hn-moves').textContent = history.length;
    $('hn-best').textContent = fs(N, P) + (P > 3 ? ' (best known)' : '');
    $('hn-undo').disabled = !history.length || !!runner;
  }

  // ---------- show answer ----------
  function stop() { if (runner) { clearInterval(runner); runner = null; } $('hn-show').innerHTML = $('hn-show').dataset.label || $('hn-show').innerHTML; root.classList.remove('busy'); }
  $('hn-show').dataset.label = $('hn-show').innerHTML;
  $('hn-show').addEventListener('click', function () {
    if (runner) { stop(); setMsg('Paused the demonstration. Press “Show answer” to run it again from the start, or carry on yourself.', 'info'); render(); return; }
    pegs = []; for (var i = 0; i < P; i++) pegs.push([]);
    for (var r = N; r >= 1; r--) pegs[0].push(r);
    history = []; selected = -1; solved = false; render();
    var seq = solution(N, P), k = 0, total = seq.length;
    $('hn-show').textContent = 'Stop demonstration';
    root.classList.add('busy');
    setMsg('Showing the shortest known solution: ' + total + ' moves. Watch the move counter.', 'info');
    function tick() {
      if (k >= total) { clearInterval(runner); runner = null; $('hn-show').innerHTML = $('hn-show').dataset.label; root.classList.remove('busy'); render(); setMsg('Solved in ' + total + ' moves — the shortest known solution for ' + N + ' rings on ' + P + ' towers.', 'ok'); return; }
      var m = seq[k++]; var ring = top(m[0]);
      doMove(m[0], m[1], true);
      setMsg('Step ' + k + ' of ' + total + ': ring ' + ring + ' from ' + tname(m[0]) + ' to ' + tname(m[1]) + '.', 'info');
    }
    var delay = total > 60 ? 220 : total > 30 ? 360 : 520;
    runner = setInterval(tick, delay); tick();
  });
  $('hn-undo').addEventListener('click', function () {
    if (runner || !history.length) return;
    var m = history.pop(); pegs[m[0]].push(pegs[m[1]].pop()); selected = -1; solved = false; render(); setMsg('Last move undone.', 'info');
  });
  $('hn-reset').addEventListener('click', reset);
  $('hn-towers').addEventListener('change', function () { P = +this.value; reset(); });
  $('hn-rings').addEventListener('change', function () { N = +this.value; reset(); });
  reset();
  window.__hanoi = { fs: fs, solution: solution };
})();
