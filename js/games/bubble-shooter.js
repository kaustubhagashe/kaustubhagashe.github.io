// Bubble Shooter: aim, shoot, match three or more; bubbles left hanging fall.
(function () {
  var G = window.Games, R = 18, D = 36, ROWH = D * 0.866, W = 11 * D, H = 520, MAXROW = 12, SPEED = 640;
  var COLORS = ['#e5484d', '#2f9e44', '#3b82f6', '#f2b632', '#9b5de5', '#ff8a4c'], SHX = W / 2, SHY = H - 46;

  function Board() {
    this.shift = 0; this.rows = [];
  }
  Board.prototype.odd = function (r) { return ((r + this.shift) & 1) === 1; };
  Board.prototype.cols = function (r) { return this.odd(r) ? 10 : 11; };
  Board.prototype.x = function (r, c) { return R + (this.odd(r) ? R : 0) + c * D; };
  Board.prototype.y = function (r) { return R + r * ROWH; };
  Board.prototype.valid = function (r, c) { return r >= 0 && r < MAXROW + 3 && c >= 0 && c < this.cols(r); };
  Board.prototype.get = function (r, c) { return this.valid(r, c) && this.rows[r] ? this.rows[r][c] || 0 : 0; };
  Board.prototype.set = function (r, c, v) { while (this.rows.length <= r) this.rows.push([]); this.rows[r][c] = v; };
  Board.prototype.neighbors = function (r, c) {
    var o = this.odd(r), list = [[r, c - 1], [r, c + 1]];
    if (!o) list.push([r - 1, c - 1], [r - 1, c], [r + 1, c - 1], [r + 1, c]); else list.push([r - 1, c], [r - 1, c + 1], [r + 1, c], [r + 1, c + 1]);
    var self = this; return list.filter(function (p) { return self.valid(p[0], p[1]); });
  };
  Board.prototype.fill = function (nrows, ncolors) {
    this.rows = []; this.shift = 0;
    for (var r = 0; r < nrows; r++) { this.rows.push([]); for (var c = 0; c < this.cols(r); c++) { var col = Math.floor(Math.random() * ncolors) + 1; if (c > 0 && Math.random() < .45) col = this.rows[r][c - 1]; this.rows[r][c] = col; } }
  };
  Board.prototype.addTopRow = function (ncolors) {
    this.shift ^= 1; var row = []; this.rows.unshift(row);
    for (var c = 0; c < this.cols(0); c++) row[c] = Math.floor(Math.random() * ncolors) + 1;
  };
  Board.prototype.cluster = function (r, c) {
    var col = this.get(r, c), seen = {}, out = [], stack = [[r, c]], self = this; if (!col) return out;
    while (stack.length) { var p = stack.pop(), k = p[0] + ',' + p[1]; if (seen[k]) continue; seen[k] = 1; if (self.get(p[0], p[1]) !== col) continue; out.push(p); self.neighbors(p[0], p[1]).forEach(function (q) { stack.push(q); }); }
    return out;
  };
  Board.prototype.floating = function () {
    var seen = {}, stack = [], self = this, c;
    for (c = 0; c < this.cols(0); c++) if (this.get(0, c)) stack.push([0, c]);
    while (stack.length) { var p = stack.pop(), k = p[0] + ',' + p[1]; if (seen[k]) continue; seen[k] = 1; self.neighbors(p[0], p[1]).forEach(function (q) { if (self.get(q[0], q[1]) && !seen[q[0] + ',' + q[1]]) stack.push(q); }); }
    var out = []; this.rows.forEach(function (row, r) { for (var i = 0; i < row.length; i++) if (row[i] && !seen[r + ',' + i]) out.push([r, i]); }); return out;
  };
  Board.prototype.colorsPresent = function () { var s = {}; this.rows.forEach(function (row) { row.forEach(function (v) { if (v) s[v] = 1; }); }); return Object.keys(s).map(Number); };
  Board.prototype.count = function () { var n = 0; this.rows.forEach(function (row) { row.forEach(function (v) { if (v) n++; }); }); return n; };
  Board.prototype.lowestRow = function () { for (var r = this.rows.length - 1; r >= 0; r--) if (this.rows[r].some(Boolean)) return r; return -1; };
  Board.prototype.snap = function (x, y) {
    var r0 = Math.max(0, Math.round((y - R) / ROWH)), best = null, bd = 1e9, self = this;
    for (var r = Math.max(0, r0 - 1); r <= r0 + 1; r++) for (var c = 0; c < this.cols(r); c++) {
      if (this.get(r, c)) continue; var dx = this.x(r, c) - x, dy = this.y(r) - y, d = dx * dx + dy * dy;
      var attached = r === 0 || this.neighbors(r, c).some(function (q) { return self.get(q[0], q[1]); });
      if (attached && d < bd) { bd = d; best = [r, c]; }
    }
    return best;
  };
  G.logic.bubble = { Board: Board };

  G.register('bubble-shooter', {
    init: function (host) {
      host.innerHTML =
        '<div class="bs-wrap"><div class="bs-main">' +
        '<div class="bb-stats"><div><span>Score</span><b data-s="score">0</b></div><div><span>Best</span><b data-s="best">0</b></div><div><span>Level</span><b data-s="level">1</b></div>' +
        '<button class="btn" data-k="pause" type="button">Pause</button><button class="btn" data-k="new" type="button">New game</button></div>' +
        '<div class="bs-stage"><canvas class="bs-canvas" tabindex="0" aria-label="Bubble Shooter. Move the pointer to aim, click or press Space to shoot, S to swap."></canvas><div class="bs-overlay" hidden><div><h3></h3><p></p><button class="btn btn-primary" data-k="go" type="button">Play</button></div></div></div></div>' +
        '<aside class="gm-side"><div class="gm-msg" role="status" aria-live="polite">Aim and shoot!</div>' +
        '<p class="bs-drop" aria-live="off"><span>Ceiling drops in</span> <b data-s="drop">6</b> <span>misses</span></p>' +
        '<p class="pz-note"><strong>Controls.</strong> Move the mouse (or drag on a touch screen) to aim, click or lift your finger to shoot. Press <kbd>S</kbd>, <kbd>Space</kbd> on the small bubble, or click it to swap the shooter bubble. Keyboard: ← → to aim, Space to shoot.</p>' +
        '<p class="pz-note">Match three or more of one colour. Bubbles no longer attached to the ceiling fall and score extra. Every few misses a new row drops; do not let the bubbles reach the red line.</p></aside></div>';
      var cv = host.querySelector('canvas'), ctx = cv.getContext('2d'), ov = host.querySelector('.bs-overlay'), msg = host.querySelector('.gm-msg');
      var dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1)); cv.width = W * dpr; cv.height = H * dpr; ctx.scale(dpr, dpr);
      var B = new Board(), level = 1, score = 0, best = G.store('bs-best') || 0, misses = 0, dropEvery = 6, ncol = 4;
      var cur, next, shot = null, angle = -Math.PI / 2, falling = [], pops = [], state = 'play', running = false, last = 0, raf = 0, paused = false, shake = 0;
      function S(k, v) { host.querySelector('[data-s=' + k + ']').textContent = v; }
      function randColor() { var p = B.colorsPresent(); return p.length ? p[Math.floor(Math.random() * p.length)] : 1; }
      function newLevel(l) { level = l; ncol = Math.min(3 + Math.ceil(l / 2), 6); dropEvery = Math.max(3, 7 - Math.floor((l - 1) / 2)); B.fill(Math.min(4 + l, 8), ncol); misses = 0; cur = randColor(); next = randColor(); shot = null; falling = []; pops = []; S('level', l); S('drop', dropEvery - misses); }
      function newGame() { score = 0; S('score', 0); S('best', best); state = 'play'; ov.hidden = true; paused = false; host.querySelector('[data-k=pause]').textContent = 'Pause'; newLevel(1); msg.textContent = 'Aim and shoot!'; }
      function overlay(t, p, b) { ov.querySelector('h3').textContent = t; ov.querySelector('p').textContent = p; ov.querySelector('[data-k=go]').textContent = b; ov.hidden = false; }

      // ---- aiming
      function aimAt(e) { var r = cv.getBoundingClientRect(), x = (e.clientX - r.left) * W / r.width, y = (e.clientY - r.top) * H / r.height; var a = Math.atan2(y - SHY, x - SHX); angle = Math.min(-0.14, Math.max(-Math.PI + 0.14, a > 0 ? (x < SHX ? -Math.PI + 0.14 : -0.14) : a)); }
      cv.addEventListener('pointermove', function (e) { aimAt(e); });
      cv.addEventListener('pointerdown', function (e) { aimAt(e); var r = cv.getBoundingClientRect(), x = (e.clientX - r.left) * W / r.width, y = (e.clientY - r.top) * H / r.height; if (Math.hypot(x - (SHX - 70), y - (SHY + 8)) < 26) { swap(); e.preventDefault(); return; } cv.setPointerCapture && cv.setPointerCapture(e.pointerId); cv._down = true; });
      cv.addEventListener('pointerup', function (e) { if (cv._down) { cv._down = false; aimAt(e); fire(); } });
      cv.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowLeft') { angle = Math.max(-Math.PI + 0.14, angle - 0.05); e.preventDefault(); } else if (e.key === 'ArrowRight') { angle = Math.min(-0.14, angle + 0.05); e.preventDefault(); }
        else if (e.key === ' ' || e.key === 'Enter') { fire(); e.preventDefault(); } else if (e.key === 's' || e.key === 'S') swap();
      });
      function swap() { if (shot || state !== 'play') return; var t = cur; cur = next; next = t; }
      function fire() { if (shot || state !== 'play' || paused) return; shot = { x: SHX, y: SHY, vx: Math.cos(angle) * SPEED, vy: Math.sin(angle) * SPEED, color: cur }; }

      // ---- game steps
      function land() {
        var cell = B.snap(shot.x, shot.y); if (!cell) cell = [0, 0];
        B.set(cell[0], cell[1], shot.color); var col = shot.color; shot = null;
        var group = B.cluster(cell[0], cell[1]), gain = 0;
        if (group.length >= 3) {
          group.forEach(function (p) { pops.push({ x: B.x(p[0], p[1]), y: B.y(p[0]), c: col, t: 0 }); B.set(p[0], p[1], 0); });
          gain += group.length * 10;
          var fl = B.floating(); fl.forEach(function (p) { falling.push({ x: B.x(p[0], p[1]), y: B.y(p[0]), vy: -60 - Math.random() * 60, vx: (Math.random() - .5) * 120, c: B.get(p[0], p[1]) }); B.set(p[0], p[1], 0); });
          gain += fl.length * 20; misses = 0; shake = 0;
          msg.textContent = fl.length ? 'Pop! ' + fl.length + ' bubbles fell.' : 'Pop!';
        } else {
          misses++; if (misses >= dropEvery) { misses = 0; B.addTopRow(ncol); msg.textContent = 'The ceiling dropped a row!'; shake = .3; } else msg.textContent = 'Aim and shoot!';
        }
        if (gain) { score += gain; if (score > best) { best = score; G.store('bs-best', best); } S('score', score); S('best', best); }
        S('drop', dropEvery - misses);
        if (B.lowestRow() >= MAXROW) { state = 'lost'; overlay('Game over', 'Score ' + score + (score >= best && score > 0 ? ' · a new best!' : ''), 'Play again'); return; }
        if (B.count() === 0) { state = 'won'; score += 200; S('score', score); overlay('Level ' + level + ' cleared!', 'Bonus 200 points. Next level has more colours and faster drops.', 'Next level'); return; }
        cur = next; next = randColor(); if (B.colorsPresent().indexOf(cur) < 0) cur = randColor();
      }
      function stepShot(dt) {
        var dist = SPEED * dt, steps = Math.max(1, Math.ceil(dist / 4)), sx = shot.vx * dt / steps, sy = shot.vy * dt / steps;
        for (var i = 0; i < steps; i++) {
          shot.x += sx; shot.y += sy;
          if (shot.x < R) { shot.x = R; shot.vx = -shot.vx; sx = -sx; } else if (shot.x > W - R) { shot.x = W - R; shot.vx = -shot.vx; sx = -sx; }
          if (shot.y <= R) { shot.y = R; return land(); }
          if (hits(shot.x, shot.y)) return land();
        }
      }
      function hits(x, y) {
        var r0 = Math.round((y - R) / ROWH);
        for (var r = Math.max(0, r0 - 2); r <= r0 + 2; r++) { var row = B.rows[r]; if (!row) continue; for (var c = 0; c < row.length; c++) if (row[c]) { var dx = B.x(r, c) - x, dy = B.y(r) - y; if (dx * dx + dy * dy < (D * .88) * (D * .88)) return true; } }
        return false;
      }
      function update(dt) {
        if (state === 'play' && shot) stepShot(dt);
        falling.forEach(function (f) { f.vy += 1500 * dt; f.y += f.vy * dt; f.x += f.vx * dt; }); falling = falling.filter(function (f) { return f.y < H + 40; });
        pops.forEach(function (p) { p.t += dt * 3.2; }); pops = pops.filter(function (p) { return p.t < 1; });
        if (shake > 0) shake = Math.max(0, shake - dt);
      }

      // ---- drawing
      function bubble(x, y, ci, a) {
        var g = ctx.createRadialGradient(x - R * .35, y - R * .4, R * .1, x, y, R); g.addColorStop(0, '#ffffffcc'); g.addColorStop(.25, COLORS[ci - 1]); g.addColorStop(1, shade(COLORS[ci - 1]));
        ctx.globalAlpha = a == null ? 1 : a; ctx.beginPath(); ctx.arc(x, y, R - 1, 0, 7); ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.stroke(); ctx.globalAlpha = 1;
      }
      function shade(hex) { var n = parseInt(hex.slice(1), 16), r = n >> 16, g = n >> 8 & 255, b = n & 255; return 'rgb(' + (r * .62 | 0) + ',' + (g * .62 | 0) + ',' + (b * .62 | 0) + ')'; }
      function guide() {
        var x = SHX, y = SHY, vx = Math.cos(angle) * 6, vy = Math.sin(angle) * 6, n = 0;
        ctx.fillStyle = 'rgba(255,255,255,.55)';
        for (var i = 0; i < 260; i++) { x += vx; y += vy; if (x < R || x > W - R) { vx = -vx; x = Math.max(R, Math.min(W - R, x)); } if (y <= R || hits(x, y)) break; if (i % 5 === 0 && i > 6) { ctx.beginPath(); ctx.arc(x, y, 2.2, 0, 7); ctx.fill(); } }
      }
      function draw() {
        var css = getComputedStyle(cv), dark = !document.documentElement.getAttribute('data-theme') || document.documentElement.getAttribute('data-theme') !== 'bright';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
        var bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, dark ? '#1b2540' : '#dfe9ff'); bg.addColorStop(1, dark ? '#0f1424' : '#c3d3f5'); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
        if (shake > 0) ctx.translate(0, Math.sin(shake * 60) * 3);
        B.rows.forEach(function (row, r) { for (var c = 0; c < row.length; c++) if (row[c]) bubble(B.x(r, c), B.y(r), row[c]); });
        falling.forEach(function (f) { bubble(f.x, f.y, f.c); });
        pops.forEach(function (p) { ctx.globalAlpha = 1 - p.t; ctx.strokeStyle = COLORS[p.c - 1]; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, R * (1 + p.t * 1.1), 0, 7); ctx.stroke(); ctx.globalAlpha = 1; });
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        var ly = B.y(MAXROW - 1) + R + 6; ctx.strokeStyle = 'rgba(229,72,77,.8)'; ctx.setLineDash([8, 6]); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(W, ly); ctx.stroke(); ctx.setLineDash([]);
        if (state === 'play' && !shot) guide();
        // cannon
        ctx.save(); ctx.translate(SHX, SHY); ctx.rotate(angle + Math.PI / 2); ctx.fillStyle = dark ? '#5a6585' : '#6b7ba8'; ctx.fillRect(-7, -44, 14, 44); ctx.restore();
        ctx.beginPath(); ctx.arc(SHX, SHY, 22, 0, 7); ctx.fillStyle = dark ? '#39425f' : '#8795bd'; ctx.fill();
        if (shot) bubble(shot.x, shot.y, shot.color); else if (state === 'play') bubble(SHX, SHY, cur);
        ctx.fillStyle = dark ? '#aab3cf' : '#445'; ctx.font = '600 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('NEXT · tap to swap', SHX - 70, SHY - 22); bubble(SHX - 70, SHY + 8, next, .95);
      }
      function frame(t) {
        if (!running) return; var dt = Math.min(.04, (t - last) / 1000 || 0); last = t;
        if (!paused) update(dt); draw(); raf = requestAnimationFrame(frame);
      }
      host.querySelector('[data-k=new]').addEventListener('click', newGame);
      host.querySelector('[data-k=pause]').addEventListener('click', function () { if (state !== 'play') return; paused = !paused; this.textContent = paused ? 'Resume' : 'Pause'; msg.textContent = paused ? 'Paused.' : 'Aim and shoot!'; });
      ov.querySelector('[data-k=go]').addEventListener('click', function () { if (state === 'won') { state = 'play'; ov.hidden = true; newLevel(level + 1); msg.textContent = 'Level ' + level + '. Aim and shoot!'; } else newGame(); });
      this.show = function () { if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame); };
      this.hide = function () { running = false; cancelAnimationFrame(raf); if (state === 'play' && !paused) { paused = true; host.querySelector('[data-k=pause]').textContent = 'Resume'; } };
      newGame();
    }
  });
  // register() stores the def object; show/hide are attached to it by init via `this`
})();
