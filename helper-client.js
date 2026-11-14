// Talks to the small local helper (helper/server.py) that runs on the visitor's own computer.
// A web page cannot download YouTube videos or run Python models by itself, so these two
// project pages hand that work to the helper and show its progress.
(function () {
  var DEFAULT = 'http://127.0.0.1:8765';
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function put(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
  var H = window.Helper = {
    base: function () { return (get('helper-base') || DEFAULT).replace(/\/+$/, ''); },
    setBase: function (v) { put('helper-base', (v || DEFAULT).trim()); },
    request: function (method, path, body, timeoutMs) {
      var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, timeoutMs || 20000);
      var opts = { method: method, signal: ctl.signal };
      if (body !== undefined) { opts.headers = { 'Content-Type': 'application/json' }; opts.body = JSON.stringify(body); }
      return fetch(H.base() + path, opts).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) { var e = new Error(j.error || ('Helper replied ' + r.status)); e.data = j; e.status = r.status; throw e; }
          return j;
        });
      }).finally(function () { clearTimeout(t); });
    },
    get: function (p, t) { return H.request('GET', p, undefined, t); },
    post: function (p, b, t) { return H.request('POST', p, b || {}, t); },
    health: function () { return H.get('/api/health', 4000); }
  };

  // status pill(s): <div data-helper-status data-feature="ytdl|stocks">
  function paint(box, state, text, detail) {
    box.setAttribute('data-state', state);
    box.querySelector('.hs-text').textContent = text;
    var d = box.querySelector('.hs-detail'); if (d) d.textContent = detail || '';
  }
  H.watch = function (onChange) {
    var boxes = document.querySelectorAll('[data-helper-status]');
    var last = null;
    function check() {
      H.health().then(function (h) {
        boxes.forEach(function (b) {
          var f = b.getAttribute('data-feature'), feat = h[f] || {};
          if (feat.available === false) paint(b, 'warn', 'Helper is running, but a package is missing', f === 'ytdl' ? 'Run: pip install -U yt-dlp' : 'Run: pip install ' + (feat.missing || []).join(' '));
          else paint(b, 'ok', 'Helper connected', 'v' + h.version + (f === 'ytdl' && !h.ytdl.ffmpeg ? ' · FFmpeg not found: high resolutions will be limited' : ''));
        });
        if (last !== 'ok') { last = 'ok'; onChange && onChange(true, h); }
      }).catch(function () {
        boxes.forEach(function (b) { paint(b, 'off', 'Helper not running', 'Start it on your computer (steps below), then press “Check again”.'); });
        if (last !== 'off') { last = 'off'; onChange && onChange(false, null); }
      });
    }
    boxes.forEach(function (b) { var btn = b.querySelector('.hs-retry'); if (btn) btn.addEventListener('click', check); });
    check(); setInterval(check, 8000);
  };
  H.fmtTime = function (d) { return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }); };
  H.fmtClock = function (s) { s = Math.max(0, Math.floor(s)); var m = Math.floor(s / 60), r = s % 60; return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r; };
})();
