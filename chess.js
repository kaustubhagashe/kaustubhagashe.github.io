/* Chess archive page: loads games, renders the board, and shows engine analysis.
   Depends on vendor/chess.js (chess.js 0.10.3) and js/engine.js (EvalService). */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ helpers */
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  var FILES = 'abcdefgh';
  var UCI_RE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

  /* ------------------------------------------------------------------ state */
  var loadedGames = [];
  var game = null;            // { positions:[{fen,from,to,check,terminal}], moves:[san], timings:[sec|null], user }
  var ply = 0;
  var flipped = false;
  var lastRenderedFen = null;
  var evalSvc = new EvalService({ onStatus: onEngineStatus });
  var evalToken = 0;
  var lastBest = null;        // {from,to} of the engine's suggestion for the current position
  var lastResult = null;

  /* ------------------------------------------------------------------ board */
  var boardEl = $('board');
  var squares = {};           // 'e4' -> element

  function buildBoard() {
    boardEl.innerHTML = '';
    squares = {};
    for (var r = 0; r < 8; r++) {
      for (var f = 0; f < 8; f++) {
        var file = flipped ? 7 - f : f;
        var rank = flipped ? r : 7 - r;           // row 0 is the top of the screen
        var name = FILES[file] + (rank + 1);
        var sq = document.createElement('div');
        sq.className = 'sq ' + ((file + rank) % 2 === 1 ? 'light' : 'dark');
        sq.dataset.sq = name;
        if (f === 0) { var rk = document.createElement('span'); rk.className = 'coord rank'; rk.textContent = rank + 1; sq.appendChild(rk); }
        if (r === 7) { var fl = document.createElement('span'); fl.className = 'coord file'; fl.textContent = FILES[file]; sq.appendChild(fl); }
        boardEl.appendChild(sq);
        squares[name] = sq;
      }
    }
    lastRenderedFen = null;
  }

  function placement(fen) {
    var rows = fen.split(' ')[0].split('/'), out = {};
    rows.forEach(function (row, i) {
      var file = 0;
      for (var k = 0; k < row.length; k++) {
        var ch = row[k];
        if (/\d/.test(ch)) { file += +ch; continue; }
        out[FILES[file] + (8 - i)] = (ch === ch.toUpperCase() ? 'w' : 'b') + ch.toUpperCase();
        file++;
      }
    });
    return out;
  }

  function renderBoard(pos, animate) {
    var pcs = placement(pos.fen);
    var prev = lastRenderedFen ? placement(lastRenderedFen) : {};
    Object.keys(squares).forEach(function (name) {
      var sq = squares[name], want = pcs[name] || null, have = sq.dataset.piece || null;
      sq.classList.toggle('hl', name === pos.from || name === pos.to);
      sq.classList.remove('check');
      if (want !== have) {
        var old = sq.querySelector('img'); if (old) old.remove();
        if (want) {
          var img = document.createElement('img');
          img.src = 'img/pieces/' + want + '.svg'; img.alt = ''; img.draggable = false;
          if (animate && name === pos.to && prev[name] !== want) img.className = 'arrived';
          sq.appendChild(img);
        }
        if (want) sq.dataset.piece = want; else delete sq.dataset.piece;
      }
    });
    if (pos.check) {                                   // highlight the king in check
      var side = pos.fen.split(' ')[1] === 'w' ? 'wK' : 'bK';
      Object.keys(pcs).forEach(function (n) { if (pcs[n] === side) squares[n].classList.add('check'); });
    }
    lastRenderedFen = pos.fen;
  }

  function setFlipped(v) {
    flipped = v;
    buildBoard();
    $('eval-bar').classList.toggle('flipped', flipped);
    updatePlayers();
    if (game) renderBoard(game.positions[ply], false); else renderBoard({ fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' }, false);
    drawArrow();
    if (lastResult) paintEvalBar(lastResult);
  }

  function drawArrow() {
    var svg = $('arrow-layer');
    svg.innerHTML = '';
    if (!lastBest || !$('arrow-check').checked) return;
    function c(name) {
      var f = FILES.indexOf(name[0]), r = +name[1] - 1;
      return { x: (flipped ? 7 - f : f) * 10 + 5, y: (flipped ? r : 7 - r) * 10 + 5 };
    }
    var a = c(lastBest.from), b = c(lastBest.to);
    var dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    if (!len) return;
    var ux = dx / len, uy = dy / len, head = 3.2, tipX = b.x - ux * 1.2, tipY = b.y - uy * 1.2;
    var bx = tipX - ux * head, by = tipY - uy * head;
    var px = -uy * 1.9, py = ux * 1.9;
    svg.innerHTML =
      '<line x1="' + a.x + '" y1="' + a.y + '" x2="' + bx + '" y2="' + by + '"/>' +
      '<polygon points="' + tipX + ',' + tipY + ' ' + (bx + px) + ',' + (by + py) + ' ' + (bx - px) + ',' + (by - py) + '"/>';
  }

  /* ------------------------------------------------------------------ game loading */
  function setSourceCollapsed(v) {
    var card = $('source-card'), btn = $('source-toggle');
    if (!card || !btn) return;
    card.classList.toggle('collapsed', !!v);
    btn.setAttribute('aria-expanded', String(!v));
    window.dispatchEvent(new Event('resize'));
  }
  function setStatus(msg, isErr) { var el = $('load-status'); el.textContent = msg || ''; el.classList.toggle('err', !!isErr); }

  function populateYears() {
    var sel = $('year-select'), y = new Date().getFullYear();
    for (var i = y; i >= 2015; i--) { var o = document.createElement('option'); o.value = o.textContent = i; sel.appendChild(o); }
  }

  async function fetchUserGames() {
    var platform = $('platform-select').value;
    var username = $('chess-username').value.trim();
    var year = $('year-select').value;
    var dropdown = $('game-dropdown');
    var site = platform === 'lichess' ? 'Lichess' : 'Chess.com';
    if (!username) { setStatus('Please enter a username.', true); return; }
    dropdown.innerHTML = '<option value="">Fetching games…</option>';
    setStatus('Fetching ' + year + ' games for ' + username + ' from ' + site + '…');
    $('load-btn').disabled = true;
    try {
      var games = [];
      if (platform === 'lichess') {
        var since = Date.UTC(+year, 0, 1), until = Date.UTC(+year, 11, 31, 23, 59, 59);
        var res = await fetch('https://lichess.org/api/games/user/' + encodeURIComponent(username) + '?since=' + since + '&until=' + until + '&max=200&pgnInJson=true&clocks=true&opening=true', { headers: { Accept: 'application/x-ndjson' } });
        if (res.status === 404) throw new Error('User “' + username + '” was not found on Lichess.');
        if (res.status === 429) throw new Error('Lichess is rate-limiting requests. Wait a minute, then try again.');
        if (!res.ok) throw new Error('Lichess returned HTTP ' + res.status + '.');
        games = (await res.text()).split('\n').filter(function (l) { return l.trim(); }).map(function (l) { return JSON.parse(l); });
      } else {
        var ar = await fetch('https://api.chess.com/pub/player/' + encodeURIComponent(username.toLowerCase()) + '/games/archives');
        if (ar.status === 404) throw new Error('User “' + username + '” was not found on Chess.com.');
        if (!ar.ok) throw new Error('Chess.com returned HTTP ' + ar.status + '.');
        var urls = ((await ar.json()).archives || []).filter(function (u) { return u.indexOf('/' + year + '/') >= 0; });
        for (var i = 0; i < urls.length; i++) {
          try { var r = await fetch(urls[i]); if (r.ok) games = games.concat(((await r.json()).games || []).map(function (g) { g.type = 'chesscom'; return g; })); }
          catch (e) { console.warn('Archive failed:', urls[i]); }
        }
        games.reverse();
      }
      if (!games.length) throw new Error('No ' + site + ' games found for ' + username + ' in ' + year + '.');
      loadedGames = games;
      populateDropdown(games, platform);
      setStatus(games.length + ' games loaded from ' + site + ' (' + year + ').');
    } catch (err) {
      console.error(err);
      loadedGames = [];
      dropdown.innerHTML = '<option value="">No games loaded</option>';
      setStatus(err instanceof TypeError ? 'Could not reach ' + site + '. Check your connection and try again.' : err.message, true);
    } finally { $('load-btn').disabled = false; }
  }

  function handlePgnUpload(ev) {
    var file = ev.target.files[0];
    if (!file) return;
    setStatus('Reading ' + file.name + '…');
    var reader = new FileReader();
    reader.onload = function (e) {
      try { parsePgnDatabase(String(e.target.result)); setStatus(loadedGames.length + ' games loaded from ' + file.name + '.'); }
      catch (err) { setStatus('Could not read this PGN file: ' + err.message, true); }
    };
    reader.onerror = function () { setStatus('Error reading the uploaded file.', true); };
    reader.readAsText(file);
  }

  function parsePgnDatabase(text) {
    var lines = text.replace(/^﻿/, '').split(/\r?\n/), chunks = [], cur = [], inMoves = false;
    lines.forEach(function (line) {
      var isTag = /^\s*\[\w+\s+".*"\]\s*$/.test(line);
      if (isTag && inMoves) { chunks.push(cur.join('\n')); cur = []; inMoves = false; }
      if (!isTag && line.trim() !== '') inMoves = true;
      cur.push(line);
    });
    chunks.push(cur.join('\n'));
    loadedGames = [];
    chunks.forEach(function (chunk) {
      if (chunk.trim().length < 10) return;
      var h = function (n) { var m = chunk.match(new RegExp('\\[' + n + '\\s+"([^"]*)"\\]')); return m ? m[1] : '?'; };
      loadedGames.push({ type: 'pgnfile', white: h('White'), black: h('Black'), date: h('Date'), event: h('Event'), result: h('Result'), pgn: chunk.trim() });
    });
    var dd = $('game-dropdown');
    if (!loadedGames.length) { dd.innerHTML = '<option value="">No games found in this file</option>'; throw new Error('no games found'); }
    var frag = document.createDocumentFragment();
    loadedGames.forEach(function (g, i) {
      var o = document.createElement('option'); o.value = i;
      o.textContent = (i + 1) + '. ' + g.white + ' vs ' + g.black + ' [' + g.result + '] — ' + g.event + ' (' + g.date + ')';
      frag.appendChild(o);
    });
    dd.innerHTML = ''; dd.appendChild(frag); dd.value = '0';
    setSourceCollapsed(true);
    loadSelectedGame();
  }

  function populateDropdown(games, platform) {
    var dd = $('game-dropdown'), com = platform === 'chesscom', frag = document.createDocumentFragment();
    games.forEach(function (g, i) {
      var w = (com ? g.white && g.white.username : g.players && g.players.white && g.players.white.user && g.players.white.user.name) || 'Anonymous';
      var b = (com ? g.black && g.black.username : g.players && g.players.black && g.players.black.user && g.players.black.user.name) || 'Anonymous';
      var sp = com ? g.time_class : g.speed;
      var opening = com ? '' : ' — ' + ((g.opening && g.opening.name) || 'Standard');
      var o = document.createElement('option'); o.value = i;
      o.textContent = (i + 1) + '. ' + (sp ? '[' + sp.toUpperCase() + '] ' : '') + w + ' vs ' + b + opening;
      frag.appendChild(o);
    });
    dd.innerHTML = ''; dd.appendChild(frag); dd.value = '0';
    setSourceCollapsed(true);
    loadSelectedGame();
  }

  function playerInfo(g) {
    if (g.type === 'pgnfile') return { white: g.white, black: g.black, wr: '', br: '', date: g.date || 'N/A', control: g.event || 'PGN', result: g.result, opening: '' };
    var com = g.type === 'chesscom';
    var nm = function (c) { return (com ? g[c] && g[c].username : g.players && g.players[c] && g.players[c].user && g.players[c].user.name) || 'Anonymous'; };
    var rt = function (c) { var r = com ? g[c] && g[c].rating : g.players && g.players[c] && g.players[c].rating; return r ? String(r) : ''; };
    var when = com ? (g.end_time ? new Date(g.end_time * 1000) : null) : (g.createdAt ? new Date(g.createdAt) : null);
    var res = com ? (g.white && g.white.result === 'win' ? '1-0' : g.black && g.black.result === 'win' ? '0-1' : '½-½')
      : (g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : (g.status && g.status !== 'started' ? '½-½' : '*'));
    return {
      white: nm('white'), black: nm('black'), wr: rt('white'), br: rt('black'),
      date: when ? when.toISOString().slice(0, 10) + ' ' + when.toTimeString().slice(0, 5) : 'N/A',
      control: (com ? (g.time_class || 'standard') : (g.speed || 'standard')).toUpperCase(),
      result: res, opening: com ? '' : ((g.opening && g.opening.name) || '')
    };
  }

  // Time per move from [%clk] comments: previous own clock + increment − current own clock
  function parseMoveTimings(pgn) {
    var tc = pgn.match(/\[TimeControl "(\d+)(?:\+(\d+))?"\]/);
    var base = tc ? parseInt(tc[1], 10) : null, inc = tc && tc[2] ? parseInt(tc[2], 10) : 0;
    var clocks = [], re = /\[%clk\s+(\d+):(\d+):([\d.]+)\]/g, m;
    while ((m = re.exec(pgn)) !== null) clocks.push(+m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]));
    var prev = [base, base];
    return clocks.map(function (t, i) {
      var p = prev[i % 2]; prev[i % 2] = t;
      if (p === null) return null;
      return (i < 2 && t >= p) ? 0 : Math.max(0, p + inc - t);
    });
  }

  function loadSelectedGame() {
    var idx = $('game-dropdown').value;
    if (idx === '' || !loadedGames[idx]) return;
    var g = loadedGames[idx], info = playerInfo(g), pgn = g.pgn;
    var meta = $('game-meta');

    var parser = new Chess();
    if (!pgn || !parser.load_pgn(pgn)) {
      meta.innerHTML = '<div class="gm-err">Could not read the moves of this game (invalid or unsupported PGN).</div>';
      return;
    }
    var hdr = parser.header(), startFen = hdr.FEN || undefined;
    var verbose = parser.history({ verbose: true });
    var walker = startFen ? new Chess(startFen) : new Chess();
    var positions = [{ fen: walker.fen(), from: null, to: null, check: walker.in_check(), terminal: terminalOf(walker) }];
    var sans = [];
    verbose.forEach(function (mv) {
      walker.move({ from: mv.from, to: mv.to, promotion: mv.promotion });
      sans.push(mv.san);
      positions.push({ fen: walker.fen(), from: mv.from, to: mv.to, check: walker.in_check(), terminal: terminalOf(walker) });
    });

    var user = ($('chess-username').value || '').trim().toLowerCase();
    game = { positions: positions, moves: sans, timings: parseMoveTimings(pgn), info: info };
    ply = 0;

    meta.innerHTML =
      '<div class="gm-players"><span><span>White</span> ' + esc(info.white) + (info.wr ? ' <span>(' + esc(info.wr) + ')</span>' : '') + '</span>' +
      '<span><span>Black</span> ' + esc(info.black) + (info.br ? ' <span>(' + esc(info.br) + ')</span>' : '') + '</span></div>' +
      '<div class="gm-sub"><span>' + esc(info.date) + ' · ' + esc(info.result) + '</span><span>' + esc(info.control) + (info.opening ? ' · ' + esc(info.opening) : '') + '</span></div>';
    $('total-moves-badge').textContent = Math.ceil(sans.length / 2) + ' moves';

    // put the user's own pieces at the bottom
    var wantFlip = g.type !== 'pgnfile' && user && info.black.toLowerCase() === user && info.white.toLowerCase() !== user;
    flipped = wantFlip; buildBoard(); $('eval-bar').classList.toggle('flipped', flipped);
    updatePlayers();
    renderMoves();
    showPly(0, false);
  }

  function terminalOf(c) {
    if (c.in_checkmate()) return { type: 'mate', winner: c.turn() === 'w' ? 'b' : 'w' };
    if (c.in_stalemate() || c.insufficient_material()) return { type: 'draw' };
    return null;
  }

  function updatePlayers() {
    var w = game ? game.info.white : 'White', b = game ? game.info.black : 'Black';
    var wr = game ? game.info.wr : '', br = game ? game.info.br : '';
    var top = flipped ? ['white', w, wr] : ['black', b, br], bot = flipped ? ['black', b, br] : ['white', w, wr];
    [['player-top', top], ['player-bottom', bot]].forEach(function (p) {
      var el = $(p[0]); el.querySelector('.pdot').className = 'pdot ' + p[1][0];
      el.querySelector('.pname').textContent = p[1][1]; el.querySelector('.prating').textContent = p[1][2] ? '(' + p[1][2] + ')' : '';
    });
  }

  /* ------------------------------------------------------------------ moves list */
  function fmtTime(s) { return s < 60 ? s.toFixed(1) + 's' : Math.floor(s / 60) + 'm ' + String(Math.floor(s % 60)).padStart(2, '0') + 's'; }
  function timeChip(s) {
    if (s == null) return '';
    return '<span class="tchip ' + (s <= 5 ? 't-fast' : s <= 30 ? 't-mid' : 't-slow') + '" title="Time spent on this move">' + fmtTime(s) + '</span>';
  }
  function renderMoves() {
    var list = $('moves-list'), m = game.moves, t = game.timings;
    var cell = function (i) {
      if (i >= m.length) return '<div></div>';
      return '<div class="mv-cell" data-ply="' + (i + 1) + '"><span>' + esc(m[i]) + '</span>' + timeChip(t[i]) + '</div>';
    };
    var html = '';
    for (var i = 0; i < m.length; i += 2) html += '<div class="mrow"><span class="mnum">' + (i / 2 + 1) + '.</span>' + cell(i) + cell(i + 1) + '</div>';
    list.innerHTML = html || '<span class="muted pad">No moves in this game.</span>';
  }
  $('moves-list').addEventListener('click', function (e) {
    var c = e.target.closest('.mv-cell'); if (c) showPly(+c.dataset.ply, false);
  });

  function highlightPly() {
    var list = $('moves-list'), old = list.querySelector('.mv-active');
    if (old) old.classList.remove('mv-active');
    var act = list.querySelector('[data-ply="' + ply + '"]');
    if (act) {
      act.classList.add('mv-active');
      var top = act.offsetTop - list.clientHeight / 2 + act.clientHeight / 2;
      list.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    } else if (ply === 0) list.scrollTo({ top: 0, behavior: 'smooth' });
    var n = game ? game.moves.length : 0;
    [['nav-first', ply === 0], ['nav-prev', ply === 0], ['nav-next', ply >= n], ['nav-last', ply >= n]].forEach(function (p) { $(p[0]).disabled = !game || p[1]; });
  }

  /* ------------------------------------------------------------------ navigation */
  function showPly(n, fromNav) {
    if (!game) return;
    var prev = ply;
    ply = Math.max(0, Math.min(game.moves.length, n));
    renderBoard(game.positions[ply], Math.abs(ply - prev) === 1);
    highlightPly();
    requestEval();
  }
  function first() { showPly(0); } function prevMove() { showPly(ply - 1); }
  function nextMove() { showPly(ply + 1); } function last() { if (game) showPly(game.moves.length); }

  /* ------------------------------------------------------------------ evaluation UI */
  var debounce = null;
  function requestEval() {
    clearTimeout(debounce);
    var pos = game.positions[ply];
    lastBest = null; drawArrow();
    debounce = setTimeout(function () {
      var token = ++evalToken;
      if (pos.terminal) { showTerminal(pos); return; }
      evalSvc.setMode($('engine-select').value);
      evalSvc.evaluate(pos.fen, function (res, info) {
        if (token !== evalToken) return;
        onEval(pos.fen, res, info);
      });
    }, 160);
    // immediate visual feedback while debouncing
    setChip('Analysing…', true);
  }

  function showTerminal(pos) {
    var t = pos.terminal, res = t.type === 'mate' ? { cp: null, mate: 0, winner: t.winner, final: true } : { cp: 0, mate: null, final: true };
    lastResult = res; paintEvalBar(res);
    $('eval-score').textContent = t.type === 'mate' ? (t.winner === 'w' ? '1–0' : '0–1') : '½–½';
    $('engine-best-move').textContent = t.type === 'mate' ? 'Checkmate' : 'Draw';
    $('engine-pv').textContent = t.type === 'mate' ? 'The game ends here.' : 'Stalemate or insufficient material.';
    $('eval-depth').textContent = '';
    setChip('Final position', false); setNote('');
    lastBest = null; drawArrow();
  }

  function scoreText(r) {
    if (r.mate != null) return r.mate === 0 ? (r.winner === 'w' ? '1–0' : '0–1') : (r.mate > 0 ? '+' : '−') + 'M' + Math.abs(r.mate);
    var v = r.cp / 100;
    return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2);
  }
  function barPercent(r) {
    if (r.mate != null) return r.mate === 0 ? (r.winner === 'w' ? 100 : 0) : (r.mate > 0 ? 100 : 0);
    return Math.max(2, Math.min(98, 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * r.cp)) - 1)));
  }
  function paintEvalBar(r) {
    var pct = barPercent(r);                       // White's share
    $('eval-fill').style.height = pct + '%';
    var short = r.mate != null ? (r.mate === 0 ? '' : 'M' + Math.abs(r.mate)) : Math.abs(r.cp / 100).toFixed(1);
    var whiteAhead = pct >= 50;
    var top = $('eval-top'), bot = $('eval-bottom');
    top.textContent = bot.textContent = '';
    // the label sits at the end of the side that is ahead; text colour follows the fill beneath it
    var whiteAtBottom = !flipped;
    var target = (whiteAhead === whiteAtBottom) ? bot : top;
    target.textContent = short;
    target.className = 'evalnum ' + (target === top ? 'top ' : 'bottom ') + (whiteAhead ? 'on-light' : 'on-dark');
    (target === top ? bot : top).className = 'evalnum ' + (target === top ? 'bottom' : 'top');
  }

  function setChip(text, busy, err) {
    var c = $('eval-source'); c.textContent = text;
    c.className = 'chip' + (busy ? ' busy' : '') + (err ? ' err' : '');
  }
  function setNote(text, err) { var n = $('engine-note'); n.textContent = text || ''; n.classList.toggle('err', !!err); }

  function onEngineStatus(state, msg) {
    if (state === 'loading') setNote('Loading Stockfish (≈1.8 MB, once)…');
    else if (state === 'ready') setNote('');
    else if (state === 'failed') setNote('Local Stockfish could not start: ' + msg, true);
  }

  // Convert UCI moves to SAN with move numbers, from a given FEN
  function uciLine(fen, moves, maxPlies) {
    var out = [], g = new Chess(fen), p = fen.split(' '), n = +p[5] || 1, white = p[1] === 'w', first = null, text = '';
    for (var i = 0; i < Math.min(moves.length, maxPlies); i++) {
      var t = moves[i]; if (!UCI_RE.test(t)) break;
      var mv = g.move({ from: t.slice(0, 2), to: t.slice(2, 4), promotion: t[4] });
      if (!mv) break;
      if (first === null) first = { san: mv.san, from: mv.from, to: mv.to };
      if (white) text += n + '. '; else if (i === 0) text += n + '… ';
      text += mv.san + ' ';
      if (!white) n++;
      white = !white;
    }
    return first ? { first: first, text: text.trim() } : null;
  }

  function onEval(fen, res, info) {
    if (info.state === 'error') {
      lastResult = null;
      $('eval-score').textContent = '—'; $('eval-depth').textContent = '';
      $('engine-best-move').textContent = '—'; $('engine-pv').textContent = '—';
      $('eval-fill').style.height = '50%'; $('eval-top').textContent = $('eval-bottom').textContent = '';
      setChip('Unavailable', false, true); setNote(info.note, true); lastBest = null; drawArrow();
      return;
    }
    if (!res) { setChip('Analysing…', true); if (info.note) setNote(info.note); return; }
    lastResult = res;
    $('eval-score').textContent = scoreText(res);
    paintEvalBar(res);
    var line = uciLine(fen, res.pv || [], 14);
    $('engine-best-move').textContent = line ? line.first.san : '—';
    $('engine-pv').textContent = line ? line.text : '—';
    lastBest = line ? { from: line.first.from, to: line.first.to } : null; drawArrow();
    var name = res.source === 'cloud' ? 'Lichess cloud' : 'Stockfish 19';
    setChip(name, !res.final);
    $('eval-depth').textContent = res.depth ? 'depth ' + res.depth : '';
    setNote(info.note || (res.final ? '' : 'Thinking…'));
  }

  /* ------------------------------------------------------------------ wire up */
  document.addEventListener('DOMContentLoaded', init);
  if (document.readyState !== 'loading') init();
  var started = false;
  function init() {
    if (started) return; started = true;
    populateYears();
    buildBoard();
    renderBoard({ fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' }, false);
    $('load-btn').addEventListener('click', fetchUserGames);
    $('chess-username').addEventListener('keydown', function (e) { if (e.key === 'Enter') fetchUserGames(); });
    $('pgn-file-input').addEventListener('change', handlePgnUpload);
    $('game-dropdown').addEventListener('change', loadSelectedGame);
    $('engine-select').addEventListener('change', function () { if (game) requestEval(); });
    $('arrow-check').addEventListener('change', drawArrow);
    $('nav-first').addEventListener('click', first); $('nav-prev').addEventListener('click', prevMove);
    $('nav-next').addEventListener('click', nextMove); $('nav-last').addEventListener('click', last);
    $('source-toggle').addEventListener('click', function () { setSourceCollapsed(!$('source-card').classList.contains('collapsed')); });
    $('flip-btn').addEventListener('click', function () { setFlipped(!flipped); });
    ['nav-first', 'nav-prev', 'nav-next', 'nav-last'].forEach(function (id) { $(id).disabled = true; });
    document.addEventListener('keydown', function (e) {
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
      var k = { ArrowLeft: prevMove, ArrowRight: nextMove, Home: first, End: last, f: function () { setFlipped(!flipped); }, F: function () { setFlipped(!flipped); } }[e.key];
      if (k) { e.preventDefault(); k(); }
    });
    window.chessPage = { loadPgn: parsePgnDatabase, showPly: showPly };   // handy for debugging in the console
    fetchUserGames();
  }
})();
