#!/usr/bin/env python3
"""
Static page generator for the site.  Run from anywhere:

    python3 tools/gen.py            # (from the site folder)  -> rewrites all *.html

Every page shares one shell (sidebar with the logo, theme controls, drawer), so a
nav change is made ONCE here and regenerated.  The generated HTML is plain and is
what gets deployed; there is no build step on GitHub Pages.
"""
import os, re, sys, html

ROOT = os.path.abspath(os.environ.get("SITE_ROOT") or os.path.join(os.path.dirname(__file__), ".."))
LAYOUT = os.environ.get("LAYOUT", "side")      # "side" = left sidebar, "top" = top navigation bar
TPL = os.path.join(os.path.dirname(__file__), "templates")
NAME = "Kaustubh Dattatraya Agashe"
SHORT = "Kaustubh Agashe"
MOTTO_LA = "Dubito, ergo cogito, ergo sum"
MOTTO_EN = "I doubt, therefore I think, therefore I am"
YEAR = 2026
EMAIL = "kaustubh.agashe@gmail.com"
UPI = "kaustubh.agashe@okicici"

ICONS = {
    "home":     '<path d="M3 11l9-8 9 8"/><path d="M5 9.5V20h5v-6h4v6h5V9.5"/>',
    "about":    '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>',
    "projects": '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    "chess":    '<rect x="3" y="3" width="18" height="18" rx="2.5"/><path d="M3 12h18M12 3v18"/><path d="M3 3h9v9H3zM12 12h9v9h-9z" fill="currentColor" stroke="none" opacity=".35"/>',
    "puzzles":  '<path d="M12 3a2 2 0 0 1 2 2v1h3a1 1 0 0 1 1 1v3h-1a2 2 0 1 0 0 4h1v3a1 1 0 0 1-1 1h-3v-1a2 2 0 1 0-4 0v1H7a1 1 0 0 1-1-1v-3h1a2 2 0 1 0 0-4H6V7a1 1 0 0 1 1-1h3V5a2 2 0 0 1 2-2z"/>',
    "wall":     '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.7"/><path d="M21 16l-5-5L8 19"/>',
    "blog":     '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    "advisory": '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    "courses":  '<path d="M2 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H2z"/><path d="M22 5h-7a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h8z"/>',
    "library":  '<path d="M4 4v16M9 4v16"/><path d="M14 5.5l5 1-3.4 13.8-5-1z"/>',
    "apps":     '<rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/>',
    "sun":      '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    "moon":     '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>',
    "menu":     '<path d="M4 7h16M4 12h16M4 17h16"/>',
    "arrow":    '<path d="M5 12h14M13 6l6 6-6 6"/>',
    "back":     '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    "folder":   '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    "play":     '<path d="M7 4.5v15l12-7.5z"/>',
    "word":     '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13l1.5 5 1.5-4 1.5 4 1.5-5"/>',
    "pen":      '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    "download": '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
    "upload":   '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
    "first":    '<path d="M6 5v14M18 6l-7 6 7 6zM11 6 4 12l7 6z" />',
    "prev":     '<path d="M15 6l-6 6 6 6"/>',
    "next":     '<path d="M9 6l6 6-6 6"/>',
    "last":     '<path d="M18 5v14M6 6l7 6-7 6zM13 6l7 6-7 6z"/>',
    "flip":     '<path d="M7 4v16M3 8l4-4 4 4"/><path d="M17 20V4M13 16l4 4 4-4"/>',
    "eye":      '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    "undo":     '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    "refresh":  '<path d="M20 11a8 8 0 0 0-14.9-3M4 5v4h4"/><path d="M4 13a8 8 0 0 0 14.9 3M20 19v-4h-4"/>',
    "cpu":      '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
    "clock":    '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
}

def icon(name, cls="icon", extra=""):
    return f'<svg class="{cls}" viewBox="0 0 24 24" aria-hidden="true" {extra}>{ICONS[name]}</svg>'

