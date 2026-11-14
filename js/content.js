// Content loader: pages such as About / Blog read their text from content/<page>.md,
// so you can edit plain Markdown without touching the layout. Also removes the "Soon"
// badges for any page that has a content file.
(function () {
  var script = document.currentScript || document.querySelector('script[src$="js/content.js"]');
  var root = script.src.replace(/js\/content\.js.*$/, '');

  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function inline(s) {
    s = esc(s);
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1" loading="lazy">');
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, t, u) {
      var ext = /^https?:/.test(u);
      return '<a href="' + u + '"' + (ext ? ' target="_blank" rel="noopener"' : '') + '>' + t + '</a>';
    });
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    return s;
  }
  function render(md) {
    var lines = md.replace(/\r/g, '').replace(/^---[\s\S]*?\n---\n/, '').split('\n'), out = [], i = 0;
    while (i < lines.length) {
      var l = lines[i], m;
      if (!l.trim()) { i++; continue; }
      if ((m = l.match(/^(#{1,4})\s+(.*)$/))) { var n = Math.min(m[1].length + 1, 4); out.push('<h' + n + '>' + inline(m[2]) + '</h' + n + '>'); i++; continue; }
      if (/^(-{3,}|\*{3,})\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
      if (/^>\s?/.test(l)) { var q = []; while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, '')); out.push('<blockquote>' + inline(q.join(' ')) + '</blockquote>'); continue; }
      if (/^\s*[-*]\s+/.test(l)) { var li = []; while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) li.push('<li>' + inline(lines[i++].replace(/^\s*[-*]\s+/, '')) + '</li>'); out.push('<ul>' + li.join('') + '</ul>'); continue; }
      if (/^\s*\d+\.\s+/.test(l)) { var ol = []; while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) ol.push('<li>' + inline(lines[i++].replace(/^\s*\d+\.\s+/, '')) + '</li>'); out.push('<ol>' + ol.join('') + '</ol>'); continue; }
      var p = []; while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|>|\s*[-*]\s|\s*\d+\.\s|-{3,}\s*$)/.test(lines[i])) p.push(lines[i++]);
      out.push('<p>' + inline(p.join(' ')) + '</p>');
    }
    return out.join('\n');
  }

  var cache = {};
  function load(key) {
    if (!cache[key]) cache[key] = fetch(root + 'content/' + key + '.md', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.text() : null; }).catch(function () { return null; });
    return cache[key];
  }

  // 1. page body
  var box = document.querySelector('[data-md]');
  if (box) load(box.getAttribute('data-md').replace(/^content\//, '').replace(/\.md$/, '')).then(function (t) {
    if (t && t.trim()) { box.innerHTML = '<article class="prose">' + render(t) + '</article>'; }
  });

  // 2. "Soon" badges disappear once content/<page>.md exists
  document.querySelectorAll('.nav a[data-key] .soon, [data-soon]').forEach(function (el) {
    var key = el.getAttribute('data-soon') || el.closest('a').getAttribute('data-key');
    load(key).then(function (t) { if (t && t.trim()) { el.remove(); var tile = el.closest && el.closest('.tile'); if (tile) tile.classList.remove('is-soon'); } });
  });
})();
