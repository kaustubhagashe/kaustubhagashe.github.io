@echo off
REM Starts the local helper for kaustubhagashe.github.io (YouTube Downloader + Stock forecasting).
REM Keep this window open while you use those two pages. Close it to stop the helper.
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
  echo Python was not found. Install it from https://www.python.org/downloads/ and tick "Add Python to PATH".
  pause
  exit /b 1
)
if not exist ".venv\Scripts\python.exe" (
  echo First run: creating a private Python environment ^(one time^)...
  python -m venv .venv
)
echo Checking packages ^(the first time this can take several minutes^)...
".venv\Scripts\python.exe" -m pip install --quiet --upgrade pip
".venv\Scripts\python.exe" -m pip install --quiet --upgrade -r requirements.txt
".venv\Scripts\python.exe" -m pip install --quiet --upgrade yt-dlp
".venv\Scripts\python.exe" server.py
pause
