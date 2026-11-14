// Shared helpers for the games on the Puzzles & Games page.
(function () {
  var reg = {}, started = {};
  window.Games = {
    register: function (id, def) { reg[id] = def; },
    show: function (id, panel) {
      var g = reg[id]; if (!g) return;
      if (!started[id]) { started[id] = true; g.init(panel.querySelector('.gm-host')); }
      if (g.show) g.show();
    },
    hide: function (id) { var g = reg[id]; if (g && g.hide) g.hide(); },
    store: function (k, v) {
      try { if (v === undefined) { var r = localStorage.getItem('game:' + k); return r == null ? null : JSON.parse(r); } localStorage.setItem('game:' + k, JSON.stringify(v)); } catch (e) { }
      return null;
    },
    el: function (tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; },
    logic: {}                       // pure game logic, exposed so it can be tested
  };
})();
