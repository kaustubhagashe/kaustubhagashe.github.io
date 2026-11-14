/* My Wall: four sections (My Art, Ridhima's Art and Craft, Minal's Art and Craft, Photo Album).
   Each section reads wall/<folder>/list.json. See wall/README.md for how to add pictures. */
(function () {
  var host = document.getElementById('wall-sections'); if (!host) return;
  var SECTIONS = [
    { id: 'my-art', label: 'My Art', dir: 'wall/my-art/', view: 'carousel', blurb: 'Sketches and paintings, framed. Use the arrows or swipe to browse; click a picture to see it larger.' },
    { id: 'ridhima', label: 'Ridhima’s Art and Craft', dir: 'wall/ridhima/', view: 'carousel', blurb: 'Drawings and handmade crafts by Ridhima.' },
    { id: 'minal', label: 'Minal’s Art and Craft', dir: 'wall/minal/', view: 'carousel', blurb: 'Drawings and handmade crafts by Minal.' },
    { id: 'album', label: 'Photo Album', dir: 'wall/album/', view: 'grid', blurb: 'Moments worth keeping. Click any photo to enlarge it.' }
  ];
  var lb = document.getElementById('wall-lb'), lbImg = document.getElementById('wall-img'), lbCap = document.getElementById('wall-cap');
  var lbItems = [], lbCur = 0, opener = null, tabs = document.getElementById('wall-tabs');

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function meta(it) { return [it.medium, it.date].filter(Boolean).join(' · '); }
  function url(sec, name) { return /^(https?:|\/|wall\/)/.test(name) ? name : sec.dir + name; }

  /* ---------- lightbox ---------- */
  function lbShow(i) {
    lbCur = (i + lbItems.length) % lbItems.length; var it = lbItems[lbCur];
    lbImg.src = it.src; lbImg.alt = it.alt;
    lbCap.innerHTML = esc(it.title || '') + (it.caption || meta(it) ? '<small>' + esc(it.caption || meta(it)) + '</small>' : '');
    var multi = lbItems.length > 1; document.getElementById('wall-prev').hidden = !multi; document.getElementById('wall-next').hidden = !multi;
  }
  function lbOpen(items, i, el) { lbItems = items; opener = el; lbShow(i); lb.hidden = false; document.body.style.overflow = 'hidden'; document.getElementById('wall-close').focus(); }
  function lbClose() { lb.hidden = true; document.body.style.overflow = ''; if (opener) opener.focus(); }
  document.getElementById('wall-close').addEventListener('click', lbClose);
  document.getElementById('wall-prev').addEventListener('click', function () { lbShow(lbCur - 1); });
  document.getElementById('wall-next').addEventListener('click', function () { lbShow(lbCur + 1); });
  lb.addEventListener('click', function (e) { if (e.target === lb) lbClose(); });
  document.addEventListener('keydown', function (e) {
    if (lb.hidden) return;
    if (e.key === 'Escape') lbClose(); else if (e.key === 'ArrowLeft') lbShow(lbCur - 1); else if (e.key === 'ArrowRight') lbShow(lbCur + 1);
  });

  /* ---------- carousel ---------- */
  function carousel(box, sec, items) {
    var cur = 0, n = items.length;
    box.innerHTML =
      '<div class="car" tabindex="0" role="group" aria-roledescription="carousel" aria-label="' + esc(sec.label) + '">' +
      '<div class="car-row"><button class="car-nav prev" type="button" aria-label="Previous picture"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button>' +
      '<div class="car-stage"><figure class="frame"><button type="button" class="frame-open" aria-label="Enlarge picture"><img alt=""></button><figcaption></figcaption></figure></div>' +
      '<button class="car-nav next" type="button" aria-label="Next picture"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button></div>' +
      '<div class="car-count" aria-live="polite"></div>' +
      '<div class="car-thumbs" role="tablist" aria-label="Choose a picture"></div></div>';
    var root = box.firstChild, img = root.querySelector('.frame img'), cap = root.querySelector('figcaption'), cnt = root.querySelector('.car-count'), strip = root.querySelector('.car-thumbs'), stage = root.querySelector('.car-stage');
    items.forEach(function (it, i) {
      var b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-label', 'Show ' + (it.title || 'picture ' + (i + 1)));
      b.innerHTML = '<img loading="lazy" alt="" src="' + esc(it.thumbSrc) + '">'; b.addEventListener('click', function () { go(i); }); strip.appendChild(b);
    });
    function go(i) {
      cur = (i + n) % n; var it = items[cur];
      stage.classList.add('fade');
      var pre = new Image(); pre.onload = pre.onerror = function () {
        img.src = it.src; img.alt = it.alt; stage.classList.remove('fade');
      }; pre.src = it.src;
      cap.innerHTML = '<strong>' + esc(it.title || '') + '</strong>' + (meta(it) ? '<small>' + esc(meta(it)) + '</small>' : '');
      cnt.textContent = (cur + 1) + ' of ' + n;
      Array.prototype.forEach.call(strip.children, function (b, k) { b.setAttribute('aria-selected', String(k === cur)); if (k === cur) { var l = b.offsetLeft - strip.clientWidth / 2 + b.clientWidth / 2; strip.scrollTo ? strip.scrollTo({ left: l, behavior: 'smooth' }) : (strip.scrollLeft = l); } });
      [cur - 1, cur + 1].forEach(function (k) { new Image().src = items[(k + n) % n].src; });
    }
    root.querySelector('.prev').addEventListener('click', function () { go(cur - 1); });
    root.querySelector('.next').addEventListener('click', function () { go(cur + 1); });
    root.addEventListener('keydown', function (e) { if (e.key === 'ArrowLeft') { go(cur - 1); e.preventDefault(); } else if (e.key === 'ArrowRight') { go(cur + 1); e.preventDefault(); } });
    var openBtn = root.querySelector('.frame-open');
    openBtn.addEventListener('click', function () { lbOpen(items, cur, openBtn); });
    // swipe
    var sx = null; stage.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
    stage.addEventListener('touchend', function (e) { if (sx == null) return; var dx = e.changedTouches[0].clientX - sx; sx = null; if (Math.abs(dx) > 45) go(cur + (dx < 0 ? 1 : -1)); });
    if (n < 2) { root.classList.add('single'); }
    go(0);
  }

  /* ---------- photo album grid ---------- */
  function grid(box, sec, items) {
    box.innerHTML = '<div class="wall-grid"></div>'; var g = box.firstChild;
    items.forEach(function (it, i) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'wall-card'; b.setAttribute('aria-label', 'View ' + (it.title || 'photo'));
      b.innerHTML = '<img loading="lazy" src="' + esc(it.thumbSrc) + '" alt="' + esc(it.alt) + '">' + (it.title ? '<span class="wc-t">' + esc(it.title) + '</span>' : '') + (meta(it) ? '<span class="wc-m">' + esc(meta(it)) + '</span>' : '');
      b.addEventListener('click', function () { lbOpen(items, i, b); }); g.appendChild(b);
    });
  }

  function empty(box, sec) {
    box.innerHTML = '<div class="wall-empty"><div class="wall-frames" aria-hidden="true"><span></span><span></span><span></span></div><h2>Nothing pinned here yet</h2><p>New pieces will appear in “' + esc(sec.label) + '” soon.</p></div>';
  }

  /* ---------- build sections + tabs ---------- */
  var panels = {};
  SECTIONS.forEach(function (sec) {
    var tab = document.createElement('button'); tab.type = 'button'; tab.id = 'tab-' + sec.id; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', 'sec-' + sec.id); tab.textContent = sec.label;
    tab.addEventListener('click', function () { select(sec.id, true); }); tabs.appendChild(tab);
    var panel = document.createElement('section'); panel.id = 'sec-' + sec.id; panel.className = 'wall-sec'; panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', 'tab-' + sec.id); panel.hidden = true;
    panel.innerHTML = '<p class="wall-blurb">' + esc(sec.blurb) + '</p><div class="wall-body"><p class="hint">Loading…</p></div>';
    host.appendChild(panel); panels[sec.id] = { sec: sec, panel: panel, tab: tab, loaded: false };
  });
  tabs.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    var ids = SECTIONS.map(function (s) { return s.id; }), cur = ids.indexOf(current), next = ids[(cur + (e.key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length];
    select(next, true); panels[next].tab.focus();
  });

  function load(id) {
    var p = panels[id]; if (p.loaded) return; p.loaded = true;
    var body = p.panel.querySelector('.wall-body'), sec = p.sec;
    fetch(sec.dir + 'list.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; }).then(function (list) {
      var items = (Array.isArray(list) ? list : (list && list.items) || []).filter(function (x) { return x && x.file; }).map(function (x) {
        return { src: url(sec, x.file), thumbSrc: x.thumb ? url(sec, x.thumb) : url(sec, x.file), title: x.title, date: x.date, medium: x.medium, caption: x.caption, alt: x.alt || x.title || sec.label };
      });
      if (!items.length) return empty(body, sec);
      (sec.view === 'grid' ? grid : carousel)(body, sec, items);
    });
  }
  var current = null;
  function select(id, push) {
    if (!panels[id]) id = SECTIONS[0].id;
    current = id;
    SECTIONS.forEach(function (s) { var on = s.id === id; panels[s.id].panel.hidden = !on; panels[s.id].tab.setAttribute('aria-selected', String(on)); panels[s.id].tab.tabIndex = on ? 0 : -1; });
    load(id);
    if (push && history.replaceState) history.replaceState(null, '', '#' + id);
  }
  window.addEventListener('hashchange', function () { select(location.hash.slice(1), false); });
  select(location.hash.slice(1), false);
})();
