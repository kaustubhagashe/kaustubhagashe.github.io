// Visitor counter. Shows the whole-site count and this page's count in the top-right corner.
// Counts are kept by the free Abacus service (CORS-enabled, no sign-up). Settings live in data/visitors.json.
// A visitor is counted once per browser session per page, so refreshing does not inflate the numbers.
(function () {
  var script = document.currentScript || document.querySelector('script[src$="js/visitors.js"]');
  var root = script.src.replace(/js\/visitors\.js.*$/, '');
  var API = 'https://abacus.jasoncameron.dev';

  function pageKey() {
    var p = location.pathname.replace(/index\.html$/, '').replace(/^\/+|\/+$/g, '').replace(/\.html$/, '');
    return (p ? p.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : 'home') || 'home';
  }
  var KEY = pageKey();
  var NOCOUNT = { '404': 1, 'visitors': 1 };

  function fmt(n) { return (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString('en-IN'); }
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) { } return null; }
  function loadConfig() {
    return fetch(root + 'data/visitors.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; });
  }
  function call(cfg, op, name) {
    var url = API + '/' + op + '/' + encodeURIComponent(cfg.namespace) + '/' + encodeURIComponent(name);
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (r.status === 404) return 0;                       // counter not created yet
      if (!r.ok) throw new Error('counter ' + r.status);
      return r.json().then(function (j) { return Number(j.value) || 0; });
    });
  }
  // hit = add one (once per session), otherwise just read
  function read(cfg, name, allowHit) {
    var seen = 'vc:' + cfg.namespace + ':' + name;
    var hit = allowHit && !ss(seen);
    return call(cfg, hit ? 'hit' : 'get', name).then(function (v) { if (hit) ss(seen, '1'); return v; });
  }
  function base(cfg, key) {
    var b = cfg.baseline || {};
    return key === 'site' ? Number(b.site) || 0 : Number((b.pages || {})[key]) || 0;
  }
  function recorded(cfg, key) {
    var r = cfg.last_recorded || {};
    return key === 'site' ? Number(r.site) || 0 : Number((r.pages || {})[key]) || 0;
  }

  function badge() {
    var el = document.createElement('aside');
    el.className = 'vc'; el.setAttribute('aria-label', 'Visitor counter');
    el.innerHTML =
      '<span class="vc-i" title="Visitors to the whole site"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg><span class="vc-l">Visitors</span><b data-vc="site">…</b></span>' +
      '<span class="vc-i" title="Visitors to this page"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg><span class="vc-l">This page</span><b data-vc="page">…</b></span>';
    (document.querySelector('.main') || document.body).prepend(el);
    return el;
  }

  loadConfig().then(function (cfg) {
    if (!cfg || cfg.enabled === false || !cfg.namespace) return;
    window.SiteVisitors = { config: cfg, key: KEY, get: function (name) { return call(cfg, 'get', name); } };
    var el = badge();
    var site = el.querySelector('[data-vc="site"]'), page = el.querySelector('[data-vc="page"]');
    var local = /^(localhost|127\.0\.0\.1|\[::1\]|)$/.test(location.hostname) || location.protocol === 'file:';
    var count = !NOCOUNT[KEY];
    var useCfg = cfg;
    if (local) {                                   // test copy on your own computer: separate counter, real totals untouched
      if (cfg.count_on_localhost === false) count = false;
      useCfg = Object.assign({}, cfg, { namespace: cfg.namespace + '-local', baseline: { site: 0, pages: {} }, last_recorded: {} });
      el.classList.add('vc-preview'); el.title = 'Local test copy: counted separately from the live site';
    }
    Promise.all([read(useCfg, 'site-total', count), read(useCfg, 'page-' + KEY, count)]).then(function (v) {
      site.textContent = fmt(base(useCfg, 'site') + v[0]);
      page.textContent = fmt(base(useCfg, KEY) + v[1]);
    }).catch(function () {                         // service unreachable or blocked: show the last recorded figures
      site.textContent = fmt(recorded(useCfg, 'site')); page.textContent = fmt(recorded(useCfg, KEY));
      el.classList.add('vc-offline'); el.title = 'Live count unavailable right now (offline or blocked); showing the last recorded figure';
    });
  });
})();
