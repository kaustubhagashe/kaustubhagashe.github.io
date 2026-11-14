// 12 x 12 crossword: a new puzzle is generated from the clue bank every time.
(function () {
  var G = window.Games, N = 12;

  // ---------- generator ----------
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function canPlace(g, dirs, word, r, c, dir) {
    var dr = dir === 'A' ? 0 : 1, dc = dir === 'A' ? 1 : 0, L = word.length, cross = 0;
    var er = r + dr * L, ec = c + dc * L, br = r - dr, bc = c - dc;
    if (r < 0 || c < 0 || r + dr * (L - 1) >= N || c + dc * (L - 1) >= N) return false;
    if (br >= 0 && bc >= 0 && g[br][bc]) return false;
    if (er < N && ec < N && g[er][ec]) return false;
    for (var i = 0; i < L; i++) {
      var y = r + dr * i, x = c + dc * i, ch = g[y][x];
      if (ch) { if (ch !== word[i] || dirs[y][x].indexOf(dir) > -1) return false; cross++; }
      else {
        var y1 = y + dc, x1 = x + dr, y2 = y - dc, x2 = x - dr;               // perpendicular neighbours must be empty
        if ((y1 < N && x1 < N && g[y1][x1]) || (y2 >= 0 && x2 >= 0 && g[y2][x2])) return false;
      }
    }
    return cross > 0 || null;
  }
  function attempt(bank) {
    var g = [], dirs = [], placed = [], r, c; for (r = 0; r < N; r++) { g.push(Array(N).fill('')); dirs.push(Array.from({ length: N }, function () { return ''; })); }
    var order = shuffle(bank), longs = order.filter(function (w) { return w[0].length >= 7; }), first = longs.length ? longs[0] : order[0];
    function put(w, r0, c0, dir) { var dr = dir === 'A' ? 0 : 1, dc = dir === 'A' ? 1 : 0; for (var i = 0; i < w[0].length; i++) { g[r0 + dr * i][c0 + dc * i] = w[0][i]; dirs[r0 + dr * i][c0 + dc * i] += dir; } placed.push({ w: w, r: r0, c: c0, dir: dir }); }
    var fr = 2 + Math.floor(Math.random() * 7), fc = Math.max(0, Math.min(N - first[0].length, Math.floor((N - first[0].length) / 2) + Math.floor(Math.random() * 3) - 1)); put(first, fr, fc, 'A');
    var used = {}; used[first[0]] = 1;
    for (var pass = 0; pass < 3; pass++) order.forEach(function (w) {
      if (used[w[0]] || placed.length >= 22) return; var word = w[0], best = null, bs = -1;
      placed.slice().forEach(function (p) {
        for (var i = 0; i < p.w[0].length; i++) for (var j = 0; j < word.length; j++) {
          if (p.w[0][i] !== word[j]) continue;
          var dir = p.dir === 'A' ? 'D' : 'A', rr = dir === 'D' ? p.r + (p.dir === 'A' ? 0 : i) - j : p.r + i, cc = dir === 'A' ? p.c + (p.dir === 'D' ? 0 : i) - j : p.c + i;
          if (p.dir === 'A') { rr = p.r - j; cc = p.c + i; } else { rr = p.r + i; cc = p.c - j; }
          var ok = canPlace(g, dirs, word, rr, cc, dir); if (ok) { var s = Math.random() + (Math.abs(rr - 5.5) + Math.abs(cc - 5.5) < 8 ? .5 : 0); if (s > bs) { bs = s; best = [rr, cc, dir]; } }
        }
      });
      if (best) { put(w, best[0], best[1], best[2]); used[word] = 1; }
    });
    return { g: g, placed: placed };
  }
  function generate(bank) {
    var best = null, bs = -1;
    for (var t = 0; t < 120; t++) { var a = attempt(bank), cells = 0; a.g.forEach(function (row) { row.forEach(function (ch) { if (ch) cells++; }); }); var s = a.placed.length * 6 + cells; if (s > bs) { bs = s; best = a; } if (a.placed.length >= 16 && cells > 70) return a; }
    return best;
  }
  // derive numbered words from the finished grid
  function analyse(puz, bank) {
    var g = puz.g, clue = {}; bank.forEach(function (w) { clue[w[0]] = w[1]; });
    var num = 0, words = [], nums = {}, r, c;
    for (r = 0; r < N; r++) for (c = 0; c < N; c++) {
      if (!g[r][c]) continue;
      var sa = (c === 0 || !g[r][c - 1]) && c + 1 < N && g[r][c + 1], sd = (r === 0 || !g[r - 1][c]) && r + 1 < N && g[r + 1][c];
      if (!sa && !sd) continue; num++; nums[r + ',' + c] = num;
      [['A', sa, 0, 1], ['D', sd, 1, 0]].forEach(function (d) {
        if (!d[1]) return; var cells = [], y = r, x = c, ans = ''; while (y < N && x < N && g[y][x]) { cells.push([y, x]); ans += g[y][x]; y += d[2]; x += d[3]; }
        words.push({ num: num, dir: d[0], cells: cells, answer: ans, clue: clue[ans] || 'Fill in the word' });
      });
    }
    return { g: g, words: words, nums: nums };
  }
  G.logic.crossword = { generate: generate, analyse: analyse, N: N };

  G.register('crossword', {
    init: function (host) {
      host.innerHTML =
        '<div class="cw-wrap"><div class="cw-main">' +
        '<div class="gm-bar"><button class="btn btn-primary" data-k="new" type="button">New puzzle</button>' +
        '<div class="cw-menu"><button class="btn" data-k="check" type="button">Check puzzle</button><button class="btn" data-k="checkw" type="button">Check word</button></div>' +
        '<div class="cw-menu"><button class="btn" data-k="revl" type="button">Reveal letter</button><button class="btn" data-k="revw" type="button">Reveal word</button><button class="btn" data-k="reva" type="button">Reveal all</button></div>' +
        '<button class="btn" data-k="clear" type="button">Clear</button><span class="cw-time" aria-label="Time">00:00</span></div>' +
        '<div class="cw-cur" aria-live="polite"></div>' +
        '<div class="cw-grid" role="grid" aria-label="Crossword grid"></div>' +
        '<input class="cw-input" type="text" inputmode="text" autocapitalize="characters" autocomplete="off" autocorrect="off" spellcheck="false" aria-label="Type your letters here" maxlength="2">' +
        '<div class="gm-msg" role="status" aria-live="polite"></div></div>' +
        '<aside class="cw-clues"><div><h3>Across</h3><ol data-d="A"></ol></div><div><h3>Down</h3><ol data-d="D"></ol></div></aside></div>';
      var gridEl = host.querySelector('.cw-grid'), inp = host.querySelector('.cw-input'), cur = host.querySelector('.cw-cur'), msg = host.querySelector('.gm-msg'), timeEl = host.querySelector('.cw-time');
      var P, user, mark, sel, cells = [], byCell, started, t0, timer, solved;
      function fmt(s) { var m = Math.floor(s / 60), r = s % 60; return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r; }
      function stopTimer() { clearInterval(timer); timer = null; }
      function tick() { timeEl.textContent = fmt(Math.floor((Date.now() - t0) / 1000)); }
      function begin() { if (started || solved) return; started = true; t0 = Date.now(); timer = setInterval(tick, 1000); }

      function build() {
        var gen = generate(window.CROSSWORD_WORDS); P = analyse(gen, window.CROSSWORD_WORDS);
        user = []; mark = []; for (var r = 0; r < N; r++) { user.push(Array(N).fill('')); mark.push(Array(N).fill('')); }
        byCell = {}; P.words.forEach(function (w, i) { w.cells.forEach(function (c) { (byCell[c[0] + ',' + c[1]] = byCell[c[0] + ',' + c[1]] || {})[w.dir] = i; }); });
        gridEl.innerHTML = ''; cells = [];
        for (r = 0; r < N; r++) for (var c = 0; c < N; c++) {
          var d = G.el('div', 'cw-cell' + (P.g[r][c] ? '' : ' blk')); d.setAttribute('role', 'gridcell');
          if (P.g[r][c]) { var n = P.nums[r + ',' + c]; d.innerHTML = (n ? '<span class="cw-n">' + n + '</span>' : '') + '<span class="cw-l"></span>'; (function (r, c) { d.addEventListener('click', function () { clickCell(r, c); }); })(r, c); }
          gridEl.appendChild(d); cells.push(d);
        }
        ['A', 'D'].forEach(function (dir) {
          var ol = host.querySelector('[data-d=' + dir + ']'); ol.innerHTML = '';
          P.words.forEach(function (w, i) { if (w.dir !== dir) return; var li = G.el('li'); var b = G.el('button', '', '<b>' + w.num + '</b> ' + w.clue + ' <small>(' + w.answer.length + ')</small>'); b.type = 'button'; b.dataset.i = i; b.addEventListener('click', function () { selectWord(i); focusInput(); }); li.appendChild(b); ol.appendChild(li); });
        });
        started = false; solved = false; stopTimer(); timeEl.textContent = '00:00';
        var first = P.words[0]; sel = { r: first.cells[0][0], c: first.cells[0][1], dir: first.dir }; msg.textContent = P.words.length + ' words. Click a square and start typing.'; paint();
      }
      function curWord() { var k = byCell[sel.r + ',' + sel.c]; if (!k) return null; if (k[sel.dir] == null) sel.dir = sel.dir === 'A' ? 'D' : 'A'; return P.words[k[sel.dir]]; }
      function paint() {
        var w = curWord(), inW = {}; if (w) w.cells.forEach(function (c) { inW[c[0] + ',' + c[1]] = 1; });
        for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) {
          var d = cells[r * N + c]; if (d.classList.contains('blk')) continue;
          var k = r + ',' + c; d.className = 'cw-cell' + (inW[k] ? ' in' : '') + (sel.r === r && sel.c === c ? ' cur' : '') + (mark[r][c] ? ' ' + mark[r][c] : '');
          d.querySelector('.cw-l').textContent = user[r][c];
        }
        Array.prototype.forEach.call(host.querySelectorAll('.cw-clues button'), function (b) { b.classList.toggle('on', w && +b.dataset.i === P.words.indexOf(w)); });
        var on = host.querySelector('.cw-clues button.on'); if (on && on.scrollIntoView && on.offsetParent) { var box = on.closest('ol'); if (box && (on.offsetTop < box.scrollTop || on.offsetTop > box.scrollTop + box.clientHeight - 30)) box.scrollTop = on.offsetTop - 40; }
        cur.innerHTML = w ? '<b>' + w.num + ' ' + (w.dir === 'A' ? 'Across' : 'Down') + '</b> ' + w.clue + ' <small>(' + w.answer.length + ' letters)</small>' : '';
      }
      function focusInput() { try { inp.focus({ preventScroll: true }); } catch (e) { inp.focus(); } }
      function clickCell(r, c) { if (sel.r === r && sel.c === c) sel.dir = sel.dir === 'A' ? 'D' : 'A'; else { sel.r = r; sel.c = c; } paint(); focusInput(); }
      function selectWord(i) { var w = P.words[i]; var empty = w.cells.filter(function (c) { return !user[c[0]][c[1]]; })[0] || w.cells[0]; sel = { r: empty[0], c: empty[1], dir: w.dir }; paint(); }
      function move(dr, dc) { var r = sel.r + dr, c = sel.c + dc; while (r >= 0 && r < N && c >= 0 && c < N) { if (P.g[r][c]) { sel.r = r; sel.c = c; return paint(); } r += dr; c += dc; } }
      function advance(back) {
        var w = curWord(); if (!w) return; var i = -1; w.cells.forEach(function (c, k) { if (c[0] === sel.r && c[1] === sel.c) i = k; });
        var n = w.cells[i + (back ? -1 : 1)]; if (n) { sel.r = n[0]; sel.c = n[1]; }
      }
      function type(ch) {
        if (solved || !P.g[sel.r][sel.c]) return; begin(); user[sel.r][sel.c] = ch; mark[sel.r][sel.c] = ''; advance(false); paint(); verify();
      }
      function erase() { if (solved) return; if (user[sel.r][sel.c]) { user[sel.r][sel.c] = ''; mark[sel.r][sel.c] = ''; } else { advance(true); user[sel.r][sel.c] = ''; mark[sel.r][sel.c] = ''; } paint(); }
      function nextWord(back) { var w = curWord(), i = P.words.indexOf(w), n = P.words.length; selectWord((i + (back ? -1 : 1) + n) % n); }
      inp.addEventListener('keydown', function (e) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        var k = e.key;
        if (/^[a-zA-Z]$/.test(k)) { type(k.toUpperCase()); e.preventDefault(); }
        else if (k === 'Backspace') { erase(); e.preventDefault(); } else if (k === 'Delete') { user[sel.r][sel.c] = ''; mark[sel.r][sel.c] = ''; paint(); e.preventDefault(); }
        else if (k === 'ArrowLeft') { sel.dir = 'A'; move(0, -1); e.preventDefault(); } else if (k === 'ArrowRight') { sel.dir = 'A'; move(0, 1); e.preventDefault(); }
        else if (k === 'ArrowUp') { sel.dir = 'D'; move(-1, 0); e.preventDefault(); } else if (k === 'ArrowDown') { sel.dir = 'D'; move(1, 0); e.preventDefault(); }
        else if (k === ' ' || k === 'Enter') { sel.dir = sel.dir === 'A' ? 'D' : 'A'; paint(); e.preventDefault(); }
        else if (k === 'Tab') { nextWord(e.shiftKey); e.preventDefault(); }
      });
      inp.addEventListener('input', function () { var v = inp.value.replace(/[^a-zA-Z]/g, ''); inp.value = ''; if (v) type(v.slice(-1).toUpperCase()); });   // phone keyboards

      function verify() {
        if (solved) return; for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) if (P.g[r][c] && user[r][c] !== P.g[r][c]) return;
        solved = true; stopTimer(); var helped = mark.some(function (row) { return row.indexOf('rev') > -1 || row.some(function (m) { return /rev/.test(m); }); });
        msg.textContent = (helped ? 'Completed with a little help' : 'Solved! Well done') + ' in ' + timeEl.textContent + '. 🎉'; paint();
      }
      function reveal(list) { begin(); list.forEach(function (c) { if (P.g[c[0]][c[1]]) { user[c[0]][c[1]] = P.g[c[0]][c[1]]; mark[c[0]][c[1]] = 'rev'; } }); paint(); verify(); }
      function allCells() { var a = []; for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) a.push([r, c]); return a; }
      function check(list) {
        var bad = 0, filled = 0; list.forEach(function (c) { var u = user[c[0]][c[1]]; if (!u || !P.g[c[0]][c[1]]) return; filled++; if (u !== P.g[c[0]][c[1]]) { mark[c[0]][c[1]] = 'bad'; bad++; } });
        msg.textContent = !filled ? 'Nothing to check yet.' : bad ? bad + ' letter' + (bad > 1 ? 's are' : ' is') + ' wrong (shown in red).' : 'All letters so far are correct.'; paint();
      }
      var q = function (k) { return host.querySelector('[data-k=' + k + ']'); };
      q('new').addEventListener('click', function () { build(); focusInput(); });
      q('check').addEventListener('click', function () { check(allCells()); }); q('checkw').addEventListener('click', function () { check(curWord().cells); });
      q('revl').addEventListener('click', function () { reveal([[sel.r, sel.c]]); }); q('revw').addEventListener('click', function () { reveal(curWord().cells); });
      q('reva').addEventListener('click', function () { reveal(allCells()); });
      q('clear').addEventListener('click', function () { if (solved) return; for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) { user[r][c] = ''; mark[r][c] = ''; } msg.textContent = 'Cleared.'; paint(); });
      this.hide = function () { if (started && !solved) { stopTimer(); started = 'paused'; } };
      this.show = function () { if (started === 'paused') { t0 = Date.now() - (parseInt(timeEl.textContent, 10) * 60 + parseInt(timeEl.textContent.slice(3), 10)) * 1000; started = true; timer = setInterval(tick, 1000); } };
      build();
    }
  });
})();
