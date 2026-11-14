#!/usr/bin/env python3
"""
Local helper for kaustubhagashe.github.io

Runs on YOUR computer (127.0.0.1 only) and does the jobs a web page cannot do by itself:
  * YouTube Downloader  -> uses yt-dlp, shows progress, saves to a folder you choose
  * Stock Backtesting & Forecasting -> runs the Python models from Stock_prediction_including_backtesting.py

Start it with start_helper.bat (Windows) or ./start_helper.sh (Mac / Linux), then keep the
window open while you use the two project pages on the website.
"""
import argparse
import importlib.util
import os
import re
import sys

from flask import Flask, jsonify, request

HERE = os.path.dirname(os.path.abspath(__file__))
VERSION = "1.0"
DEFAULT_ORIGINS = {"https://kaustubhagashe.github.io"}
LOCAL_ORIGIN = re.compile(r"^http://(localhost|127\.0\.0\.1)(:\d+)?$")

app = Flask(__name__)
CONFIG = {"cookies": None, "origins": set(DEFAULT_ORIGINS)}


def _origin_ok(origin):
    return bool(origin) and (origin in CONFIG["origins"] or bool(LOCAL_ORIGIN.match(origin)))


@app.before_request
def guard():
    origin = request.headers.get("Origin")
    if origin and not _origin_ok(origin):
        return jsonify(error="This website is not allowed to use the helper."), 403
    if request.method == "OPTIONS":
        return "", 204
    if request.method == "POST" and not request.is_json:
        return jsonify(error="JSON body required."), 415


@app.after_request
def cors(resp):
    origin = request.headers.get("Origin")
    if _origin_ok(origin):
        resp.headers["Access-Control-Allow-Origin"] = origin
        resp.headers["Vary"] = "Origin"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        resp.headers["Access-Control-Allow-Private-Network"] = "true"
    resp.headers["Cache-Control"] = "no-store"
    return resp


def _has(module):
    try:
        return importlib.util.find_spec(module) is not None
    except Exception:
        return False


STOCK_REQUIRED = {"numpy": "numpy", "pandas": "pandas", "yfinance": "yfinance", "sklearn": "scikit-learn", "statsmodels": "statsmodels"}


def stock_missing():
    return [pip for mod, pip in STOCK_REQUIRED.items() if not _has(mod)]


_stocks = None


def stocks():
    global _stocks
    if _stocks is None:
        import stocks as module            # slow import (scikit-learn etc.), done on first use
        _stocks = module
    return _stocks


import ytdl  # noqa: E402  (after Flask so a missing yt-dlp only disables downloads)


@app.get("/")
def home():
    return ("<h2>Helper is running ✔</h2><p>Go back to your website (kaustubhagashe.github.io) "
            "and open Projects → YouTube Downloader or Stock Backtesting. Keep this window open.</p>")


@app.get("/api/health")
def health():
    missing = stock_missing()
    return jsonify(
        ok=True, version=VERSION, python=sys.version.split()[0],
        ytdl={"available": ytdl.yt_dlp is not None, "version": ytdl.version(), "ffmpeg": ytdl.ffmpeg_available(),
              "cookies_file": bool(CONFIG["cookies"] and os.path.isfile(CONFIG["cookies"]))},
        stocks={"available": not missing, "missing": missing,
                "optional": {"xgboost": _has("xgboost"), "lightgbm": _has("lightgbm"), "catboost": _has("catboost"),
                             "prophet": _has("prophet"), "arch": _has("arch"), "tensorflow": _has("tensorflow")}},
        default_folder=os.path.join(os.path.expanduser("~"), "Downloads"),
    )


# ------------------------------------------------------------------ YouTube
def _json():
    return request.get_json(silent=True) or {}


def _cookie_args(data):
    browser = (data.get("cookies_browser") or "").strip().lower() or None
    if browser and browser not in ("chrome", "edge", "firefox", "brave", "opera", "safari", "chromium", "vivaldi"):
        browser = None
    return CONFIG["cookies"], browser


@app.post("/api/yt/info")
def yt_info():
    data = _json()
    try:
        cf, cb = _cookie_args(data)
        return jsonify(ytdl.get_info(data.get("url"), cf, cb))
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    except Exception as exc:
        return jsonify(error=ytdl.friendly_error(exc)), 502


@app.post("/api/yt/pick-folder")
def yt_pick_folder():
    try:
        return jsonify(path=ytdl.pick_folder(_json().get("initial")))
    except Exception as exc:
        return jsonify(error=str(exc)), 501


@app.post("/api/yt/start")
def yt_start():
    data = _json()
    try:
        cf, cb = _cookie_args(data)
        job = ytdl.start(data.get("url"), data.get("quality"), data.get("folder"), cf, cb)
        return jsonify(job_id=job["id"], started_at=job["started_at"])
    except (ValueError, TypeError) as exc:
        return jsonify(error=str(exc)), 400
    except Exception as exc:
        return jsonify(error=ytdl.friendly_error(exc)), 500


@app.get("/api/yt/progress/<job_id>")
def yt_progress(job_id):
    out = ytdl.progress(job_id)
    return (jsonify(out) if out else (jsonify(error="Unknown download."), 404))


@app.post("/api/yt/cancel/<job_id>")
def yt_cancel(job_id):
    return jsonify(ok=ytdl.cancel(job_id))


# ------------------------------------------------------------------ Stocks
def _stock_guard():
    missing = stock_missing()
    if missing:
        return jsonify(error="Some Python packages are missing for the stock tool.", missing=missing,
                       fix="pip install " + " ".join(missing)), 503
    return None


@app.get("/api/stock/tickers")
def stock_tickers():
    blocked = _stock_guard()
    if blocked:
        return blocked
    tickers, source = stocks().get_tickers()
    return jsonify(tickers=tickers, source=source)


@app.post("/api/stock/start")
def stock_start():
    blocked = _stock_guard()
    if blocked:
        return blocked
    data = _json()
    payload, code = stocks().start_job(data.get("ticker"), data.get("horizon_months", 6), data.get("deep_learning", False))
    return jsonify(payload), code


@app.get("/api/stock/status")
def stock_status():
    if _stocks is None:
        return jsonify(progress=0, message="Idle", completed=False, result=None, error=None)
    return jsonify(_stocks.get_status())


def main():
    parser = argparse.ArgumentParser(description="Local helper for kaustubhagashe.github.io")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--cookies", default=os.environ.get("YTDL_COOKIES") or os.path.join(HERE, "cookies.txt"),
                        help="optional cookies.txt for YouTube (default: cookies.txt next to this file)")
    parser.add_argument("--allow-origin", action="append", default=[], help="extra website address allowed to call the helper")
    args = parser.parse_args()
    CONFIG["cookies"] = args.cookies
    CONFIG["origins"].update(args.allow_origin)
    print(f"\nHelper v{VERSION} is running at http://127.0.0.1:{args.port}  (press Ctrl+C to stop)")
    print("Keep this window open while you use the YouTube Downloader or Stock pages on the website.\n")
    app.run(host="127.0.0.1", port=args.port, debug=False, threaded=True)


if __name__ == "__main__":
    main()
