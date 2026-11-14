// visitors.html: shows live counts for every page and prepares the JSON for data/visitors.json.
(function () {
  var tbody = document.getElementById('vc-rows'); if (!tbody) return;
  var keys = tbody.getAttribute('data-pages').split(',');
  var out = document.getElementById('vc-json'), msg = document.getElementById('vc-msg');
  var root = document.currentScript.src.replace(/js\/visitors-admin\.js.*$/, '');
  var cfg = null, live = {}, totals = {};
  function fmt(n) { return Number(n).toLocaleString('en-IN'); }
  function api(name) {
    return fetch('https://abacus.jasoncameron.dev/get/' + encodeURIComponent(cfg.namespace) + '/' + encodeURIComponent(name), { cache: 'no-store' })
      .then(function (r) { if (r.status === 404) return 0; if (!r.ok) throw new Error(r.status); return r.json().then(function (j) { return Number(j.value) || 0; }); });
  }
  function base(key) { var b = cfg.baseline || {}; return key === 'site' ? Number(b.site) || 0 : Number((b.pages || {})[key]) || 0; }
  function today() { return new Date().toISOString().slice(0, 10); }

  function render() {
    tbody.innerHTML = '';
    ['site'].concat(keys).forEach(function (k) {
      var tr = document.createElement('tr');
      var label = k === 'site' ? 'Whole site' : k;
      tr.innerHTML = '<td>' + label + '</td><td class="num">' + (live[k] == null ? '…' : fmt(live[k])) + '</td><td class="num">' + fmt(base(k)) + '</td><td class="num"><b>' + (live[k] == null ? '…' : fmt(totals[k])) + '</b></td>';
      tbody.appendChild(tr);
    });
  }
  function snapshot() {
    var pages = {}; keys.forEach(function (k) { pages[k] = totals[k] || 0; });
    return { date: today(), site: totals.site || 0, pages: pages };
  }
  function show(obj, note) { out.value = JSON.stringify(obj, null, 2); msg.textContent = note; out.focus(); out.select(); }

  fetch(root + 'data/visitors.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (c) {
    cfg = c; document.getElementById('vc-ns').textContent = c.namespace;
    render();
    var all = ['site'].concat(keys);
    return Promise.all(all.map(function (k) {
      return api(k === 'site' ? 'site-total' : 'page-' + k).then(function (v) { live[k] = v; totals[k] = v + base(k); });
    }));
  }).then(render).catch(function () { msg.textContent = 'Could not reach the counter service. Check your internet connection and reload.'; });

  document.getElementById('vc-record').addEventListener('click', function () {
    if (!cfg || totals.site == null) return;
    var next = JSON.parse(JSON.stringify(cfg)); next.last_recorded = snapshot();
    show(next, 'Copy this whole box and paste it over data/visitors.json on GitHub. Counting is unchanged; this only records today’s figures.');
  });
  document.getElementById('vc-fresh').addEventListener('click', function () {
    if (!cfg || totals.site == null) return;
    var next = JSON.parse(JSON.stringify(cfg)); var s = snapshot();
    var m = /^(.*)-v(\d+)$/.exec(cfg.namespace);
    next.namespace = m ? m[1] + '-v' + (Number(m[2]) + 1) : cfg.namespace + '-v2';
    next.baseline = { site: s.site, pages: s.pages }; next.last_recorded = s;
    show(next, 'Use only if the live counter was lost or you want a new one. Paste over data/visitors.json: counting restarts under a new name, starting from today’s totals.');
  });
  document.getElementById('vc-copy').addEventListener('click', function () {
    if (!out.value) return; out.select();
    (navigator.clipboard ? navigator.clipboard.writeText(out.value) : Promise.reject()).then(function () { msg.textContent = 'Copied.'; }).catch(function () { document.execCommand('copy'); msg.textContent = 'Copied.'; });
  });
})();
