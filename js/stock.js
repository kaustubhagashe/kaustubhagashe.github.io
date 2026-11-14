// Stock Backtesting & Forecasting page: talks to the local helper (helper/server.py -> stocks.py).
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var H = window.Helper, helper = null, loadedTickers = false, all = [], poll = null, tick = null, startMs = 0, running = false, result = null, sortKey = 'val', sortDir = -1;
  var FALLBACK = ['ADANIENT', 'ADANIPORTS', 'APOLLOHOSP', 'ASIANPAINT', 'AXISBANK', 'BAJAJ-AUTO', 'BAJAJFINSV', 'BAJFINANCE', 'BHARTIARTL', 'BPCL', 'BRITANNIA', 'CIPLA', 'COALINDIA', 'DIVISLAB', 'DRREDDY', 'EICHERMOT', 'GRASIM', 'HCLTECH', 'HDFCBANK', 'HDFCLIFE', 'HEROMOTOCO', 'HINDALCO', 'HINDUNILVR', 'ICICIBANK', 'INDUSINDBK', 'INFY', 'ITC', 'JSWSTEEL', 'KOTAKBANK', 'LT', 'M&M', 'MARUTI', 'NESTLEIND', 'NTPC', 'ONGC', 'POWERGRID', 'RELIANCE', 'SBILIFE', 'SBIN', 'SUNPHARMA', 'TATACONSUM', 'TATASTEEL', 'TCS', 'TECHM', 'TITAN', 'ULTRACEMCO', 'UPL', 'WIPRO'].map(function (s) { return s + '.NS'; });
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { } return null; }
  function num(v, d) { return (v == null || isNaN(v)) ? '—' : Number(v).toLocaleString('en-IN', { minimumFractionDigits: d || 0, maximumFractionDigits: d == null ? 2 : d }); }
  function inr(v) { return '₹' + num(v, 2); }
  function pct(v) { return (v > 0 ? '+' : '') + num(v, 2) + '%'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function sym(t) { return t.replace(/\.NS$/, ''); }

  // ---------- stock list ----------
  function fillList() {
    var q = $('st-search').value.trim().toUpperCase(), sel = $('st-select'), keep = sel.value || store('stock-last') || 'RELIANCE.NS';
    var list = all.filter(function (t) { return !q || t.indexOf(q) > -1; });
    sel.innerHTML = list.map(function (t) { return '<option value="' + esc(t) + '">' + esc(sym(t)) + '</option>'; }).join('');
    if (!list.length) sel.innerHTML = '<option value="">No match</option>';
    else sel.value = list.indexOf(keep) > -1 ? keep : (q && list.indexOf(q + '.NS') > -1 ? q + '.NS' : list[0]);
    $('st-count').textContent = all.length + ' stocks available' + (q ? ' · ' + list.length + ' match “' + q + '”' : '') + (!loadedTickers ? ' (short offline list; the full NSE list loads once the helper is running)' : '');
    refresh();
  }
  function refresh() { $('st-run').disabled = !helper || running || !$('st-select').value; $('st-dl').disabled = !!helper && !helper.stocks.optional.tensorflow; }
  all = FALLBACK.slice(); fillList();
  $('st-search').addEventListener('input', fillList);
  $('st-select').addEventListener('change', function () { store('stock-last', this.value); });

  H.watch(function (ok, h) {
    helper = ok && h.stocks && h.stocks.available ? h : null; refresh();
    if (helper && !loadedTickers) {
      loadedTickers = true;
      H.get('/api/stock/tickers', 120000).then(function (r) { if (r.tickers && r.tickers.length) { all = r.tickers; fillList(); } }).catch(function () { loadedTickers = false; });
    }
    if (helper) H.get('/api/stock/status').then(function (s) { if (s.progress > 0 && !s.completed && !running) begin(); }).catch(function () { });
    if (helper && !helper.stocks.optional.tensorflow) $('st-dl').parentNode.title = 'TensorFlow is not installed; run: pip install tensorflow';
  });

  // ---------- run ----------
  function setBar(p, text) { $('st-fill').style.width = p + '%'; $('st-bar').setAttribute('aria-valuenow', Math.round(p)); $('st-pct').textContent = Math.round(p) + '%'; if (text) $('st-msg').textContent = text; }
  function stop() { clearInterval(poll); clearInterval(tick); poll = tick = null; running = false; refresh(); }
  function begin() {
    running = true; refresh(); $('st-error').hidden = true; $('st-prog').hidden = false; $('st-results').hidden = true;
    startMs = Date.now();
    tick = setInterval(function () { $('st-run').textContent = 'Running: ' + H.fmtClock((Date.now() - startMs) / 1000); }, 500);
    poll = setInterval(update, 1500); update();
  }
  $('st-run').addEventListener('click', function () {
    var t = $('st-select').value; if (!t) return;
    store('stock-last', t); $('st-run').disabled = true; setBar(1, 'Starting…');
    H.post('/api/stock/start', { ticker: t, horizon_months: +$('st-horizon').value, deep_learning: $('st-dl').checked && !$('st-dl').disabled }).then(function () { begin(); })
      .catch(function (e) { var b = e.status === 409; if (b) { begin(); return; } var m = $('st-error'); m.textContent = e.message; m.hidden = false; $('st-prog').hidden = true; refresh(); });
  });
  function update() {
    H.get('/api/stock/status', 10000).then(function (s) {
      setBar(s.progress || 0, s.message);
      if (!s.completed) return;
      stop();
      if (s.error) { var m = $('st-error'); m.textContent = hint(s.error); m.hidden = false; $('st-prog').hidden = true; return; }
      setBar(100, 'Complete'); render(s.result);
    }).catch(function () { });
  }
  function hint(e) { return /No data returned|Yahoo/i.test(e) ? e + ' Yahoo Finance may be busy or may not list this symbol. Try another stock or try again in a minute.' : e; }

  // ---------- results ----------
  function render(r) {
    result = r; var best = r.best_model, mr = r.model_results, names = Object.keys(mr), d = r.dataset_info, fw = r.forecast_window || {};
    $('sr-ticker').textContent = sym(r.ticker);
    var passed = (r.validation_gated_models || []).length;
    $('sr-summary').innerHTML =
      '<div class="best-card"><span class="chip accent">Selected model</span><h3>' + esc(best) + '</h3><p>' + esc(mr[best].metrics.Type || '') + '</p></div>' +
      (r.selection_is_fallback ? '<p class="result-warn"><strong>Low confidence.</strong> No model passed every validation quality check, so the model with the best validation score was picked instead. Treat the forecast with extra caution.</p>' : '<p class="hint">' + passed + ' of ' + names.length + ' models passed all validation quality checks.</p>') +
      '<dl class="stat-grid">' +
      stat('Models compared', names.length) + stat('History used', d.raw_start_date + ' → ' + d.raw_end_date) + stat('Trading days', num(d.total_points)) +
      stat('Train / validation / test', d.train_count + ' / ' + d.validation_count + ' / ' + d.test_count) + stat('Test period', d.test_start_date + ' → ' + d.test_end_date) +
      stat('Forecast window', (fw.forecast_start || d.future_start_date) + ' → ' + (fw.forecast_end || d.future_end_date)) + '</dl>' +
      '<p class="hint">' + esc(r.selection_basis || '') + (r.generated_at ? ' Generated ' + esc(r.generated_at) + '.' : '') + '</p>';
    var sel = $('sr-model'); sel.innerHTML = names.sort(function (a, b) { return a === best ? -1 : b === best ? 1 : a.localeCompare(b); }).map(function (n) { return '<option value="' + esc(n) + '">' + esc(n) + (n === best ? ' (selected)' : '') + '</option>'; }).join('');
    sel.onchange = function () { charts(sel.value); };
    charts(best); table(); importance(r);
    $('st-results').hidden = false; $('st-results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function stat(k, v) { return '<div><dt>' + k + '</dt><dd>' + esc(v) + '</dd></div>'; }

  function equity(comp) {
    var dates = [comp[0].Date], eq = [100], bh = [100], last = 0;
    for (var i = 1; i < comp.length; i++) {
      var prev = comp[i - 1].Actual, p = Math.sign(comp[i].Forecast - prev), ret = (comp[i].Actual - prev) / prev, turn = Math.abs(p - last);
      eq.push(eq[i - 1] * (1 + p * ret - turn * 0.0005)); bh.push(comp[i].Actual / comp[0].Actual * 100); dates.push(comp[i].Date); last = p;
    }
    return { dates: dates, eq: eq, bh: bh };
  }
  var cs = function (v) { var s = getComputedStyle(document.documentElement); return s.getPropertyValue(v).trim() || '#888'; };
  function charts(name) {
    var m = result.model_results[name], comp = m.comparison, fut = m.future;
    var acc = cs('--accent'), ink = cs('--ink-2'), warn = cs('--warn');
    MiniChart($('ch-test'), { label: 'Forecast versus actual', yFormat: function (v) { return '₹' + num(v, 0); }, height: 300, series: [
      { name: 'Actual', color: ink, data: comp.map(function (c) { return [c.Date, c.Actual]; }), width: 1.6 },
      { name: name + ' forecast', color: acc, data: comp.map(function (c) { return [c.Date, c.Forecast]; }), width: 1.6 }] });
    var e = equity(comp);
    MiniChart($('ch-equity'), { label: 'Strategy versus buy and hold', yFormat: function (v) { return num(v, 0); }, height: 260, series: [
      { name: 'Buy & hold', color: ink, data: e.dates.map(function (d, i) { return [d, e.bh[i]]; }) },
      { name: 'Model signals', color: acc, data: e.dates.map(function (d, i) { return [d, e.eq[i]]; }), width: 2 }] });
    var lastActual = comp[comp.length - 1], first = fut[0], end = fut[fut.length - 1], prices = fut.map(function (f) { return f.Price; });
    var chg = (end.Price / lastActual.Actual - 1) * 100;
    $('sr-future-stats').innerHTML = stat('Last price in data (' + lastActual.Date + ')', inr(lastActual.Actual)) + stat('Forecast for ' + end.Date, inr(end.Price) + ' (' + pct(chg) + ')') +
      stat('Highest forecast', inr(Math.max.apply(null, prices))) + stat('Lowest forecast', inr(Math.min.apply(null, prices)));
    MiniChart($('ch-future'), { label: 'Future forecast', marker: first.Date, yFormat: function (v) { return '₹' + num(v, 0); }, height: 280, series: [
      { name: 'Recent actual', color: ink, data: comp.slice(-120).map(function (c) { return [c.Date, c.Actual]; }) },
      { name: name + ' forecast', color: warn, dash: '5 4', data: [[lastActual.Date, lastActual.Actual]].concat(fut.map(function (f) { return [f.Date, f.Price]; })), width: 2 }] });
    Array.prototype.forEach.call($('sr-table').querySelectorAll('tbody tr'), function (tr) { tr.classList.toggle('is-sel', tr.dataset.m === name); });
  }

  var COLS = [['model', 'Model', null], ['val', 'Val. score', 1], ['rmse', 'RMSE', 2], ['mape', 'MAPE %', 2], ['r2', 'R²', 3], ['dir', 'Direction %', 1], ['ret', 'Backtest return %', 1], ['sharpe', 'Sharpe', 2], ['dd', 'Max drawdown %', 1], ['trades', 'Trades', 0], ['gates', 'Gates', null]];
  function rows() {
    return Object.keys(result.model_results).map(function (n) {
      var m = result.model_results[n].metrics;
      return { name: n, type: m.Type, val: m.ValidationSelectionScore, rmse: m.RMSE, mape: m.MAPE, r2: m.R2, dir: m.DirAcc, ret: m.BacktestReturn, sharpe: m.Sharpe, dd: m.MaxDrawdown, trades: m.TradeEvents, gates: m.ValidationPassesGates ? 1 : 0, model: n };
    });
  }
  function table() {
    var t = $('sr-table'), data = rows(), best = result.best_model;
    data.sort(function (a, b) { var x = a[sortKey], y = b[sortKey]; return (typeof x === 'string' ? x.localeCompare(y) : (x - y)) * sortDir; });
    t.innerHTML = '<thead><tr>' + COLS.map(function (c) { return '<th data-k="' + c[0] + '" class="' + (c[0] === sortKey ? 'sorted' : '') + '">' + c[1] + (c[0] === sortKey ? (sortDir > 0 ? ' ▲' : ' ▼') : '') + '</th>'; }).join('') + '</tr></thead><tbody>' +
      data.map(function (r) {
        return '<tr data-m="' + esc(r.name) + '"><td class="m-name">' + (r.name === best ? '★ ' : '') + esc(r.name) + '<small>' + esc((r.type || '').replace(' Models', '')) + '</small></td>' +
          COLS.slice(1, 10).map(function (c) { return '<td class="num">' + num(r[c[0]], c[2]) + '</td>'; }).join('') + '<td class="num">' + (r.gates ? '✓' : '✗') + '</td></tr>';
      }).join('') + '</tbody>';
    Array.prototype.forEach.call(t.querySelectorAll('th'), function (th) { th.onclick = function () { var k = th.dataset.k; if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = k === 'model' ? 1 : -1; } table(); charts($('sr-model').value); }; });
    Array.prototype.forEach.call(t.querySelectorAll('tbody tr'), function (tr) { tr.onclick = function () { $('sr-model').value = tr.dataset.m; charts(tr.dataset.m); }; });
  }
  function importance(r) {
    var box = $('sr-imp'), list = r.top_feature_importance || [];
    if (!list.length) { box.hidden = true; return; }
    var max = Math.max.apply(null, list.map(function (x) { return x.Importance; })) || 1;
    box.innerHTML = '<h3 class="sr-h" style="margin-top:0">What drove the ' + esc(r.feature_importance_model) + ' model</h3><p class="hint">Share of the model’s decisions explained by each input (price, trend, momentum, volatility, volume and calendar indicators).</p>' +
      list.map(function (x) { return '<div class="imp-row"><span>' + esc(x.Feature) + '</span><div class="imp-bar"><i style="width:' + (x.Importance / max * 100) + '%"></i></div><b>' + num(x.Importance, 1) + '%</b></div>'; }).join('');
    box.hidden = false;
  }
  // redraw charts on theme/accent change
  new MutationObserver(function () { if (result && !$('st-results').hidden) charts($('sr-model').value); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-palette'] });
})();
