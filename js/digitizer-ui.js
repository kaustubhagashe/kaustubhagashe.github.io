/* Book Digitizer – browser UI. Depends on digitizer-core.js (window.BookDigitizerCore). */
(function () {
  "use strict";
  const C = window.BookDigitizerCore;
  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const LS = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage full/blocked */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
    keys() { try { return Object.keys(localStorage); } catch (e) { return []; } },
  };

  const S = { items: [], results: {}, running: false, stop: false, view: null };
  const BLOCK_TYPES = ["heading", "subheading", "paragraph", "verse", "list_item", "caption", "page_number"];
  const ALIGNS = ["left", "center", "right", "justify"];

  /* ---------- small helpers ---------- */
  function setStatus(el, html, cls) {          // html built only from our own strings; user text goes via textContent
    el.className = "status";
    el.textContent = "";
    if (typeof html === "string") { const s = document.createElement("span"); if (cls) s.className = cls; s.textContent = html; el.appendChild(s); }
    else if (html) el.appendChild(html);
  }
  function listStatus(el, lines) {
    const frag = document.createDocumentFragment();
    lines.forEach(([text, cls]) => { const d = document.createElement("div"); if (cls) d.className = cls; d.textContent = text; frag.appendChild(d); });
    setStatus(el, frag);
  }
  const lang = () => $("lang").value;
  const cacheKey = (item) => `bd1|${item.file.name}|${item.file.size}|${item.file.lastModified}|${lang()}`;

  /* ---------- setup: language list, key ---------- */
  function buildLanguages() {
    const sel = $("lang");
    const auto = document.createElement("option");
    auto.value = C.AUTO; auto.textContent = C.AUTO; sel.appendChild(auto);
    const group = (label, list) => {
      const g = document.createElement("optgroup"); g.label = label;
      list.forEach(([en, native]) => { const o = document.createElement("option"); o.value = en; o.textContent = native ? `${en} — ${native}` : en; g.appendChild(o); });
      sel.appendChild(g);
    };
    group("Indian languages", C.INDIAN);
    group("World languages", C.WORLD);
    sel.value = "Marathi";
  }

  function initKey() {
    const saved = LS.get("bd_key");
    if (saved) { $("apikey").value = saved; $("remember").checked = true; }
    const store = () => { if ($("remember").checked) LS.set("bd_key", $("apikey").value.trim()); else LS.del("bd_key"); };
    $("remember").addEventListener("change", store);
    $("apikey").addEventListener("input", () => { store(); updateRunInfo(); });
    $("origin").textContent = location.origin && location.origin !== "null" ? location.origin + "/*" : "your site address";
  }

  /* ---------- 2. images ---------- */
  function loadFiles(fileList) {
    S.items.forEach((i) => URL.revokeObjectURL(i.url));
    const files = [...fileList].filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|bmp|gif|tiff?|heic|heif)$/i.test(f.name));
    const org = C.organisePages(files);
    S.items = org.pages.map((p) => ({ n: p.n, file: p.file, url: URL.createObjectURL(p.file) }));
    S.results = {};
    $("reviewSection").hidden = true; $("buildSection").hidden = true;

    const lines = [];
    if (S.items.length) lines.push([`${S.items.length} pages found (page ${S.items[0].n} → ${S.items[S.items.length - 1].n})`, "ok"]);
    else lines.push(["No images found in that selection.", "err"]);
    if (org.noNumber.length) lines.push([`Ignored (no page number in the file name): ${org.noNumber.slice(0, 8).join(", ")}${org.noNumber.length > 8 ? " …" : ""}`, "warn"]);
    if (org.duplicates.length) lines.push([`Duplicate page numbers (only the first of each is used): ${org.duplicates.join(", ")}`, "warn"]);
    if (org.missing.length) lines.push([`Missing page numbers: ${org.missing.slice(0, 30).join(", ")}${org.missing.length > 30 ? " …" : ""}`, "warn"]);
    listStatus($("imgStatus"), lines);

    if (org.duplicates.length) { const seen = new Set(); S.items = S.items.filter((i) => !seen.has(i.n) && seen.add(i.n)); }

    const th = $("thumbs"); th.textContent = "";
    S.items.slice(0, 24).forEach((i) => {
      const f = document.createElement("figure"), im = document.createElement("img"), c = document.createElement("figcaption");
      im.src = i.url; im.alt = `Page ${i.n}`; im.loading = "lazy"; c.textContent = `Page ${i.n}`;
      f.append(im, c); th.appendChild(f);
    });

    const has = S.items.length > 0;
    ["fromPage", "toPage"].forEach((id) => { $(id).disabled = !has; });
    if (has) { $("fromPage").value = S.items[0].n; $("toPage").value = S.items[S.items.length - 1].n; }
    updateRunInfo();
  }

  /* ---------- 4. read ---------- */
  function selected() {
    const lo = +$("fromPage").value, hi = +$("toPage").value;
    return S.items.filter((i) => i.n >= lo && i.n <= hi);
  }
  const isCached = (item) => !$("force").checked && !!LS.get(cacheKey(item));

  function updateRunInfo() {
    const sel = selected(), fresh = sel.filter((i) => !isCached(i));
    $("runBtn").disabled = S.running || !S.items.length || !$("apikey").value.trim();
    if (!S.items.length) { $("runInfo").textContent = "Choose images first."; return; }
    let t = `${sel.length} pages selected, ${fresh.length} still to read (${sel.length - fresh.length} already saved in this browser).`;
    if (fresh.length) t += ` This will use ${fresh.length} of your 1,000 free Google Vision pages this month.`;
    if (!$("apikey").value.trim()) t += " Enter your API key in step 1.";
    $("runInfo").textContent = t;
  }

  async function toJpegBase64(file, maxSide = 2400) {
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
    catch (e1) {
      try { bmp = await createImageBitmap(file); }
      catch (e2) { throw new Error("The browser can't open this image (HEIC/HEIF? export it as JPG first)."); }
    }
    const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    if (bmp.close) bmp.close();
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.9));
    const dataUrl = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });
    return dataUrl.split(",")[1];
  }

  function friendlyError(status, j) {
    const msg = (j && j.error && j.error.message) || `HTTP ${status}`;
    if (status === 400 && /api key/i.test(msg)) return "Google rejected the API key. Check that it was copied completely.";
    if (status === 403) return `Access denied by Google: enable the Cloud Vision API and billing, and make sure the key's website restriction includes ${location.origin}/* (${msg})`;
    if (status === 429) return "Google says you've hit a rate or quota limit. Wait a bit and try again.";
    return msg;
  }

  async function callVision(b64, hints, key, attempt = 0) {
    const body = { requests: [{ image: { content: b64 }, features: [{ type: "DOCUMENT_TEXT_DETECTION" }], imageContext: { languageHints: hints } }] };
    let r;
    try {
      r = await fetch("https://vision.googleapis.com/v1/images:annotate?key=" + encodeURIComponent(key),
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } catch (e) {
      throw new Error("Could not reach Google. Check your internet connection, and that the key's website restriction matches this page's address.");
    }
    if ((r.status === 429 || r.status >= 500) && attempt < 2) { await sleep(1500 * (attempt + 1)); return callVision(b64, hints, key, attempt + 1); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(friendlyError(r.status, j));
    return j.responses[0];
  }

  async function run() {
    const key = $("apikey").value.trim();
    const todo = selected();
    if (!key || !todo.length) return;
    S.running = true; S.stop = false;
    $("runBtn").disabled = true; $("stopBtn").hidden = false; $("progressWrap").hidden = false;
    const errors = []; let done = 0; const t0 = Date.now();
    const hints = C.languageHints(lang());

    for (const item of todo) {
      if (S.stop) break;
      setStatus($("runStatus"), `Reading page ${item.n} (${done + 1}/${todo.length})…`);
      try {
        const ck = cacheKey(item), cached = $("force").checked ? null : LS.get(ck);
        let data;
        if (cached) data = JSON.parse(cached);
        else {
          const b64 = await toJpegBase64(item.file);
          data = C.parseVision(await callVision(b64, hints, key), lang());
          LS.set(ck, JSON.stringify(data));
        }
        S.results[item.n] = { page: item.n, key: ck, languages: data.languages, blocks: data.blocks };
      } catch (e) {
        errors.push([`Page ${item.n}: ${e.message}`, "err"]);
        if (/rejected the API key|Access denied/.test(e.message)) break;   // no point continuing
      }
      done++;
      $("progressBar").style.width = (done / todo.length * 100) + "%";
      if (done === 1 || done % 3 === 0) renderReview();
    }

    S.running = false; $("stopBtn").hidden = true; $("runBtn").disabled = false;
    const secs = Math.round((Date.now() - t0) / 1000);
    listStatus($("runStatus"), [[`${S.stop ? "Stopped" : "Finished"}: ${Object.keys(S.results).length} pages ready (${secs}s).`, "ok"], ...errors]);
    renderReview(); updateRunInfo();
  }

  /* ---------- 5. review ---------- */
  function renderReview() {
    const nums = Object.keys(S.results).map(Number).sort((a, b) => a - b);
    $("reviewSection").hidden = !nums.length; $("buildSection").hidden = !nums.length;
    if (!nums.length) return;
    const sel = $("pageSelect"), cur = S.view && nums.includes(S.view) ? S.view : nums[0];
    sel.textContent = "";
    nums.forEach((n) => { const o = document.createElement("option"); o.value = n; o.textContent = `Page ${n}`; sel.appendChild(o); });
    showPage(cur);
  }

  function persist(n) {
    const r = S.results[n];
    LS.set(r.key, JSON.stringify({ languages: r.languages, blocks: r.blocks }));
  }

  function showPage(n) {
    S.view = n;
    const r = S.results[n], item = S.items.find((i) => i.n === n);
    $("pageSelect").value = String(n);
    $("pageImg").src = item ? item.url : "";
    $("detected").textContent = r.languages && r.languages.length ? "Detected: " + r.languages.join(", ") : "";
    const box = $("blocks"); box.textContent = "";
    r.blocks.forEach((b, i) => box.appendChild(blockEl(r, b, i, n)));
    if (!r.blocks.length) { const p = document.createElement("p"); p.className = "hint"; p.textContent = "No text was found on this page. Add a block to type it manually."; box.appendChild(p); }
  }

  function selectEl(options, value, onChange) {
    const s = document.createElement("select");
    options.forEach((o) => { const e = document.createElement("option"); e.value = o; e.textContent = o; s.appendChild(e); });
    s.value = value; s.addEventListener("change", () => onChange(s.value));
    return s;
  }

  function blockEl(r, b, i, n) {
    const wrap = document.createElement("div"); wrap.className = "block";
    const tools = document.createElement("div"); tools.className = "block-tools";
    tools.appendChild(selectEl(BLOCK_TYPES, b.type, (v) => { b.type = v; persist(n); }));
    tools.appendChild(selectEl(ALIGNS, b.align, (v) => { b.align = v; persist(n); }));
    const del = document.createElement("button"); del.type = "button"; del.className = "del"; del.title = "Delete block"; del.textContent = "✕";
    del.addEventListener("click", () => { r.blocks.splice(i, 1); persist(n); showPage(n); });
    tools.appendChild(del);
    const ta = document.createElement("textarea"); ta.value = b.text; ta.lang = "mr";
    const fit = () => { ta.style.height = "auto"; ta.style.height = ta.scrollHeight + 2 + "px"; };
    ta.addEventListener("input", () => { b.text = ta.value; persist(n); fit(); });
    wrap.append(tools, ta);
    requestAnimationFrame(fit);
    return wrap;
  }

  function step(delta) {
    const nums = Object.keys(S.results).map(Number).sort((a, b) => a - b);
    const idx = nums.indexOf(S.view) + delta;
    if (idx >= 0 && idx < nums.length) showPage(nums[idx]);
  }

  /* ---------- 6. Word ---------- */
  async function build() {
    const out = $("buildStatus");
    if (!window.docx) { setStatus(out, "The Word-generation library didn't load (are you offline?). Reload the page and try again.", "err"); return; }
    const nums = Object.keys(S.results).map(Number).sort((a, b) => a - b);
    const pages = nums.map((n) => ({ page: n, blocks: S.results[n].blocks }));
    const lines = [];
    const gaps = selected().filter((i) => !S.results[i.n]).map((i) => i.n);
    try {
      const doc = C.buildDocument(window.docx, pages, {
        pageSize: $("pageSize").value, bodySize: Math.max(9, +$("bodySize").value || 13),
        indicFont: $("indicFont").value.trim() || "Nirmala UI",
        pageNumbers: $("pageNums").checked, devanagariPageNumbers: $("devaNums").checked,
      });
      const blob = await window.docx.Packer.toBlob(doc);
      const url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = "book.docx"; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      lines.push([`Done: book.docx with ${pages.length} pages was downloaded.`, "ok"]);
      if (gaps.length) lines.push([`Not included (not read yet): pages ${gaps.slice(0, 30).join(", ")}`, "warn"]);
    } catch (e) { lines.push([`Could not build the file: ${e.message}`, "err"]); }
    listStatus(out, lines);
  }

  function clearData() {
    if (!confirm("Delete the saved page text (and the remembered API key) from this browser?")) return;
    LS.keys().filter((k) => k.startsWith("bd1|") || k === "bd_key").forEach((k) => LS.del(k));
    S.results = {}; renderReview(); updateRunInfo();
    setStatus($("buildStatus"), "Saved data cleared.", "ok");
  }

  /* ---------- wire up ---------- */
  document.addEventListener("DOMContentLoaded", () => {
    buildLanguages(); initKey();
    $("pickFolder").addEventListener("click", () => $("folderInput").click());
    $("pickFiles").addEventListener("click", () => $("filesInput").click());
    $("folderInput").addEventListener("change", (e) => loadFiles(e.target.files));
    $("filesInput").addEventListener("change", (e) => loadFiles(e.target.files));
    ["fromPage", "toPage", "force", "lang"].forEach((id) => $(id).addEventListener("change", updateRunInfo));
    $("runBtn").addEventListener("click", run);
    $("stopBtn").addEventListener("click", () => { S.stop = true; });
    $("pageSelect").addEventListener("change", (e) => showPage(+e.target.value));
    $("prevPage").addEventListener("click", () => step(-1));
    $("nextPage").addEventListener("click", () => step(1));
    $("addBlock").addEventListener("click", () => {
      const r = S.results[S.view]; if (!r) return;
      r.blocks.push({ type: "paragraph", align: "justify", text: "" }); persist(S.view); showPage(S.view);
    });
    $("buildBtn").addEventListener("click", build);
    $("clearBtn").addEventListener("click", clearData);
    updateRunInfo();
  });
})();
