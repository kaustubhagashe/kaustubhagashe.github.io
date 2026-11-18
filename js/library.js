/* My Library: shows the books in data/books.json (shelf + wishlist). See the guide for how to update it.
   Cover order: the "cover" address in the file -> Open Library by ISBN -> a coloured cover with the title. */
(function () {
  var grid = document.getElementById('lib-grid'); if (!grid) return;
  var $ = function (id) { return document.getElementById(id); };
  var books = [], view = 'shelf', modalOpener = null;
  var SECTIONS = [['shelf', 'On my shelf'], ['wishlist', 'Wishlist'], ['all', 'All']];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function hue(str) { var h = 0; for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360; return h; }
  function colour(b) { return /^#[0-9a-f]{3,8}$/i.test(b.color || '') ? b.color : 'hsl(' + hue(b.title + (b.author || '')) + ' 38% 32%)'; }
  function stars(n) { n = Math.max(0, Math.min(5, Math.round(+n || 0))); if (!n) return ''; var s = ''; for (var i = 1; i <= 5; i++) s += i <= n ? '★' : '<i>★</i>'; return '<span aria-label="' + n + ' out of 5">' + s + '</span>'; }
  function year(d) { var m = /^(\d{4})/.exec(d || ''); return m ? +m[1] : 0; }
  function readKey(b) { var d = b.dateRead || ''; if (/^\d{4}$/.test(d)) return d + '-06-30'; if (/^\d{4}-\d{2}$/.test(d)) return d + '-15'; return d; }
  function prettyDate(d) {
    if (!d) return ''; if (/^\d{4}$/.test(d)) return d;
    var t = new Date(d + (d.length === 7 ? '-01' : '') + 'T00:00:00'); if (isNaN(t)) return d;
    return t.toLocaleDateString('en-IN', d.length === 7 ? { month: 'long', year: 'numeric' } : { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function sources(b) {
    var out = []; if (b.cover) out.push(b.cover);
    var isbn = (b.isbn || '').replace(/[^0-9Xx]/g, ''); if (isbn) out.push('https://covers.openlibrary.org/b/isbn/' + isbn + '-L.jpg?default=false');
    return out;
  }
  // a cover that always has a coloured title cover underneath, and an image on top when one can be loaded
  function makeCover(b) {
    var el = document.createElement('div'); el.className = 'cover'; el.style.setProperty('--cv', colour(b));
    el.innerHTML = '<div class="cover-fb"><b>' + esc(b.title) + '</b><span>' + esc(b.author || '') + '</span></div>';
    var list = sources(b), i = 0;
    (function next() {
      if (i >= list.length) return;
      var img = new Image(); img.alt = ''; img.referrerPolicy = 'no-referrer'; img.decoding = 'async';
      img.onload = function () { if (img.naturalWidth < 30) { next(); return; } el.appendChild(img); el.classList.add('has-img'); };   // tiny placeholder images count as "not found"
      img.onerror = function () { next(); };
      img.src = list[i++];
    })();
    return el;
  }
  function amazon(b) {
    if (b.link) return b.link;
    var q = (b.isbn || '').replace(/[^0-9Xx]/g, '') || (b.title + ' ' + (b.author || ''));
    return 'https://www.amazon.in/s?k=' + encodeURIComponent(q);
  }

  // ---------- list ----------
  function filtered() {
    var q = $('lib-q').value.trim().toLowerCase(), g = $('lib-genre').value, sort = $('lib-sort').value;
    var list = books.filter(function (b) {
      if (view !== 'all' && (b.section || 'shelf') !== view) return false;
      if (g && (b.genre || '') !== g) return false;
      if (q && (b.title + ' ' + (b.author || '') + ' ' + (b.genre || '') + ' ' + (b.notes || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var cmp = {
      title: function (a, b) { return a.title.localeCompare(b.title); },
      author: function (a, b) { return (a.author || '~').localeCompare(b.author || '~') || a.title.localeCompare(b.title); },
      rating: function (a, b) { return (b.rating || 0) - (a.rating || 0) || a.title.localeCompare(b.title); },
      recent: function (a, b) { var x = readKey(a), y = readKey(b); return !x && !y ? a._i - b._i : !x ? 1 : !y ? -1 : y.localeCompare(x); },
      listed: function (a, b) { return a._i - b._i; }
    }[sort] || function () { return 0; };
    return list.sort(cmp);
  }
  function draw() {
    var list = filtered(); grid.innerHTML = '';
    if (!list.length) { grid.innerHTML = '<div class="lib-empty">No books match. Try clearing the search or the genre.</div>'; }
    list.forEach(function (b) {
      var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'book'; btn.setAttribute('aria-label', b.title + (b.author ? ', by ' + b.author : ''));
      btn.appendChild(makeCover(b));
      var t = document.createElement('div'); t.className = 'book-t'; t.textContent = b.title; btn.appendChild(t);
      if (b.author) { var a = document.createElement('div'); a.className = 'book-a'; a.textContent = b.author; btn.appendChild(a); }
      if (b.rating) { var r = document.createElement('div'); r.className = 'lib-stars'; r.innerHTML = stars(b.rating); btn.appendChild(r); }
      btn.addEventListener('click', function () { openBook(b, btn); }); grid.appendChild(btn);
    });
    var shelf = books.filter(function (b) { return (b.section || 'shelf') === 'shelf'; }), wish = books.length - shelf.length;
    var rated = shelf.filter(function (b) { return b.rating; }), avg = rated.length ? (rated.reduce(function (s, b) { return s + b.rating; }, 0) / rated.length).toFixed(1) : null;
    $('lib-summary').textContent = 'Showing ' + list.length + ' of ' + books.length + ' books · ' + shelf.length + ' on the shelf' + (wish ? ' · ' + wish + ' on the wishlist' : '') + (avg ? ' · average rating ' + avg + ' / 5' : '') + '.';
  }
  function tabs() {
    var box = $('lib-tabs'); box.innerHTML = '';
    SECTIONS.forEach(function (s) {
      var n = s[0] === 'all' ? books.length : books.filter(function (b) { return (b.section || 'shelf') === s[0]; }).length;
      if (s[0] === 'wishlist' && !n) return;
      var b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(s[0] === view)); b.textContent = s[1] + ' (' + n + ')';
      b.addEventListener('click', function () { view = s[0]; tabs(); draw(); }); box.appendChild(b);
    });
  }
  function genres() {
    var set = {}; books.forEach(function (b) { if (b.genre) set[b.genre] = 1; });
    $('lib-genre').innerHTML = '<option value="">All genres</option>' + Object.keys(set).sort().map(function (g) { return '<option>' + esc(g) + '</option>'; }).join('');
  }

  // ---------- detail ----------
  function openBook(b, opener) {
    modalOpener = opener; var c = $('lib-m-cover'); c.innerHTML = ''; c.appendChild(makeCover(b));
    $('lib-m-title').textContent = b.title; $('lib-m-author').textContent = b.author ? 'by ' + b.author : ''; $('lib-m-rating').innerHTML = stars(b.rating);
    var rows = [['Publisher', b.publisher], ['Year', b.year], ['Pages', b.pages], ['Genre', b.genre], ['ISBN', b.isbn], ['Section', (b.section || 'shelf') === 'wishlist' ? 'Wishlist' : 'On my shelf'], ['Read', prettyDate(b.dateRead)]];
    $('lib-m-meta').innerHTML = rows.filter(function (r) { return r[1]; }).map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('');
    $('lib-m-notes').textContent = b.notes || '';
    $('lib-m-links').innerHTML = '<a class="btn btn-primary" href="' + esc(amazon(b)) + '" target="_blank" rel="noopener">View on Amazon</a>';
    $('lib-modal').hidden = false; document.body.style.overflow = 'hidden'; $('lib-close').focus();
  }
  function closeBook() { $('lib-modal').hidden = true; document.body.style.overflow = ''; if (modalOpener) modalOpener.focus(); }
  $('lib-close').addEventListener('click', closeBook);
  $('lib-modal').addEventListener('click', function (e) { if (e.target === this) closeBook(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('lib-modal').hidden) closeBook(); });
  ['lib-q', 'lib-genre', 'lib-sort'].forEach(function (id) { $(id).addEventListener('input', draw); $(id).addEventListener('change', draw); });

  var root = document.currentScript.src.replace(/js\/library\.js.*$/, '');
  fetch(root + 'data/books.json', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) {
    books = (Array.isArray(d) ? d : d.books || []).filter(function (b) { return b && b.title; }).map(function (b, i) { b._i = i; return b; });
    if (!books.some(function (b) { return (b.section || 'shelf') === 'shelf'; })) view = 'all';
    tabs(); genres(); draw();
  }).catch(function () { $('lib-summary').textContent = 'The book list could not be loaded (data/books.json).'; });
})();