# (key, label, href, icon, live?)
NAV = [
    ("home",     "Home",                "index.html",     "home",     True),
    ("about",    "About",               "about.html",     "about",    False),
    ("projects", "Projects",            "projects.html",  "projects", True),
    ("chess",    "Chess",               "chess.html",     "chess",    True),
    ("puzzles",  "Puzzles &amp; Games",   "puzzles.html",   "puzzles",  True),
    ("wall",     "My Wall",             "wall.html",      "wall",     True),
    ("blog",     "Blog",                "blog.html",      "blog",     False),
    ("advisory", "Investment Advisory", "advisory.html",  "advisory", False),
    ("courses",  "Courses",             "courses.html",   "courses",  False),
    ("library",  "My Library",          "library.html",   "library",  False),
    ("apps",     "My Apps",             "apps.html",      "apps",     True),
]
PALETTES = [("gold", "Yellow"), ("teal", "Green"), ("cobalt", "Blue"), ("ember", "Ember"), ("crimson", "Crimson"), ("violet", "Violet")]

HEAD_BOOT = ('<script>(function(){var r=document.documentElement,t,p;try{t=localStorage.getItem("site-theme");p=localStorage.getItem("site-palette");}catch(e){}'
             'var m={blue:"cobalt",emerald:"teal",amber:"gold"};p=m[p]||p;'
             'r.dataset.theme=(t==="bright")?"bright":"dark";'
             'r.dataset.palette=/^(teal|gold|cobalt|ember|crimson|violet)$/.test(p)?p:"gold";})();</script>')

def shell(*, key, title, body, depth=0, wide=False, head_extra="", scripts_extra="", desc="", body_class=""):
    pre = "../" * depth
    nav = []
    for k, label, href, ic, live in NAV:
        cur = ' aria-current="page"' if k == key else ""
        soon = "" if live else '<span class="soon">Soon</span>'
        nav.append(f'<a href="{pre}{href}" data-key="{k}"{cur}>{icon(ic)}<span>{label}</span>{soon}</a>')
    nav_html = "\n        ".join(nav)
    sw = "\n          ".join(
        f'<button class="swatch" type="button" data-palette="{k}" aria-label="{label} accent" title="{label}" aria-pressed="false"></button>'
        for k, label in PALETTES)
    full_title = f"{title} · {SHORT}" if title != SHORT else f"{NAME} — personal site"
    desc = desc or "Chess, puzzles, tools and notes by Kaustubh Dattatraya Agashe."
    brand = (f'<a class="brand" href="{pre}index.html" aria-label="{NAME} — home" title="{NAME}">'
             f'<span class="brand-mark"><img src="{pre}assets/logo-mark.png" alt="" width="64" height="64"></span></a>')
    ctl = f'''<div class="palette-row"><div class="swatches" role="group" aria-label="Accent colour">{sw}</div></div>
        <div class="palette-row"><button class="mode-btn" type="button" aria-pressed="false" aria-label="Toggle bright and dark mode">{icon("sun", "icon i-sun")}{icon("moon", "icon i-moon")}<span class="mode-text">Bright</span></button></div>'''
    copy = f'<p class="copy">&copy; {YEAR} {NAME}.<br>Hosted on GitHub Pages.</p>'
    if LAYOUT == "top":
        chrome_open = f'''<header class="topnav">
  <div class="topnav-in">
    {brand}
    <nav class="nav" id="nav" aria-label="Main">
        {nav_html}
      <div class="nav-ctl">{ctl}</div>
    </nav>
    <div class="topnav-ctl">{ctl}</div>
    <button class="menu-btn" id="menu-btn" type="button" aria-label="Open menu" aria-controls="nav" aria-expanded="false">{icon("menu")}</button>
  </div>
</header>
<div class="main">'''
        chrome_close = f'''<footer class="foot">&copy; {YEAR} {NAME}. Hosted on GitHub Pages.</footer>
</div>
<div class="scrim" id="scrim"></div>'''
    else:
        chrome_open = f'''<div class="shell">
  <aside class="sidebar" id="sidebar" aria-label="Site">
    {brand}
    <nav class="nav" aria-label="Main">
      <div class="nav-label">Explore</div>
        {nav_html}
    </nav>
    <div class="side-foot">
      {ctl}
      {copy}
    </div>
  </aside>
  <div class="main">
    <header class="topbar">
      <a href="{pre}index.html" aria-label="{NAME} — home"><span class="brand-mark"><img src="{pre}assets/logo-mark-192.png" alt="" width="38" height="38"></span></a>
      <button class="menu-btn" id="menu-btn" type="button" aria-label="Open menu" aria-controls="sidebar" aria-expanded="false">{icon("menu")}</button>
    </header>'''
        chrome_close = '''  </div>
</div>
<div class="scrim" id="scrim"></div>'''
    return f'''<!DOCTYPE html>
<html lang="en" data-theme="dark" data-palette="gold">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{html.escape(full_title)}</title>
  <meta name="description" content="{html.escape(desc)}">
  <meta name="theme-color" content="#1a1712">
  <meta property="og:title" content="{html.escape(full_title)}">
  <meta property="og:description" content="{html.escape(desc)}">
  <meta property="og:image" content="{pre}assets/social-card.png">
  <link rel="icon" href="{pre}assets/favicon.ico" sizes="any">
  <link rel="icon" type="image/png" sizes="32x32" href="{pre}assets/favicon-32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="{pre}assets/favicon-16.png">
  <link rel="icon" type="image/png" sizes="192x192" href="{pre}assets/icon-192.png">
  <link rel="apple-touch-icon" href="{pre}assets/apple-touch-icon.png">
  <link rel="preload" href="{pre}fonts/InterVariable.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="{pre}fonts/Fraunces144pt-SemiBold.woff2" as="font" type="font/woff2" crossorigin>
  {HEAD_BOOT}
  <link rel="stylesheet" href="{pre}css/site.css">
  {head_extra}
</head>
<body class="{body_class}{' layout-top' if LAYOUT == 'top' else ''}">
{chrome_open}
    <main class="page{' wide' if wide else ''}" id="main">
{body}
    </main>
{chrome_close}
<script src="{pre}js/site.js"></script>
<script src="{pre}js/content.js"></script>
<script src="{pre}js/visitors.js"></script>
{scripts_extra}
</body>
</html>
'''

