# Kaustubh Dattatraya Agashe — personal site

Plain HTML / CSS / JS. No build step, no framework, nothing to install. Hosted on GitHub Pages.

## What's in here

```
index.html … apps.html      pages (About, Projects, Chess, Puzzles, Blog, Advisory, Courses, Library, Apps)
projects/                   Handwriting Digitizer, YouTube Downloader, Stock Backtesting & Forecasting
css/site.css                design system: colours, fonts, sidebar, cards  (edit palettes at the top)
css/chess.css, puzzles.css, tool.css   page-specific styles
js/site.js                  sidebar drawer, theme + palette switcher
js/engine.js                chess evaluation service (Lichess cloud → local Stockfish fallback)
js/chess.js                 chess page: game loading, board, move list, eval bar
js/pz-board.js, queens.js, knights-tour.js   Eight Queens and Knight's Tour puzzles
js/hanoi.js, hangman.js, hangman-data.js   Tower of Hanoi and Hangman (word lists are in hangman-data.js)
js/wall.js + wall/            My Wall (4 sections); add pictures to wall/<section>/ and list them in wall/<section>/list.json (see wall/README.md)
js/games/                   Block Blast, Bubble Shooter, Crossword (+ clue bank), Dots and Boxes, Paper Throw, Tic Tac Toe, Wordle (+ word lists)
js/visitors.js + data/visitors.json   visitor counter (top-right badge); visitors.html = owner statistics page
js/helper-client.js, ytdl.js, stock.js, minichart.js   pages that talk to the local helper
helper/                     small Python program run on YOUR computer for the YouTube + Stock pages (see helper/README.md)
vendor/stockfish/           Stockfish 19 (lite, WASM) served from your own site — GPL-3.0, see COPYING.txt
vendor/chess.js             chess.js 0.10.3 (BSD)
fonts/                      Fraunces + Inter, self-hosted (SIL OFL)
assets/                     your logo: sidebar mark, favicons, app icons, social card
tools/gen.py                optional: regenerates the HTML pages from templates. `LAYOUT=side` (left sidebar) or `LAYOUT=top` (top bar)
```

## Editing

* **Text / pages:** edit the `.html` files directly, or change `tools/gen.py` + `tools/templates/` and run `python3 tools/gen.py` (from the site folder) to regenerate every page.
  `python3 tools/gen.py` to regenerate every page (this keeps the sidebar identical on all pages).
* **Colours:** `css/site.css`, top of file. Default accent is Yellow. Site-name colours are the logo shades (.name in the Home block).
  few lines; dark and bright modes are separate blocks.
* **Logo:** replace the PNGs in `assets/` (keep the file names).

## Chess page

* Games load from Lichess / Chess.com (username is pre-filled) or from an uploaded `.pgn`.
* Engine modes: **Auto** (Lichess cloud, then Stockfish in your browser), **Stockfish only**, **Lichess cloud only**.
* Keyboard: ← → step, Home / End jump, F flips the board.

## Run locally

```
python3 -m http.server 8000
# open http://localhost:8000
```
(Stockfish runs as a Web Worker, so open the site through a local server rather than by double-clicking the file.)

## Visitor counter

Counts are kept online by the free Abacus service under the name in `data/visitors.json`, so redeploying the site never resets them.
Open `https://kaustubhagashe.github.io/visitors.html` to see every page's count and to prepare a fresh `data/visitors.json`.
**Do not overwrite `data/visitors.json` with an older copy** unless you want to go back to that namespace and baseline. `python3 tools/gen.py` never touches it.

## YouTube Downloader and Stock pages

These two pages need the helper in `helper/` running on your own computer (Windows: `start_helper.bat`; Mac/Linux: `./start_helper.sh`).
The pages work on the public site, but only for someone who has started the helper on their own machine.
