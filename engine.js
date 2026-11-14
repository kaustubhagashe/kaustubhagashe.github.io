/* ==========================================================================
   Position evaluation service.

   Two back-ends, one result shape:
     • local  — Stockfish 19 (lite, single-threaded WASM) shipped in /vendor/stockfish
     • cloud  — Lichess cloud-eval (instant, but only knows positions someone has analysed)

   Modes:  "auto"  → cloud first, local Stockfish when the cloud has no entry (default)
           "local" → always Stockfish in the browser
           "cloud" → Lichess cloud only

   Every result is reported from WHITE's point of view:
     { cp, mate, depth, pv:[uci…], source:'local'|'cloud', final:boolean }
   cp is in centipawns (or null when mate is set); mate > 0 means White mates.

   Why this replaces the old code:
     – a Web Worker cannot be created from a cross-origin CDN URL, so the old local engine
       never started; Stockfish is now served from this site;
     – Lichess answers 404 for positions it has not cached (most of your own games), which
       used to be drawn as "0.00"; we now fall back to the local engine instead;
     – the side to move was read from the live game state when a message arrived, so fast
       stepping could flip the sign; the sign now comes from the FEN that was analysed;
     – searches are cancelled properly (stop → wait for bestmove) so results never cross.
   ========================================================================== */
