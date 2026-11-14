// Tiny dependency-free SVG line chart with hover read-out.
// MiniChart(container, { series: [{ name, color, dash, data: [[ 'YYYY-MM-DD', value ], ...] }], yFormat, height })
(function () {
  var NS = 'http://www.w3.org/2000/svg';
  function el(n, a, t) { var e = document.createElementNS(NS, n); for (var k in a) e.setAttribute(k, a[k]); if (t != null) e.textContent = t; return e; }
  function niceStep(range, target) {
    var raw = range / target, pow = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / pow;
    return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * pow;
  }
  function ts(s) { return Date.parse(s + 'T00:00:00Z'); }
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function dlabel(ms, span) { var d = new Date(ms); return span > 500 * 864e5 ? MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear() : d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + (span > 120 * 864e5 ? ' ' + String(d.getUTCFullYear()).slice(2) : ''); }
  function fmtDate(ms) { var d = new Date(ms); return d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); }

  window.MiniChart = function (box, opt) {
    box.innerHTML = '';
    var H = opt.height || 300, fmtY = opt.yFormat || function (v) { return v.toLocaleString('en-IN', { maximumFractionDigits: 2 }); };
    var series = opt.series.filter(function (s) { return s.data && s.data.length; });
    if (!series.length) { box.textContent = 'No data to chart.'; return; }
    var pts = series.map(function (s) { return s.data.map(function (p) { return [ts(p[0]), +p[1]]; }).filter(function (p) { return isFinite(p[1]); }); });
    var xs = [], ymin = Infinity, ymax = -Infinity;
    pts.forEach(function (a) { a.forEach(function (p) { xs.push(p[0]); if (p[1] < ymin) ymin = p[1]; if (p[1] > ymax) ymax = p[1]; }); });
    xs = Array.from(new Set(xs)).sort(function (a, b) { return a - b; });
    var maps = pts.map(function (a) { var m = {}; a.forEach(function (p) { m[p[0]] = p[1]; }); return m; });
    var pad = (ymax - ymin) * .08 || Math.abs(ymax) * .05 || 1; ymin -= pad; ymax += pad;
    var step = niceStep(ymax - ymin, 5); ymin = Math.floor(ymin / step) * step; ymax = Math.ceil(ymax / step) * step;
    var x0 = xs[0], x1 = xs[xs.length - 1] || x0 + 1, span = x1 - x0 || 1;

    var legend = document.createElement('div'); legend.className = 'mc-legend';
    series.forEach(function (s) { var i = document.createElement('span'); i.innerHTML = '<i style="background:' + s.color + '"></i>' + s.name; legend.appendChild(i); });
    var wrap = document.createElement('div'); wrap.className = 'mc-wrap';
    var tip = document.createElement('div'); tip.className = 'mc-tip'; tip.hidden = true;
    box.appendChild(legend); box.appendChild(wrap); wrap.appendChild(tip);

    function draw() {
      var W = Math.max(wrap.clientWidth, 280), L = 58, R = 14, T = 10, B = 28, iw = W - L - R, ih = H - T - B;
      var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', 'aria-label': opt.label || 'Chart' });
      var X = function (x) { return L + (x - x0) / span * iw; }, Y = function (y) { return T + (1 - (y - ymin) / (ymax - ymin)) * ih; };
      for (var v = ymin; v <= ymax + step / 2; v += step) {
        svg.appendChild(el('line', { x1: L, x2: W - R, y1: Y(v), y2: Y(v), stroke: 'var(--line)', 'stroke-width': 1 }));
        svg.appendChild(el('text', { x: L - 8, y: Y(v) + 4, 'text-anchor': 'end', fill: 'var(--muted)', 'font-size': 11 }, fmtY(v)));
      }
      var n = Math.max(2, Math.min(6, Math.floor(iw / 110)));
      for (var i = 0; i <= n; i++) { var xv = x0 + span * i / n; svg.appendChild(el('text', { x: X(xv), y: H - 8, 'text-anchor': i === 0 ? 'start' : i === n ? 'end' : 'middle', fill: 'var(--muted)', 'font-size': 11 }, dlabel(xv, span))); }
      if (opt.marker != null) { var mx = X(ts(opt.marker)); if (mx > L && mx < W - R) { svg.appendChild(el('line', { x1: mx, x2: mx, y1: T, y2: T + ih, stroke: 'var(--muted)', 'stroke-dasharray': '3 4' })); } }
      pts.forEach(function (a, si) {
        var d = a.map(function (p, i) { return (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1); }).join('');
        svg.appendChild(el('path', { d: d, fill: 'none', stroke: series[si].color, 'stroke-width': series[si].width || 1.8, 'stroke-linejoin': 'round', 'stroke-dasharray': series[si].dash || '' }));
      });
      var cross = el('line', { y1: T, y2: T + ih, stroke: 'var(--ink-2)', 'stroke-width': 1, opacity: 0 }); svg.appendChild(cross);
      var dots = series.map(function (s) { var c = el('circle', { r: 3.6, fill: s.color, stroke: 'var(--surface)', 'stroke-width': 1.5, opacity: 0 }); svg.appendChild(c); return c; });
      var hit = el('rect', { x: L, y: T, width: iw, height: ih, fill: 'transparent' }); svg.appendChild(hit);
      function move(ev) {
        var r = svg.getBoundingClientRect(), px = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left) * (W / r.width);
        var xv = x0 + (px - L) / iw * span, lo = 0, hi = xs.length - 1;
        while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (xs[mid] < xv) lo = mid; else hi = mid; }
        var xn = Math.abs(xs[lo] - xv) < Math.abs(xs[hi] - xv) ? xs[lo] : xs[hi], cx = X(xn);
        cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('opacity', .5);
        var rows = '<b>' + fmtDate(xn) + '</b>';
        series.forEach(function (s, i) { var y = maps[i][xn]; if (y == null) { dots[i].setAttribute('opacity', 0); return; } dots[i].setAttribute('cx', cx); dots[i].setAttribute('cy', Y(y)); dots[i].setAttribute('opacity', 1); rows += '<span><i style="background:' + s.color + '"></i>' + s.name + ' <b>' + fmtY(y) + '</b></span>'; });
        tip.innerHTML = rows; tip.hidden = false;
        var tw = tip.offsetWidth, left = cx / W * r.width + 12; if (left + tw > r.width) left = cx / W * r.width - tw - 12; tip.style.left = Math.max(0, left) + 'px'; tip.style.top = '8px';
      }
      function leave() { tip.hidden = true; cross.setAttribute('opacity', 0); dots.forEach(function (d) { d.setAttribute('opacity', 0); }); }
      hit.addEventListener('mousemove', move); hit.addEventListener('touchmove', move, { passive: true }); hit.addEventListener('mouseleave', leave); hit.addEventListener('touchend', leave);
      var old = wrap.querySelector('svg'); if (old) old.remove(); wrap.insertBefore(svg, tip);
    }
    draw();
    if (window.ResizeObserver) { var last = wrap.clientWidth; new ResizeObserver(function () { if (wrap.clientWidth !== last) { last = wrap.clientWidth; draw(); } }).observe(wrap); }
  };
})();
