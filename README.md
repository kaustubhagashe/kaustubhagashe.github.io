# My Wall

Four sections, each with its own folder and its own `list.json`:

| Section on the site | Folder | List file |
| --- | --- | --- |
| My Art | `wall/my-art/` | `wall/my-art/list.json` |
| Ridhima's Art and Craft | `wall/ridhima/` | `wall/ridhima/list.json` |
| Minal's Art and Craft | `wall/minal/` | `wall/minal/list.json` |
| Photo Album | `wall/album/` | `wall/album/list.json` |

To add a picture: upload the JPG / PNG / WebP into the section's folder, then add one line to that folder's `list.json`:

```
[
  { "file": "new-sketch.jpg", "title": "New sketch", "date": "Dec 2026" },
  { "file": "old-sketch.jpg", "title": "Old sketch" }
]
```

Only `file` is required. `title`, `date`, `medium` and `caption` are optional. Every line ends with a comma except the last one. The first line is shown first, so put the newest at the top.
Optional: `"thumb": "thumbs/new-sketch.jpg"` points to a small version (about 260 px) for the strip under the carousel; without it the full picture is used.
Keep each picture under about 1.5 MB.