(function (global) {
  'use strict';

  var LOCAL_URL = 'vendor/stockfish/stockfish-19-lite-single.js';
  var MOVETIME_MS = 1800;          // time per position for the local engine
  var MAX_DEPTH = 24;
  var CLOUD_TIMEOUT_MS = 5000;

  function whiteSign(fen) { return fen.split(' ')[1] === 'b' ? -1 : 1; }

  /* ---------- local Stockfish (Web Worker) ---------- */
  function LocalEngine(onStatus) {
    this.worker = null;
    this.ready = null;            // Promise<void>
    this.failed = false;
    this.job = null;              // running search {id, fen, cb, last, cancelled}
    this.next = null;             // job waiting for the running one to stop
    this.onStatus = onStatus || function () {};
  }

  LocalEngine.prototype.start = function () {
    var self = this;
    if (this.ready) return this.ready;
    this.ready = new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { fail(new Error('Stockfish did not start within 20 s')); }, 20000);
      function fail(err) { clearTimeout(timer); self.failed = true; self.onStatus('failed', err.message); reject(err); }
      try {
        self.onStatus('loading');
        self.worker = new Worker(LOCAL_URL);
      } catch (e) { return fail(e); }
      self.worker.onerror = function (ev) { fail(new Error(ev && ev.message ? ev.message : 'Stockfish worker error')); };
      self.worker.onmessage = function (ev) {
        var line = typeof ev.data === 'string' ? ev.data : '';
        if (line === 'uciok') {
          self.send('setoption name Hash value 32');
          self.send('isready');
        } else if (line === 'readyok') {
          clearTimeout(timer);
          self.worker.onmessage = function (e) { self.onLine(typeof e.data === 'string' ? e.data : ''); };
          self.onStatus('ready');
          resolve();
        }
      };
      self.send('uci');
    });
    return this.ready;
  };

  LocalEngine.prototype.send = function (cmd) { if (this.worker) this.worker.postMessage(cmd); };

  LocalEngine.prototype.onLine = function (line) {
    var job = this.job;
    if (line.indexOf('info') === 0 && line.indexOf(' score ') > 0 && line.indexOf(' pv ') > 0 && job && !job.cancelled) {
      if (/\b(lowerbound|upperbound)\b/.test(line)) return;
      var depth = +(line.match(/\bdepth (\d+)/) || [])[1] || 0;
      var cp = line.match(/\bscore cp (-?\d+)/);
      var mate = line.match(/\bscore mate (-?\d+)/);
      var pv = line.split(' pv ')[1].trim().split(/\s+/);
      var s = whiteSign(job.fen);
      job.last = {
        cp: cp ? s * parseInt(cp[1], 10) : null,
        mate: mate ? s * parseInt(mate[1], 10) : null,
        depth: depth, pv: pv, source: 'local', final: false
      };
      job.cb(job.last);
    } else if (line.indexOf('bestmove') === 0) {
      var finished = this.job;
      this.job = null;
      if (finished && !finished.cancelled) {
        var res = finished.last;
        if (!res) {                                   // no info line: e.g. a position with a forced single reply
          var bm = line.split(' ')[1];
          res = { cp: 0, mate: null, depth: 0, pv: bm && bm !== '(none)' ? [bm] : [], source: 'local', final: true };
        } else { res = Object.assign({}, res, { final: true }); }
        finished.cb(res);
      }
      if (this.next) { var n = this.next; this.next = null; this.run(n); }
    }
  };

  LocalEngine.prototype.run = function (job) {
    this.job = job;
    this.send('position fen ' + job.fen);
    this.send('go depth ' + MAX_DEPTH + ' movetime ' + MOVETIME_MS);
  };

  // Analyse a FEN; resolves immediately, results stream through job.cb. Rejects if the engine can't load.
  LocalEngine.prototype.analyse = function (job) {
    var self = this;
    return this.start().then(function () {
      if (self.job) {                 // something is still searching: stop it, run this one after its bestmove
        self.job.cancelled = true;
        self.next = job;
        self.send('stop');
      } else { self.run(job); }
    });
  };

  LocalEngine.prototype.cancel = function (id) {
    if (this.job && this.job.id === id) { this.job.cancelled = true; this.send('stop'); }
    if (this.next && this.next.id === id) this.next = null;
  };

  /* ---------- Lichess cloud ---------- */
  var cloudBlockedUntil = 0;       // back off after HTTP 429

  function cloudEval(fen, signal) {
    if (Date.now() < cloudBlockedUntil) return Promise.reject({ kind: 'ratelimited' });
    var ctl = new AbortController();
    var t = setTimeout(function () { ctl.abort(); }, CLOUD_TIMEOUT_MS);
    if (signal) signal.addEventListener('abort', function () { ctl.abort(); });
    return fetch('https://lichess.org/api/cloud-eval?multiPv=1&fen=' + encodeURIComponent(fen), { signal: ctl.signal })
      .then(function (res) {
        clearTimeout(t);
        if (res.status === 404) throw { kind: 'miss' };
        if (res.status === 429) { cloudBlockedUntil = Date.now() + 60000; throw { kind: 'ratelimited' }; }
        if (!res.ok) throw { kind: 'http', status: res.status };
        return res.json();
      })
      .then(function (d) {
        var pv = d && d.pvs && d.pvs[0];
        if (!pv) throw { kind: 'miss' };
        // Lichess stores cloud scores from White's point of view
        var moves = typeof pv.moves === 'string' ? pv.moves.trim().split(/\s+/) : (pv.moves || []);
        return {
          cp: pv.mate != null ? null : Number(pv.cp),
          mate: pv.mate != null ? Number(pv.mate) : null,
          depth: d.depth || 0, pv: moves, source: 'cloud', final: true
        };
      })
      .catch(function (e) { clearTimeout(t); if (e && e.kind) throw e; throw { kind: 'network' }; });
  }

  /* ---------- public service ---------- */
  function EvalService(opts) {
    opts = opts || {};
    this.mode = 'auto';
    this.reqId = 0;
    this.cache = new Map();                       // "mode|fen" -> final result
    this.onStatus = opts.onStatus || function () {};
    this.local = new LocalEngine(this.onStatus);
    this.abort = null;
  }

  EvalService.prototype.setMode = function (m) { this.mode = m; };

  // cb(result | null, info) is called repeatedly; info = {state:'thinking'|'done'|'error', note}
  EvalService.prototype.evaluate = function (fen, cb) {
    var self = this, id = ++this.reqId, mode = this.mode;
    var key = mode + '|' + fen.split(' ').slice(0, 4).join(' ');
    if (this.abort) { try { this.abort.abort(); } catch (e) {} }
    this.local.cancel(id - 1);
    this.abort = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var stale = function () { return id !== self.reqId; };

    if (this.cache.has(key)) { cb(this.cache.get(key), { state: 'done' }); return id; }
    cb(null, { state: 'thinking' });

    function finish(res, note) {
      if (stale()) return;
      if (res && res.final) self.cache.set(key, res);
      cb(res, { state: res && res.final ? 'done' : 'thinking', note: note });
    }
    function useLocal(note) {
      self.local.analyse({ id: id, fen: fen, cb: function (r) { finish(r, note); } })
        .catch(function (err) {
          if (stale()) return;
          cb(null, { state: 'error', note: 'Local Stockfish could not start (' + err.message + ').' + (mode === 'auto' ? ' Cloud evaluation only.' : '') });
        });
    }

    if (mode === 'local') { useLocal(); return id; }

    cloudEval(fen, this.abort && this.abort.signal).then(function (r) { finish(r); }).catch(function (e) {
      if (stale()) return;
      if (mode === 'cloud') {
        var msg = e.kind === 'miss' ? 'Lichess has no cached evaluation for this position. Switch to Auto or Local Stockfish.'
          : e.kind === 'ratelimited' ? 'Lichess is rate-limiting requests — try again in a minute, or use Local Stockfish.'
          : 'Could not reach Lichess cloud evaluation.';
        cb(null, { state: 'error', note: msg });
      } else {
        useLocal(e.kind === 'miss' ? 'Not in Lichess cloud — analysed locally.' : (e.kind === 'ratelimited' ? 'Lichess is busy — analysed locally.' : 'Cloud unreachable — analysed locally.'));
      }
    });
    return id;
  };

  global.EvalService = EvalService;
})(window);
