/* Hangman */
(function () {
  var stage = document.getElementById('hm-word');
  if (!stage || !window.HANGMAN_TOPICS) return;
  var $ = function (id) { return document.getElementById(id); };
  var TOPICS = window.HANGMAN_TOPICS, MAX = 7;
  var sel = $('hm-topic');
  var topic = 'all', answer = '', original = '', guessed = {}, wrong = [], over = true, hinted = false, bag = {}, score = { wins: 0, losses: 0, streak: 0, best: 0 };

  Object.keys(TOPICS).forEach(function (k) { var o = document.createElement('option'); o.value = k; o.textContent = TOPICS[k].icon + '  ' + k; sel.appendChild(o); });
  var all = document.createElement('option'); all.value = 'all'; all.textContent = '🎲  Surprise me (all topics)'; sel.insertBefore(all, sel.firstChild); sel.value = 'all';

  // on-screen keyboard
  var kb = $('hm-keys'); 'QWERTYUIOPASDFGHJKLZXCVBNM'.split('').forEach(function (ch) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'hm-key'; b.textContent = ch; b.dataset.k = ch;
    b.addEventListener('click', function () { guess(ch); }); kb.appendChild(b);
  });

  function pick() {
    var pool = [];
    if (topic === 'all') Object.keys(TOPICS).forEach(function (t) { TOPICS[t].words.forEach(function (w) { pool.push([t, w]); }); });
    else TOPICS[topic].words.forEach(function (w) { pool.push([topic, w]); });
    var key = topic; bag[key] = (bag[key] || []).filter(function (x) { return pool.some(function (p) { return p[1] === x; }); });
    var fresh = pool.filter(function (p) { return bag[key].indexOf(p[1]) < 0; });
    if (!fresh.length) { bag[key] = []; fresh = pool; }                     // every word used once: start over
    var c = fresh[Math.floor(Math.random() * fresh.length)]; bag[key].push(c[1]); return c;
  }

  function newGame() {
    var c = pick(); original = c[1]; answer = c[1].toUpperCase(); guessed = {}; wrong = []; over = false; hinted = false;
    $('hm-cat').textContent = TOPICS[c[0]].icon + ' ' + c[0];
    $('hm-msg').textContent = 'Pick a letter — click the keyboard or just type.'; $('hm-msg').className = 'pz-msg info';
    $('hm-hint').disabled = false; stage.parentNode.classList.remove('won', 'lost');
    draw();
  }

  function guess(ch) {
    if (over || guessed[ch]) return;
    guessed[ch] = true;
    var hit = answer.indexOf(ch) >= 0;
    if (!hit) wrong.push(ch);
    draw(hit ? ch : null, !hit);
    var done = answer.split('').every(function (c) { return !/[A-Z]/.test(c) || guessed[c]; });
    if (done) finish(true); else if (wrong.length >= MAX) finish(false);
    else {
      var left = MAX - wrong.length;
      $('hm-msg').className = 'pz-msg ' + (hit ? 'ok' : 'bad');
      $('hm-msg').textContent = hit ? 'Yes! ' + ch + ' appears ' + count(ch) + (count(ch) > 1 ? ' times.' : ' time.') : 'No ' + ch + ' here. ' + left + (left === 1 ? ' life left — last chance!' : ' lives left.');
    }
  }
  function count(ch) { return answer.split('').filter(function (c) { return c === ch; }).length; }

  function finish(won) {
    over = true; $('hm-hint').disabled = true;
    if (won) { score.wins++; score.streak++; score.best = Math.max(score.best, score.streak); }
    else { score.losses++; score.streak = 0; }
    stage.parentNode.classList.add(won ? 'won' : 'lost');
    $('hm-msg').className = 'pz-msg ' + (won ? 'ok' : 'bad');
    $('hm-msg').textContent = won ? 'You saved him! 🎉 ' + original + ' — with ' + (MAX - wrong.length) + ' lives to spare.' : 'Oh no — the game is over. The answer was “' + original + '”. Try another!';
    draw();
  }
  function titleCase(s) { return s.toLowerCase().replace(/(^|[\s\-'])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); }); }

  function draw(lastHit, shake) {
    // word slots, grouped per word so long phrases wrap neatly
    stage.innerHTML = '';
    answer.split(' ').forEach(function (word) {
      var g = document.createElement('span'); g.className = 'hm-w';
      word.split('').forEach(function (c) {
        var s = document.createElement('span');
        if (/[A-Z]/.test(c)) {
          var show = guessed[c] || (over && !guessed[c]);
          s.className = 'hm-slot' + (show ? ' on' : '') + (over && !guessed[c] ? ' miss' : '') + (c === lastHit ? ' pop' : '');
          s.textContent = show ? c : '';
        } else { s.className = 'hm-punct'; s.textContent = c; }
        g.appendChild(s);
      });
      stage.appendChild(g);
    });
    // wrong letters
    var w = $('hm-wrong'); w.innerHTML = '';
    wrong.forEach(function (c) { var s = document.createElement('span'); s.textContent = c; w.appendChild(s); });
    if (!wrong.length) w.innerHTML = '<em>none yet</em>';
    // keyboard
    kb.querySelectorAll('.hm-key').forEach(function (b) {
      var c = b.dataset.k; b.disabled = over || !!guessed[c];
      b.classList.toggle('hit', !!guessed[c] && answer.indexOf(c) >= 0); b.classList.toggle('miss', !!guessed[c] && answer.indexOf(c) < 0);
    });
    // figure: show one more part per wrong guess
    var fig = $('hm-figure'); fig.querySelectorAll('[data-p]').forEach(function (p) { p.classList.toggle('on', +p.dataset.p <= wrong.length); }); fig.classList.toggle('dead', wrong.length >= MAX);
    fig.classList.toggle('shake', !!shake); if (shake) { fig.classList.remove('shake'); void fig.getBoundingClientRect(); fig.classList.add('shake'); }
    // lives and mood
    var lives = $('hm-lives'); lives.innerHTML = '';
    for (var i = 0; i < MAX; i++) { var h = document.createElement('span'); h.className = 'hm-heart' + (i < MAX - wrong.length ? '' : ' gone'); h.textContent = '♥'; lives.appendChild(h); }
    var left = MAX - wrong.length;
    $('hm-mood').textContent = over ? (wrong.length >= MAX ? 'Game over…' : 'Hooray! Safe and sound!') : left === MAX ? 'All good so far.' : left > 4 ? 'Hmm, careful…' : left > 1 ? 'Getting nervous!' : 'Last chance!';
    $('hm-score').innerHTML = '<span><b>' + score.wins + '</b> won</span><span><b>' + score.losses + '</b> lost</span><span>streak <b>' + score.streak + '</b></span><span>best <b>' + score.best + '</b></span>';
  }

  $('hm-hint').addEventListener('click', function () {
    if (over || hinted) return;
    var hidden = answer.split('').filter(function (c) { return /[A-Z]/.test(c) && !guessed[c]; });
    if (!hidden.length || wrong.length >= MAX - 1) { $('hm-msg').className = 'pz-msg bad'; $('hm-msg').textContent = 'No hint now — it would cost your last life.'; return; }
    hinted = true; $('hm-hint').disabled = true;
    var ch = hidden[Math.floor(Math.random() * hidden.length)];
    guessed[ch] = true; wrong.push('💡'); draw(ch, false);
    $('hm-msg').className = 'pz-msg info'; $('hm-msg').textContent = 'Hint: the letter ' + ch + ' is revealed — it cost you one life.';
    if (answer.split('').every(function (c) { return !/[A-Z]/.test(c) || guessed[c]; })) finish(true);
  });
  $('hm-new').addEventListener('click', newGame);
  sel.addEventListener('change', function () { topic = sel.value; newGame(); });
  document.addEventListener('keydown', function (e) {
    var panel = $('puzzle-hangman'); if (!panel || panel.hidden) return;
    var t = e.target && e.target.tagName; if (t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^[a-zA-Z]$/.test(e.key)) guess(e.key.toUpperCase());
    else if (e.key === 'Enter' && over) newGame();
  });
  newGame();
  window.__hangman = { get answer() { return answer; }, guess: guess };
})();