def write(path, content):
    full = os.path.join(ROOT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8") as f:
        f.write(content)
    print("wrote", path)

def tpl(name):
    with open(os.path.join(TPL, name), encoding="utf-8") as f:
        return f.read()

def coming_soon(key, title, blurb, ic):
    return f'''      <div class="page-head">
        <div class="eyebrow">{title}</div>
        <h1>{title}</h1>
        <p class="lede">{blurb}</p>
      </div>
      <div id="md-body" data-md="content/{key}.md">
      <div class="empty">
        <span class="tile-icon chip accent" style="padding:10px;border-radius:12px">{icon(ic)}</span>
        <h3>Coming soon</h3>
        <p>This section is being prepared. Check back shortly — in the meantime, have a look at the <a href="chess.html">chess archive</a> or the <a href="puzzles.html">puzzles</a>.</p>
      </div>
      </div>'''

def build():
    # ---------------- Home ----------------
    tiles = []
    for k, label, href, ic, live in NAV[2:]:
        blurbs = {
            "projects": "Tools and experiments I have built: a handwriting-to-Word digitizer, a YouTube downloader and a stock backtesting and forecasting lab.",
            "chess": "Browse my Lichess and Chess.com games with engine analysis, an evaluation bar and move timings.",
            "puzzles": "Puzzles and games you can play right here: Wordle, Crossword, Bubble Shooter, Block Blast, Tic Tac Toe, Dots and Boxes, Paper Throw and more.",
            "about": "A note on who I am and what I am interested in.",
            "wall": "My art, Ridhima’s and Minal’s art and craft, and a photo album.",
            "blog": "Notes and essays.",
            "advisory": "Investment advisory.",
            "courses": "Courses and teaching material.",
            "library": "Books and reading notes.",
            "apps": "My Android apps: Thought of The Day and PrepPulse.",
        }
        tag = "" if live else '<span class="chip tag" data-soon="%s">Coming soon</span>' % k
        go = f'<span class="go">Open {icon("arrow")}</span>' if live else ""
        tiles.append(f'''        <a class="tile{'' if live else ' is-soon'}" href="{href}">
          <span class="tile-icon">{icon(ic)}</span>
          <h3>{label}</h3>
          <p>{blurbs[k]}</p>{tag}{go}
        </a>''')
    where = "at the top" if LAYOUT == "top" else "on the left"
    home = f'''      <section class="hero">
        <div class="eyebrow">Home</div>
        <h1 class="name" aria-label="{NAME}"><span class="n-g">Kaustubh</span> <span class="n-y">Dattatraya</span> <span class="n-b">Agashe</span></h1>
        <p class="lede">Welcome to my site. Pick a section {where}, or start below.</p>
        <p class="motto"><q>{MOTTO_LA}</q> <span>— “{MOTTO_EN}”</span></p>
      </section>
      <div class="section-title"><h2>Explore</h2><span>{len(NAV)-2} sections</span></div>
      <div class="grid">
{chr(10).join(tiles)}
      </div>'''
    write("index.html", shell(key="home", title=SHORT, body=home))

    # ---------------- Placeholder sections ----------------
    soon = {
        "about":    ("About", "A note on who I am and what I am interested in.", "about"),
        "blog":     ("Blog", "Notes, essays and write-ups.", "blog"),
        "advisory": ("Investment Advisory", "Perspectives on investing and advisory work.", "advisory"),
        "courses":  ("Courses", "Teaching material and course notes.", "courses"),
        "library":  ("My Library", "Books I own, read and recommend.", "library"),
    }
    for k, (t, b, ic) in soon.items():
        body = coming_soon(k, t, b, ic)
        if k == "about":
            body += f'''
      <p class="contact">Contact me at: <a href="mailto:{EMAIL}">{EMAIL}</a></p>'''
        write(f"{k}.html", shell(key=k, title=t, body=body, desc=b))

    # ---------------- My Apps ----------------
    apps_html = '''      <div class="page-head">
        <div class="eyebrow">Android</div>
        <h1>My Apps</h1>
        <p class="lede">Two Android apps I have built and published on Google Play.</p>
      </div>
      <div class="app-grid">
        <article class="app-card">
          <div class="app-logo wide"><img src="assets/apps/totd.png" alt="Thought of The Day logo: a cloud with a face and a rising sun" width="1019" height="387" loading="lazy"></div>
          <div class="app-body">
            <h2>Thought of The Day <span class="chip">TOTD</span></h2>
            <p class="app-tag">One good thought, every day.</p>
            <p>A calm daily pause: open the app for a fresh thought to start your morning with a clearer, brighter mind.</p>
            <a class="btn btn-primary" href="https://play.google.com/store/apps/details?id=com.app.totd_app" target="_blank" rel="noopener">Get it on Google Play</a>
          </div>
        </article>
        <article class="app-card">
          <div class="app-logo square"><img src="assets/apps/preppulse.png" alt="PrepPulse logo: a graduate with a book beside a rising arrow and a pulse line" width="640" height="640" loading="lazy"></div>
          <div class="app-body">
            <h2>PrepPulse</h2>
            <p class="app-tag">Prepare smarter. Feel the pulse of your progress.</p>
            <p>Built for students and exam aspirants who want focused preparation and a clear sense of how they are improving, day by day.</p>
            <a class="btn btn-primary" href="https://play.google.com/store/apps/details?id=com.preppulse.app" target="_blank" rel="noopener">Get it on Google Play</a>
          </div>
        </article>
      </div>
      <div id="md-body" data-md="content/apps.md"></div>'''
    write("apps.html", shell(key="apps", title="My Apps", body=apps_html, desc="Android apps by Kaustubh Agashe: Thought of The Day and PrepPulse."))

    # ---------------- Projects ----------------
    projects = f'''      <div class="page-head">
        <div class="eyebrow">Projects</div>
        <h1>Things I have built</h1>
        <p class="lede">Tools and experiments. Each project has its own page.</p>
      </div>
      <div class="grid">
        <a class="tile" href="projects/handwriting-digitizer.html">
          <span class="tile-icon">{icon("pen")}</span>
          <h3>Handwriting Digitizer</h3>
          <p>Turn photos of handwritten pages (Marathi, Hindi, Sanskrit and other Indian languages) into a formatted Word document. Runs in your browser.</p>
          <div class="tags"><span class="chip">OCR</span><span class="chip">Marathi</span><span class="chip">Word (.docx)</span></div>
          <span class="go">Open tool {icon("arrow")}</span>
        </a>
        <a class="tile" href="projects/youtube-downloader.html">
          <span class="tile-icon">{icon("download")}</span>
          <h3>YouTube Downloader</h3>
          <p>Paste a link, pick a quality such as 360p or 720p, choose a folder and download with live progress. Uses a small helper on your computer.</p>
          <div class="tags"><span class="chip">yt-dlp</span><span class="chip">Python helper</span></div>
          <span class="go">Open tool {icon("arrow")}</span>
        </a>
        <a class="tile" href="projects/stock-forecast.html">
          <span class="tile-icon">{icon("advisory")}</span>
          <h3>Stock Backtesting &amp; Forecasting</h3>
          <p>Choose any NSE stock and compare 20+ forecasting models, backtested on unseen data, with the best model picked on validation only.</p>
          <div class="tags"><span class="chip">Machine learning</span><span class="chip">Backtesting</span><span class="chip">NSE</span></div>
          <span class="go">Open tool {icon("arrow")}</span>
        </a>
      </div>'''
    write("projects.html", shell(key="projects", title="Projects", body=projects,
                                 desc="Tools and experiments by Kaustubh Agashe."))

    # ---------------- Digitizer (sub-page of Projects) ----------------
    dig = tpl("digitizer.body.html")
    dig = re.sub(r'\{\{icon:(\w+)\}\}', lambda m: icon(m.group(1)), dig)
    write("projects/handwriting-digitizer.html", shell(
        key="projects", title="Handwriting Digitizer", body=dig, depth=1,
        head_extra='<link rel="stylesheet" href="../css/tool.css">\n  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;600&display=swap">',
        scripts_extra='<script src="https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js"></script>\n<script src="../js/digitizer-core.js"></script>\n<script src="../js/digitizer-ui.js"></script>',
        body_class="tool-page", desc="Convert photos of handwritten Marathi, Hindi and Sanskrit pages into a Word document."))

    # ---------------- YouTube Downloader ----------------
    yt = re.sub(r'\{\{icon:(\w+)\}\}', lambda m: icon(m.group(1)), tpl("ytdl.body.html"))
    write("projects/youtube-downloader.html", shell(
        key="projects", title="YouTube Downloader", body=yt, depth=1,
        head_extra='<link rel="stylesheet" href="../css/tool.css">',
        scripts_extra='<script src="../js/helper-client.js"></script>\n<script src="../js/ytdl.js"></script>',
        body_class="tool-page", desc="Download a YouTube video in the quality you choose, with live progress."))

    # ---------------- Stock Backtesting & Forecasting ----------------
    st = re.sub(r'\{\{icon:(\w+)\}\}', lambda m: icon(m.group(1)), tpl("stock.body.html"))
    write("projects/stock-forecast.html", shell(
        key="projects", title="Stock Backtesting and Forecasting", body=st, depth=1,
        head_extra='<link rel="stylesheet" href="../css/tool.css">',
        scripts_extra='<script src="../js/helper-client.js"></script>\n<script src="../js/minichart.js"></script>\n<script src="../js/stock.js"></script>',
        body_class="tool-page tool-wide", desc="Backtest and forecast NSE stocks with many models."))

    # ---------------- Visitor statistics (not in the menu) ----------------
    PAGE_KEYS = ["home", "about", "projects", "projects-handwriting-digitizer", "projects-youtube-downloader", "projects-stock-forecast",
                 "chess", "puzzles", "wall", "blog", "advisory", "courses", "library", "apps"]
    vs = f'''      <div class="page-head">
        <div class="eyebrow">Site owner</div>
        <h1>Visitor statistics</h1>
        <p class="lede">Live counts for every page. Counter name: <code id="vc-ns">…</code>. Visiting this page does not add to any count.</p>
      </div>
      <div class="card">
        <table class="vc-table"><thead><tr><th>Page</th><th class="num">Live count</th><th class="num">Baseline</th><th class="num">Shown on site</th></tr></thead>
        <tbody id="vc-rows" data-pages="{",".join(PAGE_KEYS)}"></tbody></table>
      </div>
      <div class="card" style="margin-top:18px">
        <h3>Keep a record in the site files</h3>
        <p class="hint">Counts live online, so a redeploy never resets them. These buttons prepare a new <code>data/visitors.json</code> for you to paste on GitHub.</p>
        <div class="btn-row" style="display:flex;gap:10px;flex-wrap:wrap;margin:12px 0">
          <button id="vc-record" class="btn btn-primary" type="button">Record today’s figures</button>
          <button id="vc-fresh" class="btn" type="button">Start a fresh counter from these totals</button>
          <button id="vc-copy" class="btn" type="button">Copy</button>
        </div>
        <p id="vc-msg" class="hint" role="status"></p>
        <textarea id="vc-json" class="vc-json" spellcheck="false" readonly></textarea>
      </div>'''
    write("visitors.html", shell(key="visitors", title="Visitor statistics", body=vs, desc="Visitor statistics.",
                                 scripts_extra='<script src="js/visitors-admin.js"></script>'))

    # ---------------- Puzzles ----------------
    pz = tpl("puzzles.body.html")
    pz = re.sub(r'\{\{icon:(\w+)\}\}', lambda m: icon(m.group(1)), pz)
    write("puzzles.html", shell(
        key="puzzles", title="Puzzles & Games", body=pz,
        head_extra='<link rel="stylesheet" href="css/puzzles.css">\n  <link rel="stylesheet" href="css/games.css">',
        scripts_extra='<script src="js/games/core.js"></script>\n<script src="js/games/tictactoe.js"></script>\n<script src="js/games/dots-boxes.js"></script>\n<script src="js/games/block-blast.js"></script>\n<script src="js/games/bubble-shooter.js"></script>\n<script src="js/games/paper-throw.js"></script>\n<script src="js/games/crossword-data.js"></script>\n<script src="js/games/crossword.js"></script>\n<script src="js/games/wordle-words.js"></script>\n<script src="js/games/wordle.js"></script>\n<script src="js/number-game.js"></script>\n<script src="js/pz-board.js"></script>\n<script src="js/queens.js"></script>\n<script src="js/knights-tour.js"></script>\n<script src="js/hanoi.js"></script>\n<script src="js/hangman-data.js"></script>\n<script src="js/hangman.js"></script>\n<script src="js/puzzles.js"></script>',
        desc="Puzzles and games to play in the browser: Wordle, Crossword, Bubble Shooter, Block Blast, Tic Tac Toe and more."))


    # ---------------- My Wall ----------------
    wl = '''      <div class="page-head">
        <div class="eyebrow">For leisure</div>
        <h1>My Wall</h1>
        <p class="lede">A pinboard of art, craft and memories. Pick a section below.</p>
      </div>
      <div id="wall-tabs" class="wall-tabs" role="tablist" aria-label="Wall sections"></div>
      <div id="wall-sections"></div>
      <div class="wall-lb" id="wall-lb" hidden role="dialog" aria-modal="true" aria-label="Picture viewer">
        <button class="wall-x" id="wall-close" type="button" aria-label="Close">&times;</button>
        <button class="wall-nav prev" id="wall-prev" type="button" aria-label="Previous">''' + icon("prev") + '''</button>
        <figure><img id="wall-img" alt=""><figcaption id="wall-cap"></figcaption></figure>
        <button class="wall-nav next" id="wall-next" type="button" aria-label="Next">''' + icon("next") + '''</button>
      </div>'''
    write("wall.html", shell(
        key="wall", title="My Wall", body=wl,
        head_extra='<link rel="stylesheet" href="css/wall.css">',
        scripts_extra='<script src="js/wall.js"></script>',
        desc="Art, craft and photos by the Agashe family."))

    # ---------------- Chess ----------------
    ch = tpl("chess.body.html")
    ch = re.sub(r'\{\{icon:(\w+)\}\}', lambda m: icon(m.group(1)), ch)
    write("chess.html", shell(
        key="chess", title="Chess", body=ch, wide=True,
        head_extra='<link rel="stylesheet" href="css/chess.css">',
        scripts_extra='<script src="vendor/chess.js"></script>\n<script src="js/engine.js"></script>\n<script src="js/chess.js"></script>',
        desc="Browse Lichess and Chess.com games with Stockfish analysis, an evaluation bar and move timings."))

    # ---------------- Redirect + 404 ----------------
    write("book-digitizer.html", '''<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=projects/handwriting-digitizer.html">
<link rel="canonical" href="projects/handwriting-digitizer.html"><title>Redirecting…</title></head>
<body><p>This page moved to <a href="projects/handwriting-digitizer.html">Projects / Handwriting Digitizer</a>.</p></body></html>
''')
    nf = f'''      <div class="page-head">
        <div class="eyebrow">404</div>
        <h1>That page isn’t here</h1>
        <p class="lede">The link may be old or mistyped. Try the menu, or head back <a href="/">home</a>.</p>
      </div>'''
    # absolute-ish: GitHub Pages serves 404.html from any depth, so use root-relative assets via <base>
    page = shell(key="", title="Page not found", body=nf)
    page = page.replace("<head>", '<head>\n  <base href="/">', 1)
    write("404.html", page)
    write(".nojekyll", "")

if __name__ == "__main__":
    build()
