// Wordle: guess the five-letter word in six tries. Daily word + unlimited practice.
(function () {
  var G = window.Games, ROWS = 6, COLS = 5, EPOCH = Date.UTC(2026, 0, 1);
  var ANSWERS = window.WORDLE_WORDS.answers.split(' '), VALID = {};
  ANSWERS.forEach(function (w) { VALID[w] = 1; }); window.WORDLE_WORDS.valid.split(' ').forEach(function (w) { VALID[w] = 1; });

  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  var ORDER = (function () { var a = ANSWERS.slice(), r = mulberry(20260101); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; })();
  function dayNumber() { var d = new Date(); return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - EPOCH) / 864e5); }
  function dailyWord(n) { return ORDER[((n % ORDER.length) + ORDER.length) % ORDER.length]; }
  function evaluate(guess, answer) {            // 2 = right place, 1 = elsewhere, 0 = absent (duplicates handled)
    var res = [0, 0, 0, 0, 0], left = {}, i;
    for (i = 0; i < 5; i++) { if (guess[i] === answer[i]) res[i] = 2; else left[answer[i]] = (left[answer[i]] || 0) + 1; }
    for (i = 0; i < 5; i++) { if (res[i] === 0 && left[guess[i]] > 0) { res[i] = 1; left[guess[i]]--; } }
    return res;
  }
  function hardViolation(guess, prev) {           // returns a message if a revealed hint is not used
    for (var p = 0; p < prev.length; p++) {
      var g = prev[p].word, r = prev[p].res;
      for (var i = 0; i < 5; i++) { if (r[i] === 2 && guess[i] !== g[i]) return (i + 1) + ordinal(i + 1) + ' letter must be ' + g[i].toUpperCase(); }
      for (i = 0; i < 5; i++) if (r[i] === 1 && guess.indexOf(g[i]) < 0) return 'Guess must contain ' + g[i].toUpperCase();
    }
    return null;
  }
  function ordinal(n) { return n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'; }
  G.logic.wordle = { evaluate: evaluate, dailyWord: dailyWord, hardViolation: hardViolation, answers: ANSWERS, valid: VALID };

  G.register('wordle', {
    init: function (host) {
      var KEYS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'], MSG = ['Genius!', 'Magnificent!', 'Impressive!', 'Splendid!', 'Great!', 'Phew!'];
      var opts = G.store('wd-opts') || { hard: false, cb: false }, stats = G.store('wd-stats') || { played: 0, wins: 0, streak: 0, max: 0, dist: [0, 0, 0, 0, 0, 0], last: -1 };
      var mode = 'daily', answer, guesses, cur, status, day, busy, visible = false, keyState = {};
      host.innerHTML =
        '<div class="wd-bar"><div class="wd-seg" role="group" aria-label="Game mode"><button type="button" data-m="daily" aria-pressed="true">Daily word</button><button type="button" data-m="practice" aria-pressed="false">Practice</button></div>' +
        '<label class="pz-check"><input type="checkbox" data-o="hard"> Hard mode</label><label class="pz-check"><input type="checkbox" data-o="cb"> Colour-blind colours</label>' +
        '<button class="btn" data-k="stats" type="button">Statistics</button><button class="btn" data-k="new" type="button" hidden>New word</button></div>' +
        '<div class="wd-wrap"><div class="wd-main"><div class="wd-toast" role="status" aria-live="polite"></div><div class="wd-board" aria-label="Wordle board"></div><div class="wd-kb"></div></div>' +
        '<aside class="gm-side"><div class="gm-msg" data-k="info"></div><div class="wd-stats" hidden></div>' +
        '<div class="pz-note"><strong>How to play.</strong> Type a five-letter word and press Enter. After each guess the tiles change colour: <span class="wd-key c2">green</span> right letter, right spot · <span class="wd-key c1">yellow</span> right letter, wrong spot · <span class="wd-key c0">grey</span> not in the word. Hard mode makes you reuse every hint you have found. The daily word is the same for everyone on a given date and changes at midnight; Practice gives unlimited extra words.</div></aside></div>';
      var board = host.querySelector('.wd-board'), kb = host.querySelector('.wd-kb'), toast = host.querySelector('.wd-toast'), info = host.querySelector('[data-k=info]'), statsBox = host.querySelector('.wd-stats'), tiles = [], rows = [];
      host.classList.toggle('wd-cb', opts.cb); host.querySelector('[data-o=hard]').checked = opts.hard; host.querySelector('[data-o=cb]').checked = opts.cb;
      for (var r = 0; r < ROWS; r++) { var row = G.el('div', 'wd-row'); rows.push(row); for (var c = 0; c < COLS; c++) { var t = G.el('div', 'wd-tile'); t.innerHTML = '<span></span>'; row.appendChild(t); tiles.push(t); } board.appendChild(row); }
      KEYS.forEach(function (line, li) {
        var row = G.el('div', 'wd-krow'); if (li === 2) row.appendChild(mkKey('Enter', 'enter', 'wd-wide'));
        line.split('').forEach(function (ch) { row.appendChild(mkKey(ch.toUpperCase(), ch)); }); if (li === 2) row.appendChild(mkKey('⌫', 'back', 'wd-wide')); kb.appendChild(row);
      });
      function mkKey(label, val, cls) { var b = G.el('button', 'wd-key ' + (cls || ''), label); b.type = 'button'; b.dataset.k = val; if (val === 'back') b.setAttribute('aria-label', 'Backspace'); b.addEventListener('click', function () { press(val); this.blur(); }); return b; }
      function say(text, ms) { toast.textContent = text; toast.classList.add('on'); clearTimeout(say.t); if (ms !== 0) say.t = setTimeout(function () { toast.classList.remove('on'); }, ms || 1600); }
      function tile(r, c) { return tiles[r * COLS + c]; }

      function start(m, fresh) {
        mode = m; host.querySelectorAll('[data-m]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.m === m)); }); host.querySelector('[data-k=new]').hidden = m !== 'practice';
        guesses = []; cur = ''; status = 'play'; keyState = {}; busy = false; day = dayNumber();
        if (m === 'daily') {
          answer = dailyWord(day); var saved = G.store('wd-daily');
          if (saved && saved.day === day) { guesses = saved.words.map(function (w) { return { word: w, res: evaluate(w, answer) }; }); status = saved.status; }
        } else answer = ANSWERS[Math.floor(Math.random() * ANSWERS.length)];
        guesses.forEach(function (g) { g.res.forEach(function (s, i) { upKey(g.word[i], s); }); });
        redraw(); lockOpts();
        info.textContent = m === 'daily' ? 'Daily word #' + (day + 1) + (status === 'play' ? ': six tries to find it.' : status === 'won' ? ': you solved it today.' : ': today’s word was ' + answer.toUpperCase() + '.') : 'Practice: a random word, six tries.';
        if (status !== 'play') showStats();
      }
      function redraw() {
        tiles.forEach(function (t) { t.className = 'wd-tile'; t.firstChild.textContent = ''; });
        guesses.forEach(function (g, r) { for (var c = 0; c < COLS; c++) { var t = tile(r, c); t.firstChild.textContent = g.word[c]; t.className = 'wd-tile r' + g.res[c]; } });
        if (status === 'play') for (var c2 = 0; c2 < COLS; c2++) { var t2 = tile(guesses.length, c2); t2.firstChild.textContent = cur[c2] || ''; t2.className = 'wd-tile' + (cur[c2] ? ' fill' : ''); }
        kb.querySelectorAll('.wd-key').forEach(function (k) { var s = keyState[k.dataset.k]; k.className = 'wd-key' + (k.dataset.k.length > 1 ? ' wd-wide' : '') + (s != null ? ' c' + s : ''); });
        rows.forEach(function (r, i) { r.setAttribute('aria-label', 'Row ' + (i + 1)); });
      }
      function upKey(ch, s) { if (keyState[ch] == null || s > keyState[ch]) keyState[ch] = s; }
      function lockOpts() { host.querySelector('[data-o=hard]').disabled = guesses.length > 0 && status === 'play'; }
      function press(k) {
        if (busy || status !== 'play' || !visible) return;
        if (k === 'enter') return submit();
        if (k === 'back') { cur = cur.slice(0, -1); return redraw(); }
        if (/^[a-z]$/.test(k) && cur.length < COLS) { cur += k; redraw(); var t = tile(guesses.length, cur.length - 1); t.classList.add('pop'); }
      }
      function shake() { rows[guesses.length].classList.remove('shake'); void rows[guesses.length].offsetWidth; rows[guesses.length].classList.add('shake'); }
      function submit() {
        if (cur.length < COLS) { shake(); return say('Not enough letters'); }
        if (!VALID[cur]) { shake(); return say('Not in word list'); }
        if (opts.hard) { var v = hardViolation(cur, guesses); if (v) { shake(); return say(v, 2200); } }
        var res = evaluate(cur, answer), g = { word: cur, res: res }, r = guesses.length; guesses.push(g); cur = ''; busy = true; lockOpts();
        for (var c = 0; c < COLS; c++) (function (c) {
          var t = tile(r, c); t.firstChild.textContent = g.word[c]; t.className = 'wd-tile flip'; t.style.animationDelay = c * 280 + 'ms';
          setTimeout(function () { t.className = 'wd-tile flip r' + res[c]; }, c * 280 + 260);
        })(c);
        setTimeout(function () {
          for (var c = 0; c < COLS; c++) { tile(r, c).style.animationDelay = ''; upKey(g.word[c], res[c]); }
          busy = false; var won = res.every(function (x) { return x === 2; });
          if (won) { status = 'won'; for (c = 0; c < COLS; c++) { tile(r, c).classList.add('bounce'); tile(r, c).style.animationDelay = c * 90 + 'ms'; } say(MSG[r], 2600); }
          else if (guesses.length === ROWS) { status = 'lost'; say(answer.toUpperCase(), 0); }
          redraw(); if (status !== 'play') finish(r);
          if (mode === 'daily') G.store('wd-daily', { day: day, words: guesses.map(function (x) { return x.word; }), status: status });
        }, COLS * 280 + 300);
      }
      function finish(r) {
        if (mode === 'daily' && stats.last !== day) {
          stats.played++; if (status === 'won') { stats.wins++; stats.dist[guesses.length - 1]++; stats.streak = stats.last === day - 1 ? stats.streak + 1 : 1; stats.max = Math.max(stats.max, stats.streak); } else stats.streak = 0;
          stats.last = day; G.store('wd-stats', stats);
        }
        info.textContent = status === 'won' ? 'Solved in ' + guesses.length + ' ' + (guesses.length === 1 ? 'try' : 'tries') + '.' : 'The word was ' + answer.toUpperCase() + '.';
        setTimeout(showStats, 900);
      }
      function shareText() {
        var sq = opts.cb ? ['⬛', '🟦', '🟧'] : ['⬛', '🟨', '🟩'];
        return 'Wordle ' + (mode === 'daily' ? '#' + (day + 1) : '(practice)') + ' ' + (status === 'won' ? guesses.length : 'X') + '/6' + (opts.hard ? '*' : '') + '\n' + guesses.map(function (g) { return g.res.map(function (s) { return sq[s]; }).join(''); }).join('\n');
      }
      function showStats() {
        var max = Math.max.apply(null, stats.dist.concat(1)), done = status !== 'play';
        statsBox.innerHTML = '<h3>Statistics <small>(daily games)</small></h3><dl class="gm-score"><div><dt>Played</dt><dd>' + stats.played + '</dd></div><div><dt>Win %</dt><dd>' + (stats.played ? Math.round(stats.wins / stats.played * 100) : 0) + '</dd></div><div><dt>Streak</dt><dd>' + stats.streak + '</dd></div><div><dt>Best</dt><dd>' + stats.max + '</dd></div></dl>' +
          '<div class="wd-dist">' + stats.dist.map(function (n, i) { return '<div><span>' + (i + 1) + '</span><i style="width:' + Math.max(8, n / max * 100) + '%" class="' + (done && status === 'won' && mode === 'daily' && guesses.length === i + 1 ? 'hi' : '') + '">' + n + '</i></div>'; }).join('') + '</div>' +
          (done ? '<div class="btn-row" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="btn btn-primary" data-k="share" type="button">Copy result</button>' + (mode === 'practice' ? '<button class="btn" data-k="again" type="button">Another word</button>' : '') + '</div>' : '');
        statsBox.hidden = false;
        var sh = statsBox.querySelector('[data-k=share]'); if (sh) sh.addEventListener('click', function () { var b = this; (navigator.clipboard ? navigator.clipboard.writeText(shareText()) : Promise.reject()).then(function () { b.textContent = 'Copied!'; }).catch(function () { window.prompt('Copy your result:', shareText()); }); });
        var ag = statsBox.querySelector('[data-k=again]'); if (ag) ag.addEventListener('click', function () { statsBox.hidden = true; start('practice'); });
      }
      host.querySelectorAll('[data-m]').forEach(function (b) { b.addEventListener('click', function () { statsBox.hidden = true; toast.classList.remove('on'); start(b.dataset.m); }); });
      host.querySelector('[data-k=new]').addEventListener('click', function () { statsBox.hidden = true; toast.classList.remove('on'); start('practice'); });
      host.querySelector('[data-k=stats]').addEventListener('click', function () { statsBox.hidden ? showStats() : (statsBox.hidden = true); });
      host.querySelector('[data-o=hard]').addEventListener('change', function () { opts.hard = this.checked; G.store('wd-opts', opts); });
      host.querySelector('[data-o=cb]').addEventListener('change', function () { opts.cb = this.checked; G.store('wd-opts', opts); host.classList.toggle('wd-cb', opts.cb); });
      function onKey(e) {
        if (!visible || e.ctrlKey || e.metaKey || e.altKey) return; var tg = e.target && e.target.tagName; if (tg === 'INPUT' || tg === 'SELECT' || tg === 'TEXTAREA') return;
        if (e.key === 'Enter') { if (tg === 'BUTTON') return; press('enter'); e.preventDefault(); } else if (e.key === 'Backspace') press('back'); else if (/^[a-zA-Z]$/.test(e.key)) press(e.key.toLowerCase());
      }
      document.addEventListener('keydown', onKey);
      this.show = function () { visible = true; if (mode === 'daily' && day !== dayNumber()) start('daily'); };
      this.hide = function () { visible = false; };
      visible = true; start('daily');
    }
  });
})();
