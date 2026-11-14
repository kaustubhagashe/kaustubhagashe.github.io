// YouTube Downloader page: talks to the local helper (see helper/server.py).
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var H = window.Helper, helper = null, info = null, job = null, poll = null, tick = null, startMs = 0;
  var urlEl = $('yt-url'), msg = $('yt-msg'), quals = $('yt-quals'), folderEl = $('yt-folder'), goBtn = $('yt-go'), cancelBtn = $('yt-cancel');
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { } return null; }
  function say(text, cls) { msg.className = 'status' + (cls ? ' ' + cls : ''); msg.textContent = text || ''; }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function mmss(sec) { var m = Math.floor(sec / 60), s = Math.round(sec % 60); if (s === 60) { m++; s = 0; } return plural(m, 'min') + ' and ' + plural(s, 'second'); }
  function dur(s) { if (!s) return ''; var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), r = s % 60; return (h ? h + ':' + (m < 10 ? '0' : '') + m : m) + ':' + (r < 10 ? '0' : '') + r; }
  function browser() { return $('yt-browser').value; }

  function refresh() {
    var ready = !!helper && !!info && !!quals.querySelector('input:checked') && folderEl.value.trim() && !job;
    goBtn.disabled = !ready;
    $('yt-check').disabled = !helper || !!job;
  }
  H.watch(function (ok, h) {
    helper = ok && h.ytdl && h.ytdl.available ? h : null;
    if (ok && !folderEl.value) folderEl.value = store('ytdl-folder') || (h.default_folder ? h.default_folder.replace(/[\\/]+$/, '') + (h.default_folder.indexOf('\\') > -1 ? '\\YouTube' : '/YouTube') : '');
    refresh();
  });
  folderEl.addEventListener('input', refresh);
  $('yt-browser').value = store('ytdl-browser') || '';
  $('yt-browser').addEventListener('change', function () { store('ytdl-browser', this.value); });

  // ---- 1. check the link
  function check() {
    var url = urlEl.value.trim();
    if (!url) { say('Paste a YouTube link first.', 'warn'); return; }
    $('yt-check').disabled = true; say('Looking up the video…'); info = null;
    ['yt-meta', 'yt-step2', 'yt-step3'].forEach(function (i) { $(i).hidden = true; });
    H.post('/api/yt/info', { url: url, cookies_browser: browser() }, 90000).then(function (d) {
      info = d; say('');
      $('yt-thumb').src = d.thumbnail || ''; $('yt-thumb').hidden = !d.thumbnail;
      $('yt-title').textContent = d.title || 'Untitled video';
      $('yt-sub').textContent = [d.uploader, dur(d.duration)].filter(Boolean).join(' · ');
      $('yt-meta').hidden = false; drawQualities(d); $('yt-step2').hidden = false; $('yt-step3').hidden = false;
    }).catch(function (e) {
      say(e.name === 'AbortError' ? 'The helper took too long to answer. Try again.' : (e.message || 'Could not read that link.'), 'err');
    }).finally(function () { $('yt-check').disabled = !helper || !!job; refresh(); });
  }
  $('yt-check').addEventListener('click', check);
  urlEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') check(); });

  function drawQualities(d) {
    quals.innerHTML = '';
    var first = null, opts = d.qualities.map(function (q) {
      return { value: String(q.height), label: q.label, sub: (q.size_mb ? '≈ ' + q.size_mb + ' MB' : 'size varies') + (q.needs_ffmpeg ? (q.available ? ' · merged' : ' · needs FFmpeg') : ' · video + audio'), disabled: !q.available };
    });
    if (d.audio_available) opts.push({ value: 'audio', label: 'Audio only', sub: 'best audio (m4a / webm)', disabled: false });
    opts.forEach(function (o) {
      var lab = document.createElement('label'); lab.className = 'q-opt' + (o.disabled ? ' is-off' : '');
      lab.innerHTML = '<input type="radio" name="yt-q" value="' + o.value + '"' + (o.disabled ? ' disabled' : '') + '><span class="q-l">' + o.label + '</span><span class="q-s">' + o.sub + '</span>';
      quals.appendChild(lab);
      if (!first && !o.disabled) first = lab.querySelector('input');
    });
    if (first) first.checked = true;
    $('yt-qnote').textContent = d.qualities.length ? 'These are the sizes this video is offered in. ' + (d.ffmpeg ? 'FFmpeg was found, so every resolution can be combined with sound.' : 'FFmpeg was not found, so only qualities that already include sound can be saved. Install FFmpeg to unlock the rest.') : 'No video formats were listed for this link; audio only is available.';
    quals.addEventListener('change', refresh);
  }

  // ---- 3. folder
  $('yt-pick').addEventListener('click', function () {
    var b = this; b.disabled = true; say('A folder window has opened on your computer…');
    H.post('/api/yt/pick-folder', { initial: folderEl.value }, 600000).then(function (r) {
      if (r.path) { folderEl.value = r.path; say(''); } else say('No folder chosen.', 'warn');
    }).catch(function (e) { say(e.message, 'warn'); }).finally(function () { b.disabled = false; refresh(); });
  });

  // ---- 4. download
  function show(id, on) { $(id).hidden = !on; }
  function reset() { ['yt-start', 'yt-bar-wrap', 'yt-done', 'yt-result', 'yt-error'].forEach(function (i) { show(i, false); }); setBar(0); $('yt-run').textContent = 'Running: 00:00'; $('yt-extra').textContent = ''; }
  function setBar(p) { $('yt-fill').style.width = p + '%'; $('yt-bar').setAttribute('aria-valuenow', Math.round(p)); $('yt-pct').textContent = (p >= 99.95 ? '100' : p.toFixed(1).replace(/\.0$/, '')) + '%'; }
  function stopTimers() { clearInterval(poll); clearInterval(tick); poll = tick = null; }
  function end() { job = null; cancelBtn.hidden = true; refresh(); }

  goBtn.addEventListener('click', function () {
    var q = quals.querySelector('input:checked'), folder = folderEl.value.trim();
    if (!q || !folder) return;
    store('ytdl-folder', folder); reset(); $('yt-step4').hidden = false; goBtn.disabled = true;
    var t0 = new Date(); startMs = t0.getTime();
    $('yt-start').textContent = 'Starting download at: ' + H.fmtTime(t0); show('yt-start', true); show('yt-bar-wrap', true);
    job = {}; cancelBtn.hidden = false;
    tick = setInterval(function () { $('yt-run').textContent = 'Running: ' + H.fmtClock((Date.now() - startMs) / 1000); }, 250);
    H.post('/api/yt/start', { url: urlEl.value.trim(), quality: q.value, folder: folder, cookies_browser: browser() }).then(function (r) {
      job = { id: r.job_id }; poll = setInterval(update, 600); update();
    }).catch(function (e) { fail(e.message); });
  });
  function fail(text) { stopTimers(); show('yt-bar-wrap', false); var m = $('yt-error'); m.textContent = text; m.hidden = false; end(); }
  function update() {
    if (!job || !job.id) return;
    H.get('/api/yt/progress/' + job.id, 8000).then(function (p) {
      setBar(p.percent || 0);
      var bits = []; if (p.speed) bits.push((p.speed / 1048576).toFixed(1) + ' MB/s'); if (p.eta) bits.push('about ' + H.fmtClock(p.eta) + ' left'); if (p.state === 'processing') bits.push('combining video and audio…');
      $('yt-extra').textContent = bits.join(' · ');
      if (p.state === 'finished') {
        stopTimers(); setBar(100);
        $('yt-run').textContent = 'Running: ' + H.fmtClock(p.elapsed);
        $('yt-done').textContent = 'Completed video download at: ' + H.fmtTime(new Date(p.finished_at)); show('yt-done', true);
        $('yt-result-text').textContent = 'Video successfully downloaded in ' + mmss(p.elapsed) + '. Saved at: “' + p.filepath + '”.';
        $('yt-result').hidden = false; $('yt-copy').dataset.path = p.filepath; end();
      } else if (p.state === 'error' || p.state === 'cancelled') { fail(p.message || 'The download did not finish.'); }
    }).catch(function () { /* helper busy; try again on the next tick */ });
  }
  cancelBtn.addEventListener('click', function () { if (job && job.id) H.post('/api/yt/cancel/' + job.id).catch(function () { }); });
  $('yt-copy').addEventListener('click', function () {
    var p = this.dataset.path, b = this;
    (navigator.clipboard ? navigator.clipboard.writeText(p) : Promise.reject()).then(function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy file path'; }, 1500); }).catch(function () { window.prompt('Copy the path:', p); });
  });
})();
