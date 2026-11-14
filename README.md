# Local helper

A web page cannot save YouTube videos or run Python models by itself, so two pages on the site
(**Projects → YouTube Downloader** and **Projects → Stock Backtesting & Forecasting**) talk to this small
program running on *your own computer*. It only listens on `127.0.0.1` (your machine), and only
accepts requests from `https://kaustubhagashe.github.io` and from `localhost` test copies.

## Start it
* Windows: double-click `start_helper.bat`
* Mac / Linux: `./start_helper.sh`

The first start creates a private Python environment (`.venv`) and installs the packages in `requirements.txt`.
Leave the window open; the website pages show **Helper connected** in green.

## Files
| File | What it does |
| --- | --- |
| `server.py` | The helper itself (Flask). Run it with Python 3.10 - 3.12. |
| `ytdl.py` | YouTube download engine (yt-dlp), enhanced from `Download_Youtube_Video.py`. |
| `stocks.py` | Stock engine, enhanced from `Stock_prediction_including_backtesting.py`. |
| `requirements.txt` | Packages to install. `prophet`, `arch` and `tensorflow` are optional extras (commented out). |

## Notes
* **FFmpeg** (https://ffmpeg.org) lets the downloader combine video and audio for 1080p and above. Without it only qualities that already include sound are offered.
* **Sign-in or "not a bot" errors:** on the YouTube page open *Advanced* and pick your browser, or put a `cookies.txt` next to `server.py`. If YouTube changes, update with `pip install -U yt-dlp` (the start script already does this each time).
* **Stock cache:** downloaded prices are stored in `helper/stock_cache/` and refreshed daily. Delete that folder any time.
* **Changes made to the original stock script:** the forecast window is now automatic (history up to yesterday, forecast from today for 1, 3, 6 or 12 months instead of fixed 2026 dates); the NSE list loads on demand; optional libraries (TensorFlow, Prophet, arch, XGBoost, LightGBM, CatBoost) are used only if installed; the Flask web page was replaced by the website page.
* Another port: `python server.py --port 9000`, then on the website page set the same address in the browser console: `localStorage.setItem('helper-base','http://127.0.0.1:9000')`.
* The tools are for learning. Stock output is not investment advice. Download only videos you are allowed to save.
