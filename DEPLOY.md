# Deploying to GitHub Pages

Your site address will be **https://kaustubhagashe.github.io/** — this needs a repository named exactly
`kaustubhagashe.github.io` under your GitHub account (replace `kaustubhagashe` if your username differs).

## Option A — in the browser (no Git needed)

1. Sign in at github.com → **+** (top right) → **New repository**.
2. Repository name: `kaustubhagashe.github.io` · visibility **Public** · **Create repository**.
3. Unzip the downloaded zip on your computer. Open the unzipped folder so you can see `index.html`, `css`, `js` …
4. In the new repository click **uploading an existing file**. Drag in **everything inside the folder**
   (the contents, not the folder itself — `index.html` must end up at the top level). Include the hidden `.nojekyll`
   file if your system shows it; the site also works without it.
   *If the drag-and-drop skips folders, use Option B.*
5. Scroll down → **Commit changes**.
6. Go to **Settings → Pages**. Under *Build and deployment* set **Source: Deploy from a branch**,
   **Branch: `main`**, folder **`/ (root)`** → **Save**.
7. Wait 1–2 minutes, then open https://kaustubhagashe.github.io/ (hard-refresh with Ctrl/Cmd + Shift + R).

## Option B — command line (best for later updates)

```bash
unzip kaustubhagashe.github.io.zip
cd kaustubhagashe.github.io
git init -b main
git add .
git commit -m "New site design"
git remote add origin https://github.com/kaustubhagashe/kaustubhagashe.github.io.git
git push -u origin main --force      # --force only because you are replacing the old site
```
Then do step 6 above (Settings → Pages) if Pages is not already switched on.

**Replacing your existing site:** clone your current repo, delete its old files, copy the new files in, then
`git add -A && git commit -m "New site design" && git push`.

## After it is live

* **Favicon not updating?** Browsers cache tab icons hard. Hard-refresh, or open the site in a private window.
* **Handwriting Digitizer:** in Google Cloud Console, set the API key's *Website restriction* to
  `https://kaustubhagashe.github.io/*` (the page shows this address for you).
* **Chess page:** works as-is. If Lichess shows "rate-limiting", wait a minute and press *Load games* again.
* **Custom domain (optional):** Settings → Pages → *Custom domain*.
* **Updating later:** edit a file on GitHub (pencil icon) or push with Git; the site rebuilds in about a minute.

## Redeploying the whole site (visitor counter)

1. The live visitor counts are **not stored in the repository**; they live online, so uploading a new copy of the site does not reset them.
2. Before replacing files, open `https://kaustubhagashe.github.io/visitors.html`, press **Record today's figures** and paste the result into `data/visitors.json` of the NEW copy (this keeps a written record). If you skip this, nothing breaks.
3. Keep the same `namespace` in `data/visitors.json`. Changing it starts a new counter from `baseline` (use **Start a fresh counter** on the statistics page if you ever need that).
4. Upload everything, including the `data/` folder, `helper/` and `wall/` folders, and commit.
