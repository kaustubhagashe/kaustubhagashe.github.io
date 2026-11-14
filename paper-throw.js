// Paper Throw: aim at the bin, release to toss the crumpled paper. A table fan blows against you in gusts.
(function () {
  var G = window.Games, W = 800, H = 440, FLOOR = 404, R = 10, GRAV = 980, WINDK = 28, PER_ROUND = 10;
  var SHOULDER = { x: 74, y: 312 }, ARM = 36, FULL = 240, MAXV = 880;           // FULL: pointer distance (px) that gives full power

  // ---------- physics (pure, so it can be tested) ----------
  function halfWidth(bin, y) { var f = Math.max(0, Math.min(1, (y - bin.top) / (FLOOR - bin.top))); return bin.w / 2 + (bin.bw / 2 - bin.w / 2) * f; }
  function circle(b, px, py, pr) {
    var dx = b.x - px, dy = b.y - py, d = Math.hypot(dx, dy), min = R + pr; if (d >= min || d === 0) return;
    var nx = dx / d, ny = dy / d, vn = b.vx * nx + b.vy * ny; b.x = px + nx * min; b.y = py + ny * min;
    if (vn < 0) { b.vx -= 1.5 * vn * nx; b.vy -= 1.5 * vn * ny; } b.rim = true;
  }
  function step(b, bin, ax, dt) {                    // returns 'score' on the step the paper drops into the bin
    var py = b.y, ev = null;
    b.vx += ax * dt - b.vx * .05 * dt; b.vy += GRAV * dt - b.vy * .03 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.rot += b.spin * dt; b.t += dt;
    if (!b.scored) { circle(b, bin.x - bin.w / 2, bin.top, 4); circle(b, bin.x + bin.w / 2, bin.top, 4); }
    if (!b.scored && py < bin.top && b.y >= bin.top && b.vy > 0 && Math.abs(b.x - bin.x) < bin.w / 2 - 2) { b.scored = true; ev = 'score'; }
    if (b.y > bin.top) {
      var hw = halfWidth(bin, b.y), rel = b.x - bin.x, s = rel < 0 ? -1 : 1;
      if (b.scored) { if (Math.abs(rel) > hw - R) { b.x = bin.x + s * (hw - R); if (b.vx * s > 0) b.vx *= -.3; } }
      else if (Math.abs(rel) < hw + R) { b.x = bin.x + s * (hw + R); if (b.vx * s < 0) b.vx *= -.35; b.rim = true; }
    }
    if (b.y > FLOOR - R) { b.y = FLOOR - R; if (Math.abs(b.vy) > 90) { b.vy *= -.3; b.vx *= .7; } else { b.vy = 0; b.vx *= .88; b.spin *= .85; b.rest += dt; } }
    return ev;
  }
  function launch(u, speed, bin) { return { x: SHOULDER.x + u.x * ARM, y: SHOULDER.y + u.y * ARM, vx: u.x * speed, vy: u.y * speed, rot: 0, spin: 8 + Math.random() * 4, rim: false, scored: false, rest: 0, t: 0, done: false }; }
  G.logic.paper = { step: step, launch: launch, FLOOR: FLOOR, FULL: FULL, MAXV: MAXV };

  G.register('paper-throw', {
    init: function (host) {
      host.innerHTML =
        '<div class="pt-wrap"><div class="pt-main">' +
        '<div class="bb-stats"><div><span>Score</span><b data-s="score">0</b></div><div><span>Best</span><b data-s="best">0</b></div><div><span>Papers left</span><b data-s="left">10</b></div><div><span>Level</span><b data-s="level">1</b></div><button class="btn" data-k="new" type="button">New game</button></div>' +
        '<div class="pt-stage"><canvas class="pt-canvas" tabindex="0" aria-label="Paper Throw. Press, point at the bin and release to throw."></canvas>' +
        '<div class="bs-overlay" hidden><div><h3>Round over</h3><p></p><button class="btn btn-primary" data-k="again" type="button">Play again</button></div></div></div></div>' +
        '<aside class="gm-side"><div class="gm-msg" role="status" aria-live="polite">Press, point at the bin, then let go.</div>' +
        '<dl class="gm-score"><div><dt>Baskets</dt><dd data-s="made">0</dd></div><div><dt>Streak</dt><dd data-s="streak">0</dd></div></dl>' +
        '<p class="pz-note"><strong>How to play.</strong> Press on the game, then move the pointer: the arm follows it and the dotted line shows where the paper will go. The <em>farther</em> the pointer is from the hand, the harder the throw (see the power bar). Let go to throw. The table fan blows against you in gusts, and the dotted line already includes the wind of this moment, so wait for a calmer moment or aim a little higher. A clean swish scores extra and streaks add a bonus. Every three baskets the bin moves back and the fan blows harder.</p></aside></div>';
      var cv = host.querySelector('canvas'), ctx = cv.getContext('2d'), ov = host.querySelector('.bs-overlay'), msg = host.querySelector('.gm-msg');
      var dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1)); cv.width = W * dpr; cv.height = H * dpr;
      var score, best = G.store('pt-best') || 0, left, level, made, streak, t = 0, fanAngle = 0, ball = null, aim = null, flash = null, running = false, last = 0, raf = 0, thrown = false;
      var bin = { x: 520, top: 330, w: 92, bw: 66 }, idle = { x: Math.cos(-.6), y: Math.sin(-.6) };
      function S(k, v) { host.querySelector('[data-s=' + k + ']').textContent = v; }
      function windMax() { return 1.5 + Math.min(level - 1, 9) * .5; }                  // 0..~6
      function wind() { var s = .5 + .4 * Math.sin(t * 1.1) + .1 * Math.sin(t * 2.6 + 1); return -windMax() * Math.max(0, Math.min(1, s)); }   // always against you, gusting
      function setBin() { bin.x = Math.min(660, 450 + (level - 1) * 30); }
      function newGame() { score = 0; left = PER_ROUND; level = 1; made = 0; streak = 0; ball = null; aim = null; thrown = false; setBin(); ov.hidden = true; S('score', 0); S('best', best); S('left', left); S('level', level); S('made', 0); S('streak', 0); msg.textContent = 'Press, point at the bin, then let go.'; }

      // ---------- input: the pointer sets direction (arm) and power (distance) ----------
      function pos(e) { var r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; }
      function readAim(e) {
        var p = pos(e), dx = p.x - SHOULDER.x, dy = p.y - SHOULDER.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
        if (ux < .2) { ux = .2; } if (uy > .25) uy = .25; var n = Math.hypot(ux, uy); ux /= n; uy /= n;
        aim = { u: { x: ux, y: uy }, power: Math.max(0, Math.min(1, (d - ARM) / (FULL - ARM))) };
      }
      cv.addEventListener('pointerdown', function (e) { if (ball || left <= 0) return; e.preventDefault(); cv.setPointerCapture(e.pointerId); cv.focus(); readAim(e); });
      cv.addEventListener('pointermove', function (e) { if (aim) readAim(e); });
      cv.addEventListener('pointerup', function () {
        if (!aim) return; var a = aim; aim = null;
        if (a.power < .08) { msg.textContent = 'Move the pointer farther from the hand for more power.'; return; }
        launchDir = a.u; ball = launch(a.u, MAXV * (.25 + .75 * a.power)); left--; thrown = true; S('left', left); msg.textContent = 'Here it goes…';
      });
      cv.addEventListener('pointercancel', function () { aim = null; });

      // ---------- rules ----------
      function scoreIt(rim) {
        made++; streak++; var gain = 10 + (rim ? 0 : 5) + (streak > 1 ? (streak - 1) * 3 : 0);
        score += gain; if (score > best) { best = score; G.store('pt-best', best); }
        S('score', score); S('best', best); S('made', made); S('streak', streak);
        flash = { text: (rim ? 'Basket! +' : 'Swish! +') + gain, t: 1.5 }; msg.textContent = flash.text;
        if (made % 3 === 0) { level++; S('level', level); setTimeout(function () { setBin(); msg.textContent = 'Level ' + level + ': the bin moved back and the fan blows harder.'; }, 1000); }
      }
      function finishThrow() {
        var b = ball; if (!b || b.done) return; b.done = true;
        if (!b.scored) { streak = 0; S('streak', 0); flash = { text: 'Missed', t: 1.1 }; msg.textContent = 'Missed. Check the wind, then try again.'; }
        setTimeout(function () { ball = null; if (left <= 0) end(); }, 550);
      }
      function end() { ov.querySelector('p').textContent = 'Score ' + score + ' · ' + made + ' of ' + PER_ROUND + ' in the bin' + (score >= best && score > 0 ? ' · a new best!' : ''); ov.hidden = false; msg.textContent = 'Round over.'; }
      function tick(dt) {
        t += dt; fanAngle += dt * (4 + Math.abs(wind()) * 4);
        if (!ball || ball.done) return;
        if (step(ball, bin, wind() * WINDK, dt) === 'score') scoreIt(ball.rim);
        if (ball.x > W + 30 || ball.x < -30 || ball.rest > .45 || ball.t > 6) finishThrow();
      }

      // ---------- drawing ----------
      function paper(x, y, rot) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.beginPath();
        for (var i = 0; i < 9; i++) { var a = i / 9 * 6.283, rr = R * (.86 + .22 * Math.sin(i * 2.3 + 1)); ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr); }
        ctx.closePath(); ctx.fillStyle = '#f7f5ee'; ctx.fill(); ctx.strokeStyle = '#8a8776'; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-R * .5, -R * .1); ctx.lineTo(R * .2, R * .4); ctx.moveTo(-R * .1, -R * .6); ctx.lineTo(R * .5, 0); ctx.strokeStyle = '#b9b5a2'; ctx.stroke(); ctx.restore();
      }
      function person(u, dark) {
        var skin = '#e9b88f', shirt = dark ? '#7f9be0' : '#4f6fc7', pants = dark ? '#3b4468' : '#2f3a5c';
        ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(66, FLOOR + 2, 30, 6, 0, 0, 7); ctx.fill();
        ctx.fillStyle = pants; ctx.fillRect(52, 366, 12, FLOOR - 366); ctx.fillRect(68, 366, 12, FLOOR - 366);            // legs
        ctx.fillStyle = '#222'; ctx.fillRect(49, FLOOR - 6, 17, 6); ctx.fillRect(66, FLOOR - 6, 17, 6);                   // shoes
        ctx.fillStyle = shirt; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(48, 296, 36, 74, 8) : ctx.rect(48, 296, 36, 74); ctx.fill();   // body
        ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(66, 276, 16, 0, 7); ctx.fill();                                      // head
        ctx.fillStyle = dark ? '#d8d2c4' : '#3a2f26'; ctx.beginPath(); ctx.arc(66, 272, 16, Math.PI, 0); ctx.fill();         // hair
        ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(72, 277, 1.8, 0, 7); ctx.fill();                                    // eye
        ctx.strokeStyle = shirt; ctx.lineWidth = 11; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(SHOULDER.x - 4, SHOULDER.y); ctx.lineTo(SHOULDER.x + u.x * (ARM - 6), SHOULDER.y + u.y * (ARM - 6)); ctx.stroke();   // arm
        ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(SHOULDER.x + u.x * (ARM - 2), SHOULDER.y + u.y * (ARM - 2), 7, 0, 7); ctx.fill();   // hand
      }
      function fan(dark) {
        var fx = 748, fy = 352, yaw = Math.sin(t * 1.1) * .45, str = -wind() / windMax() * (windMax() / 6.5 + .35);
        ctx.fillStyle = dark ? '#4a3a2c' : '#a98457'; ctx.fillRect(fx - 40, fy + 24, 80, 7); ctx.fillRect(fx - 34, fy + 31, 6, FLOOR - fy - 31); ctx.fillRect(fx + 28, fy + 31, 6, FLOOR - fy - 31);
        ctx.fillStyle = '#5b6b8a'; ctx.fillRect(fx - 4, fy - 4, 8, 28); ctx.beginPath(); ctx.ellipse(fx, fy + 24, 16, 5, 0, 0, 7); ctx.fill();
        ctx.save(); ctx.translate(fx, fy - 26); ctx.scale(Math.max(.4, Math.cos(yaw * 1.6)), 1);
        ctx.fillStyle = dark ? '#cfd6e6' : '#e8edf7'; ctx.strokeStyle = '#5b6b8a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 30, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#5b6b8a'; for (var i = 0; i < 4; i++) { ctx.save(); ctx.rotate(fanAngle + i * Math.PI / 2); ctx.beginPath(); ctx.ellipse(0, -14, 7, 14, 0, 0, 7); ctx.globalAlpha = .75; ctx.fill(); ctx.restore(); }
        ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(0, 0, 5, 0, 7); ctx.fill(); ctx.restore();
        ctx.strokeStyle = dark ? 'rgba(200,220,255,' + (.12 + .5 * str) + ')' : 'rgba(80,110,170,' + (.12 + .5 * str) + ')'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        for (var k = 0; k < 6; k++) { var ph = ((t * 150 * (.4 + str) + k * 62) % 340), x0 = fx - 40 - ph, y0 = fy - 40 + k * 14 + Math.sin(k + t) * 3, len = 18 + 24 * str; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 - len, y0 + yaw * 10); ctx.stroke(); }
      }
      function binBody(dark) {
        var tl = bin.x - bin.w / 2, tr = bin.x + bin.w / 2, bl = bin.x - bin.bw / 2, br = bin.x + bin.bw / 2;
        ctx.beginPath(); ctx.moveTo(tl, bin.top); ctx.lineTo(tr, bin.top); ctx.lineTo(br, FLOOR); ctx.lineTo(bl, FLOOR); ctx.closePath();
        var g = ctx.createLinearGradient(tl, 0, tr, 0); g.addColorStop(0, dark ? '#46506e' : '#7f8cae'); g.addColorStop(.5, dark ? '#62709a' : '#a9b5d6'); g.addColorStop(1, dark ? '#3b4561' : '#6d7a9c'); ctx.fillStyle = g; ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.22)'; ctx.lineWidth = 1; for (var i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(tl + i * (tr - tl) / 6, bin.top); ctx.lineTo(bl + i * (br - bl) / 6, FLOOR); ctx.stroke(); }
        ctx.strokeStyle = dark ? '#8d9bc4' : '#56648a'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(tl - 2, bin.top); ctx.lineTo(tr + 2, bin.top); ctx.stroke();   // rim
      }
      function draw() {
        var dark = document.documentElement.getAttribute('data-theme') !== 'bright';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
        var wall = ctx.createLinearGradient(0, 0, 0, FLOOR); wall.addColorStop(0, dark ? '#2b3350' : '#f3ead7'); wall.addColorStop(1, dark ? '#1f2540' : '#e8dcc2'); ctx.fillStyle = wall; ctx.fillRect(0, 0, W, FLOOR);
        ctx.fillStyle = dark ? '#3d2f25' : '#b99a72'; ctx.fillRect(0, FLOOR, W, H - FLOOR); ctx.fillStyle = dark ? '#171b30' : '#d3c3a1'; ctx.fillRect(0, FLOOR - 6, W, 6);
        ctx.fillStyle = dark ? '#1a2038' : '#fffaf0'; ctx.strokeStyle = dark ? '#566' : '#a88'; ctx.lineWidth = 4; ctx.fillRect(300, 40, 150, 100); ctx.strokeRect(300, 40, 150, 100); ctx.beginPath(); ctx.moveTo(375, 40); ctx.lineTo(375, 140); ctx.moveTo(300, 90); ctx.lineTo(450, 90); ctx.stroke();
        fan(dark);
        var u = aim ? aim.u : (ball ? launchDir : idle);
        person(u, dark);
        // paper in hand + preview
        if (!ball && left > 0) {
          var hx = SHOULDER.x + u.x * ARM, hy = SHOULDER.y + u.y * ARM;
          if (aim) {
            var sp = MAXV * (.25 + .75 * aim.power), b = launch(u, sp), ax = wind() * WINDK, bx = b.x, by = b.y, vx = b.vx, vy = b.vy, dtp = 1 / 60; ctx.fillStyle = 'rgba(255,255,255,.8)';
            for (var i = 0; i < 70; i++) { vx += ax * dtp; vy += GRAV * dtp; bx += vx * dtp; by += vy * dtp; if (by > FLOOR || bx > W) break; if (i % 4 === 3) { ctx.beginPath(); ctx.arc(bx, by, 2.4, 0, 7); ctx.fill(); } }
            ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(20, 226, 100, 10); ctx.fillStyle = aim.power > .85 ? '#e5484d' : aim.power > .45 ? '#f2b632' : '#2f9e44'; ctx.fillRect(20, 226, 100 * aim.power, 10);
            ctx.fillStyle = dark ? '#e6ebf7' : '#27304a'; ctx.font = '600 11px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('POWER', 20, 220);
          } else if (!thrown) { ctx.fillStyle = dark ? '#e6ebf7' : '#27304a'; ctx.font = '600 15px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('Press here, point at the bin, let go to throw ➜', 120, 250); }
          paper(hx, hy, 0);
        }
        if (ball && !(ball.scored && ball.y > bin.top)) paper(ball.x, ball.y, ball.rot);
        binBody(dark);
        // wind gauge
        var w = wind(), mx = windMax(), frac = Math.min(1, -w / 6.5); ctx.fillStyle = dark ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.07)'; ctx.fillRect(550, 14, 236, 34);
        ctx.fillStyle = dark ? '#e6ebf7' : '#27304a'; ctx.font = '600 13px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('Fan wind ←  ' + (-w).toFixed(1), 560, 35);
        ctx.fillStyle = dark ? '#556' : '#b9c0d6'; ctx.fillRect(670, 25, 104, 10); ctx.fillStyle = '#f2b632'; ctx.fillRect(774 - 104 * frac, 25, 104 * frac, 10);
        if (flash && flash.t > 0) { ctx.globalAlpha = Math.min(1, flash.t); ctx.fillStyle = flash.text.indexOf('Missed') === 0 ? '#e5484d' : '#2f9e44'; ctx.font = '700 28px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(flash.text, W / 2, 96 - (1.5 - flash.t) * 12); ctx.globalAlpha = 1; }
      }
      var launchDir = idle;
      function frame(now) {
        if (!running) return; var dt = Math.min(.05, (now - last) / 1000 || 0); last = now;
        var n = Math.ceil(dt / (1 / 240)), h = dt / n; for (var i = 0; i < n; i++) tick(h);
        if (flash) flash.t -= dt; draw(); raf = requestAnimationFrame(frame);
      }
      host.querySelector('[data-k=new]').addEventListener('click', newGame); host.querySelector('[data-k=again]').addEventListener('click', newGame);
      this.show = function () { if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame); };
      this.hide = function () { running = false; cancelAnimationFrame(raf); };
      newGame();
    }
  });
})();
