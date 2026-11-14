// Shared behaviour: appearance (mode + accent palette) and the mobile drawer.
(function () {
  var root = document.documentElement;
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  var PALETTES = ['gold', 'teal', 'cobalt', 'ember', 'crimson', 'violet'];

  function setPalette(p) {
    if (PALETTES.indexOf(p) < 0) p = 'gold';
    root.dataset.palette = p;
    store.set('site-palette', p);
    document.querySelectorAll('.swatch').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.palette === p)); });
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', getComputedStyle(document.body).backgroundColor);
  }
  function setTheme(t) {
    root.dataset.theme = t;
    store.set('site-theme', t);
    document.querySelectorAll('.mode-btn').forEach(function (btn) { btn.setAttribute('aria-pressed', String(t === 'bright')); btn.querySelector('.mode-text').textContent = t === 'bright' ? 'Dark' : 'Bright'; });
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', getComputedStyle(document.body).backgroundColor);
  }

  document.querySelectorAll('.swatch').forEach(function (b) {
    b.addEventListener('click', function () { setPalette(b.dataset.palette); });
  });
  document.querySelectorAll('.mode-btn').forEach(function (btn) {
    btn.addEventListener('click', function () { setTheme(root.dataset.theme === 'bright' ? 'dark' : 'bright'); });
  });
  setPalette(root.dataset.palette);
  setTheme(root.dataset.theme);

  // drawer
  var body = document.body;
  function drawer(open) {
    body.classList.toggle('drawer-open', open);
    var mb = document.getElementById('menu-btn'); if (mb) mb.setAttribute('aria-expanded', String(open));
  }
  var mb = document.getElementById('menu-btn');
  if (mb) mb.addEventListener('click', function () { drawer(!body.classList.contains('drawer-open')); });
  var scrim = document.getElementById('scrim');
  if (scrim) scrim.addEventListener('click', function () { drawer(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') drawer(false); });
  document.querySelectorAll('.nav a').forEach(function (a) { a.addEventListener('click', function () { drawer(false); }); });
})();
