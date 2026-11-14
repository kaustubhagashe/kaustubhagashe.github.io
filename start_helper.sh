#!/usr/bin/env bash
# Starts the local helper for kaustubhagashe.github.io (YouTube Downloader + Stock forecasting).
# Keep this terminal open while you use those two pages. Press Ctrl+C to stop.
cd "$(dirname "$0")"
command -v python3 >/dev/null || { echo "Python 3 not found. Install it from https://www.python.org/downloads/"; exit 1; }
[ -d .venv ] || { echo "First run: creating a private Python environment (one time)..."; python3 -m venv .venv; }
echo "Checking packages (the first time this can take several minutes)..."
.venv/bin/python -m pip install --quiet --upgrade pip
.venv/bin/python -m pip install --quiet --upgrade -r requirements.txt
.venv/bin/python -m pip install --quiet --upgrade yt-dlp
exec .venv/bin/python server.py
