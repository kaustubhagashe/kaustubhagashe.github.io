/* Book Digitizer – core logic (no DOM). Works in the browser and in Node (for tests). */
(function (root) {
  "use strict";

  /* ---------- Languages: [english name, native name, Vision language hint] ---------- */
  const INDIAN = [
    ["Marathi", "मराठी", "mr"], ["Hindi", "हिन्दी", "hi"], ["Sanskrit", "संस्कृतम्", "hi"],
    ["Konkani", "कोंकणी", "mr"], ["Gujarati", "ગુજરાતી", "gu"], ["Bengali", "বাংলা", "bn"],
    ["Assamese", "অসমীয়া", "as"], ["Odia", "ଓଡ଼ିଆ", "or"], ["Punjabi", "ਪੰਜਾਬੀ", "pa"],
    ["Tamil", "தமிழ்", "ta"], ["Telugu", "తెలుగు", "te"], ["Kannada", "ಕನ್ನಡ", "kn"],
    ["Malayalam", "മലയാളം", "ml"], ["Urdu", "اردو", "ur"], ["Sindhi", "سنڌي", "sd"],
    ["Nepali", "नेपाली", "ne"], ["Kashmiri", "कॉशुर", "hi"], ["Maithili", "मैथिली", "hi"],
    ["Dogri", "डोगरी", "hi"], ["Bodo", "बड़ो", "hi"], ["Santali", "ᱥᱟᱱᱛᱟᱲᱤ", ""],
    ["Manipuri (Meitei)", "ꯃꯦꯇꯩꯂꯣꯟ", ""],
  ];
  const WORLD = [
    ["English", "", "en"], ["Spanish", "Español", "es"], ["French", "Français", "fr"],
    ["German", "Deutsch", "de"], ["Portuguese", "Português", "pt"], ["Italian", "Italiano", "it"],
    ["Russian", "Русский", "ru"], ["Ukrainian", "Українська", "uk"],
    ["Chinese (Simplified)", "中文", "zh"], ["Chinese (Traditional)", "中文 (繁體)", "zh-Hant"],
    ["Japanese", "日本語", "ja"], ["Korean", "한국어", "ko"], ["Arabic", "العربية", "ar"],
    ["Persian", "فارسی", "fa"], ["Turkish", "Türkçe", "tr"], ["Dutch", "Nederlands", "nl"],
    ["Polish", "Polski", "pl"], ["Indonesian", "Bahasa Indonesia", "id"], ["Vietnamese", "Tiếng Việt", "vi"],
    ["Thai", "ไทย", "th"], ["Greek", "Ελληνικά", "el"], ["Hebrew", "עברית", "he"],
    ["Swahili", "Kiswahili", "sw"], ["Sinhala", "සිංහල", "si"],
  ];
  const AUTO = "Auto-detect (mixed languages)";
  const AUTO_HINTS = ["mr", "hi", "en"];

  function languageHints(name) {
    if (name === AUTO) return AUTO_HINTS.slice();
    const row = INDIAN.concat(WORLD).find(r => r[0] === name);
    const h = row && row[2] ? [row[2]] : [];
    if (h.length && name !== "English") h.push("en");
    return h;
  }

  /* ---------- Digits / page numbers ---------- */
  const DEVA = "०१२३४५६७८९";
  const toDeva = s => String(s).replace(/[0-9]/g, d => DEVA[+d]);
  const fromDeva = s => String(s).replace(/[०-९]/g, c => String(DEVA.indexOf(c)));

  function pageNumberFromName(name) {
    const stem = name.replace(/\.[^.]+$/, "");
    const m = fromDeva(stem).match(/\d+/g);
    return m ? parseInt(m[m.length - 1], 10) : null;
  }

  /** files: array of {name}. Returns {pages:[{n,file}], noNumber:[names], duplicates:[n], missing:[n]} */
  function organisePages(files) {
    const pages = [], noNumber = [];
    for (const f of files) {
      const n = pageNumberFromName(f.name);
      (n === null ? noNumber : pages).push(n === null ? f.name : { n, file: f });
    }
    pages.sort((a, b) => a.n - b.n);
    const seen = new Set(), dup = new Set();
    pages.forEach(p => (seen.has(p.n) ? dup : seen).add(p.n));
    const missing = [];
    if (pages.length) for (let i = pages[0].n; i <= pages[pages.length - 1].n; i++) if (!seen.has(i)) missing.push(i);
    return { pages, noNumber, duplicates: [...dup].sort((a, b) => a - b), missing };
  }

  /* ---------- Google Vision response -> structured blocks ---------- */
  function paragraphText(par) {
    let out = "";
    for (const w of par.words || []) {
      for (const s of w.symbols || []) {
        out += s.text || "";
        const t = (((s.property || {}).detectedBreak) || {}).type || "";
        if (t === "SPACE" || t === "SURE_SPACE" || t === "EOL_SURE_SPACE") out += " ";
        else if (t === "LINE_BREAK") out += "\n";
      }
    }
    return out.trim();
  }

  function textToBlocks(text) {
    const raw = text.replace(/^```\w*|```$/gm, "").trim().split(/\n\s*\n/).filter(b => b.trim());
    return raw.map((b, i) => {
      const lines = b.split("\n").map(l => l.trim()).filter(Boolean);
      const joined = lines.join(" ");
      if (lines.length === 1 && /^[0-9\u0966-\u096F\s\-–.]{1,6}$/.test(joined) && i === raw.length - 1)
        return { type: "page_number", align: "center", text: joined };
      if (i === 0 && lines.length === 1 && joined.length < 60 && !/[.।?!]$/.test(joined))
        return { type: "heading", align: "center", text: joined };
      if (lines.length >= 3 && lines.every(l => l.length < 45))
        return { type: "verse", align: "center", text: lines.join("\n") };
      return { type: "paragraph", align: "justify", text: joined };
    });
  }

  function parseVision(resp, fallbackLang) {
    if (resp.error) throw new Error(resp.error.message || "Google Vision error");
    const fta = resp.fullTextAnnotation || {};
    const pars = [], langs = new Set();
    for (const page of fta.pages || []) {
      for (const l of ((page.property || {}).detectedLanguages) || []) if (l.languageCode) langs.add(l.languageCode);
      for (const blk of page.blocks || [])
        for (const par of blk.paragraphs || []) { const t = paragraphText(par); if (t) pars.push(t); }
    }
    return { languages: langs.size ? [...langs] : [fallbackLang], blocks: textToBlocks(pars.join("\n\n")) };
  }

  /* ---------- Script run splitting (Indic vs Latin) for Word fonts ---------- */
  const INDIC = /[\u0900-\u0DFF\uA8E0-\uA8FF\u1CD0-\u1CFF]/;
  const LATIN = /[A-Za-z]/;
  function splitRuns(text) {
    const out = []; let cur = "", curType = null;
    for (const ch of text) {
      const t = INDIC.test(ch) ? true : (LATIN.test(ch) ? false : curType);
      if (curType === null) curType = t !== null ? t : true;
      if (t !== null && t !== curType && cur) { out.push({ indic: curType, text: cur }); cur = ""; }
      if (t !== null) curType = t;
      cur += ch;
    }
    if (cur) out.push({ indic: curType === null ? true : curType, text: cur });
    return out;
  }

  /* ---------- Word document ---------- */
  const PAGE_SIZES = { A5: [8391, 11906], A4: [11906, 16838], B5: [9979, 14175], Letter: [12240, 15840] };
  const DEFAULTS = { indicFont: "Nirmala UI", latinFont: "Times New Roman", bodySize: 13, headingSize: 20,
    subheadingSize: 16, lineSpacing: 1.35, pageSize: "A5", marginCm: 2.0, pageNumbers: true,
    devanagariPageNumbers: true, langTag: "mr-IN" };

  function buildDocument(docx, pages, opts) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    const { Document, Paragraph, TextRun, AlignmentType } = docx;
    const ALIGN = { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED };
    const pt = x => Math.round(x * 20), cm = x => Math.round(x * 567);

    function runs(text, size, bold, italics) {
      const out = [];
      text.split("\n").forEach((line, li) => {
        const segs = splitRuns(line);
        if (!segs.length && li > 0) out.push(new TextRun({ text: "", break: 1 }));
        segs.forEach((r, ri) => {
          const f = r.indic ? o.indicFont : o.latinFont;
          out.push(new TextRun({
            text: r.text, break: li > 0 && ri === 0 ? 1 : undefined,
            font: { ascii: f, hAnsi: f, cs: o.indicFont, eastAsia: o.latinFont },
            size: size * 2, sizeComplexScript: size * 2,
            bold: bold || undefined, boldComplexScript: bold || undefined,
            italics: italics || undefined, italicsComplexScript: italics || undefined,
            language: r.indic ? { bidirectional: o.langTag } : undefined,
          }));
        });
      });
      return out;
    }

    const children = [];
    pages.forEach((page, pi) => {
      let first = true;
      let blocks = (page.blocks || []).filter(b => (b.text || "").trim());
      if (o.pageNumbers) blocks = blocks.filter(b => b.type !== "page_number");
      const mk = (b) => {
        const t = b.type;
        const base = { alignment: ALIGN[b.align] || ALIGN.justify, pageBreakBefore: first && pi > 0,
          spacing: { line: Math.round(240 * o.lineSpacing), after: pt(8) } };
        first = false;
        const text = b.text.trim();
        if (t === "heading") return new Paragraph({ ...base, alignment: ALIGN.center, keepNext: true,
          spacing: { ...base.spacing, after: pt(14) }, children: runs(text, o.headingSize, true, false) });
        if (t === "subheading") return new Paragraph({ ...base, keepNext: true,
          spacing: { ...base.spacing, before: pt(8) }, children: runs(text, o.subheadingSize, true, false) });
        if (t === "verse") return new Paragraph({ ...base, alignment: ALIGN.center,
          spacing: { ...base.spacing, after: pt(10) }, children: runs(text, o.bodySize, false, true) });
        if (t === "list_item") return new Paragraph({ ...base, indent: { left: cm(0.9), hanging: cm(0.5) },
          spacing: { ...base.spacing, after: pt(4) }, children: runs(text, o.bodySize, false, false) });
        if (t === "caption") return new Paragraph({ ...base, spacing: { ...base.spacing, after: pt(6) },
          children: runs(text, o.bodySize - 2, false, true) });
        return new Paragraph({ ...base, children: runs(text, o.bodySize, false, false) });
      };
      blocks.forEach(b => children.push(mk(b)));
      if (o.pageNumbers) {
        let n = String(page.page);
        if (o.devanagariPageNumbers) n = toDeva(n);
        children.push(new Paragraph({ alignment: AlignmentType.CENTER, pageBreakBefore: first && pi > 0,
          spacing: { before: pt(10) }, children: runs(`– ${n} –`, o.bodySize - 2, false, false) }));
      }
    });

    const [w, h] = PAGE_SIZES[o.pageSize] || PAGE_SIZES.A5;
    return new Document({
      creator: "Book Digitizer", title: "Digitised book",
      styles: { default: { document: { run: { font: { ascii: o.latinFont, hAnsi: o.latinFont, cs: o.indicFont, eastAsia: o.latinFont } } } } },
      sections: [{ properties: { page: { size: { width: w, height: h },
        margin: { top: cm(o.marginCm), bottom: cm(o.marginCm), left: cm(o.marginCm), right: cm(o.marginCm) } } }, children }],
    });
  }

  const api = { INDIAN, WORLD, AUTO, languageHints, toDeva, pageNumberFromName, organisePages,
    paragraphText, textToBlocks, parseVision, splitRuns, buildDocument, DEFAULTS, PAGE_SIZES };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BookDigitizerCore = api;
})(typeof window !== "undefined" ? window : globalThis);
