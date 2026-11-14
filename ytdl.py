"""YouTube download engine (yt-dlp) used by server.py.

Enhanced from the original Download_Youtube_Video.py: one video at a time, quality
choice, real progress, a folder picker, and clear success / error messages.
Only use it for videos you have the right to download.
"""
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import uuid
from datetime import datetime
from urllib.parse import urlparse

try:
    import yt_dlp
except ImportError:          # reported by /api/health
    yt_dlp = None

JOBS = {}
JOBS_LOCK = threading.Lock()
ANSI = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")
YT_HOSTS = ("youtube.com", "youtu.be", "youtube-nocookie.com")


def ffmpeg_available():
    return shutil.which("ffmpeg") is not None


def version():
    try:
        return yt_dlp.version.__version__ if yt_dlp else None
    except Exception:
        return None


def _clean(text):
    return ANSI.sub("", str(text)).replace("ERROR: ", "").strip()


def check_url(url):
    url = (url or "").strip()
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    if parsed.scheme not in ("http", "https") or not any(host == h or host.endswith("." + h) for h in YT_HOSTS):
        raise ValueError("Please paste a YouTube video link (youtube.com or youtu.be).")
    return url


def _base_opts(cookies_file=None, cookies_browser=None):
    opts = {"noplaylist": True, "quiet": True, "no_warnings": True, "noprogress": True}
    if cookies_browser:
        opts["cookiesfrombrowser"] = (cookies_browser,)
    elif cookies_file and os.path.isfile(cookies_file):
        opts["cookiefile"] = cookies_file
    return opts


def friendly_error(exc):
    msg = _clean(exc)
    low = msg.lower()
    if "sign in to confirm" in low or "not a bot" in low or "cookies" in low and "sign in" in low:
        return msg + "  Tip: open “Advanced” and choose the browser where you are signed in to YouTube, then try again."
    if "private video" in low or "members-only" in low:
        return msg + "  This video is not public, so it cannot be downloaded without access."
    if "ffmpeg" in low:
        return msg + "  Install FFmpeg and make sure it is on your PATH to download high resolutions."
    if "unable to download" in low or "urlopen error" in low or "getaddrinfo" in low:
        return msg + "  Check your internet connection and try again."
    return msg


def get_info(url, cookies_file=None, cookies_browser=None):
    if yt_dlp is None:
        raise RuntimeError("yt-dlp is not installed. Run:  pip install -U yt-dlp")
    url = check_url(url)
    with yt_dlp.YoutubeDL(_base_opts(cookies_file, cookies_browser)) as ydl:
        info = ydl.extract_info(url, download=False)
    formats = info.get("formats") or []
    best_audio = max((f for f in formats if f.get("vcodec") in (None, "none") and f.get("acodec") not in (None, "none")),
                     key=lambda f: f.get("abr") or 0, default=None)
    audio_size = (best_audio or {}).get("filesize") or (best_audio or {}).get("filesize_approx") or 0
    by_height = {}
    for f in formats:
        h = f.get("height")
        if not h or f.get("vcodec") in (None, "none"):
            continue
        slot = by_height.setdefault(h, {"progressive": False, "size": 0, "fps": 0})
        if f.get("acodec") not in (None, "none"):
            slot["progressive"] = True
        size = f.get("filesize") or f.get("filesize_approx") or 0
        slot["size"] = max(slot["size"], size)
        slot["fps"] = max(slot["fps"], f.get("fps") or 0)
    have_ffmpeg = ffmpeg_available()
    qualities = []
    for h in sorted(by_height, reverse=True):
        slot = by_height[h]
        needs = not slot["progressive"]
        size = slot["size"] + (audio_size if needs else 0)
        qualities.append({
            "height": h,
            "label": f"{h}p" + (f"{int(slot['fps'])}" if slot["fps"] and slot["fps"] >= 50 else ""),
            "needs_ffmpeg": needs,
            "available": have_ffmpeg or not needs,
            "size_mb": round(size / 1048576, 1) if size else None,
        })
    return {
        "title": info.get("title"), "uploader": info.get("uploader") or info.get("channel"),
        "duration": info.get("duration"), "thumbnail": info.get("thumbnail"),
        "qualities": qualities, "audio_available": best_audio is not None or bool(formats),
        "ffmpeg": have_ffmpeg,
    }


def pick_folder(initial=None):
    """Open the operating system's folder dialog on this computer (the helper runs locally)."""
    initial = initial if initial and os.path.isdir(initial) else os.path.expanduser("~")
    code = ("import tkinter as tk\nfrom tkinter import filedialog\nr=tk.Tk(); r.withdraw()\n"
            "r.attributes('-topmost', True)\n"
            f"print(filedialog.askdirectory(initialdir={initial!r}, title='Choose a folder for the video', parent=r) or '')")
    try:
        out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, timeout=600)
        if out.returncode == 0:
            return out.stdout.strip().splitlines()[-1] if out.stdout.strip() else ""
    except Exception:
        pass
    if sys.platform == "darwin":
        try:
            out = subprocess.run(["osascript", "-e", 'POSIX path of (choose folder with prompt "Choose a folder for the video")'],
                                 capture_output=True, text=True, timeout=600)
            return out.stdout.strip().rstrip("/") if out.returncode == 0 else ""
        except Exception:
            pass
    if shutil.which("zenity"):
        try:
            out = subprocess.run(["zenity", "--file-selection", "--directory"], capture_output=True, text=True, timeout=600)
            return out.stdout.strip()
        except Exception:
            pass
    raise RuntimeError("A folder dialog is not available on this computer. Type the folder path instead.")


def _format_selector(quality, have_ffmpeg):
    if quality == "audio":
        return "bestaudio/best"
    h = int(quality)
    if have_ffmpeg:
        return f"bv*[height={h}]+ba/b[height={h}]/bv*[height<={h}]+ba/b[height<={h}]/b"
    return f"b[height={h}]/b[height<={h}]/b"


def start(url, quality, folder, cookies_file=None, cookies_browser=None):
    if yt_dlp is None:
        raise RuntimeError("yt-dlp is not installed. Run:  pip install -U yt-dlp")
    url = check_url(url)
    folder = os.path.abspath(os.path.expanduser((folder or "").strip()))
    if not folder:
        raise ValueError("Please choose a folder for the video.")
    os.makedirs(folder, exist_ok=True)
    if quality != "audio":
        quality = str(int(quality))
    job_id = uuid.uuid4().hex[:12]
    now = time.time()
    job = {
        "id": job_id, "state": "starting", "percent": 0.0, "message": "", "speed": None, "eta": None,
        "downloaded_bytes": 0, "total_bytes": None, "filepath": None, "folder": folder,
        "started_ts": now, "started_at": datetime.now().isoformat(timespec="seconds"),
        "finished_ts": None, "finished_at": None, "elapsed": 0.0, "cancel": False,
    }
    with JOBS_LOCK:
        JOBS[job_id] = job
    threading.Thread(target=_run, args=(job, url, quality, folder, cookies_file, cookies_browser), daemon=True).start()
    return job


def _run(job, url, quality, folder, cookies_file, cookies_browser):
    have_ffmpeg = ffmpeg_available()
    done_bytes = {"n": 0}
    finished = {"streams": 0}

    def hook(d):
        if job["cancel"]:
            raise yt_dlp.utils.DownloadCancelled("Cancelled")
        status = d.get("status")
        info = d.get("info_dict") or {}
        streams = info.get("requested_formats") or [info]
        expected = sum((f.get("filesize") or f.get("filesize_approx") or 0) for f in streams)
        if status == "downloading":
            cur = d.get("downloaded_bytes") or 0
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            if expected:
                pct = (done_bytes["n"] + cur) / max(expected, done_bytes["n"] + cur) * 100
            elif total:
                pct = (finished["streams"] + cur / total) / max(len(streams), 1) * 100
            else:
                pct = job["percent"]
            job.update(state="downloading", percent=round(min(pct, 99.0), 1), speed=d.get("speed"), eta=d.get("eta"),
                       downloaded_bytes=done_bytes["n"] + cur, total_bytes=expected or total or None)
        elif status == "finished":
            done_bytes["n"] += d.get("downloaded_bytes") or d.get("total_bytes") or 0
            finished["streams"] += 1
            job.update(state="processing", message="Finishing up…", speed=None, eta=None)

    opts = _base_opts(cookies_file, cookies_browser)
    opts.update({
        "format": _format_selector(quality, have_ffmpeg),
        "outtmpl": os.path.join(folder, "%(title)s.%(ext)s"),
        "progress_hooks": [hook],
        "restrictfilenames": False,
        "windowsfilenames": os.name == "nt",
    })
    if have_ffmpeg and quality != "audio":
        opts["merge_output_format"] = "mp4"
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=True)
            path = None
            for item in (info.get("requested_downloads") or []):
                path = item.get("filepath") or path
            path = path or ydl.prepare_filename(info)
            if not os.path.exists(path):
                stem = os.path.splitext(path)[0]
                for ext in (".mp4", ".mkv", ".webm", ".m4a", ".mp3"):
                    if os.path.exists(stem + ext):
                        path = stem + ext
                        break
        job.update(state="finished", percent=100.0, filepath=os.path.abspath(path), message="")
    except Exception as exc:                                    # includes DownloadCancelled
        cancelled = job["cancel"]
        job.update(state="cancelled" if cancelled else "error",
                   message="Download cancelled." if cancelled else friendly_error(exc))
    finally:
        job["finished_ts"] = time.time()
        job["finished_at"] = datetime.now().isoformat(timespec="seconds")
        job["elapsed"] = round(job["finished_ts"] - job["started_ts"], 1)


def progress(job_id):
    job = JOBS.get(job_id)
    if not job:
        return None
    out = {k: v for k, v in job.items() if k not in ("cancel", "started_ts", "finished_ts")}
    if not job["finished_ts"]:
        out["elapsed"] = round(time.time() - job["started_ts"], 1)
    return out


def cancel(job_id):
    job = JOBS.get(job_id)
    if job:
        job["cancel"] = True
    return bool(job)
