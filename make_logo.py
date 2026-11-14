import numpy as np, sys
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as ndi

SRC = sys.argv[1]; OUT = sys.argv[2]
im = Image.open(SRC).convert("RGB")
a = np.asarray(im).astype(np.int16)
# "near white" = background candidate (white page + faint shadow)
near_white = (a.min(axis=2) > 226)
lab, n = ndi.label(near_white)
# background = near-white components that touch the image border
border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])))
border.discard(0)
bg = np.isin(lab, list(border))
fg = ~bg
# drop specks (ghost text under the mark): keep only the largest fg component
lab2, n2 = ndi.label(fg)
sizes = ndi.sum(fg, lab2, range(1, n2 + 1))
fg = lab2 == (1 + int(np.argmax(sizes)))
fg = ndi.binary_fill_holes(fg)
fg = ndi.binary_erosion(fg, iterations=1)          # shave the pale fringe
alpha = ndi.gaussian_filter(fg.astype(np.float32), 0.9)
alpha = np.clip((alpha - 0.15) / 0.7, 0, 1)
rgba = np.dstack([a.astype(np.uint8), (alpha * 255).astype(np.uint8)])
ys, xs = np.where(alpha > 0.05)
x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
print("bbox", x0, y0, x1, y1)
mark = Image.fromarray(rgba, "RGBA").crop((x0, y0, x1 + 1, y1 + 1))
w, h = mark.size
side = max(w, h)
sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
sq.paste(mark, ((side - w) // 2, (side - h) // 2), mark)

def fit(img, size, pad=0.0):
    inner = int(size * (1 - 2 * pad))
    m = img.resize((inner, inner), Image.LANCZOS)
    c = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    c.paste(m, ((size - inner) // 2, (size - inner) // 2), m)
    return c

# 1. transparent mark for the sidebar / page use
fit(sq, 512).save(f"{OUT}/logo-mark.png", optimize=True)
fit(sq, 192).save(f"{OUT}/logo-mark-192.png", optimize=True)

# 2. "app icon" tiles: mark on a warm paper tile (works on any tab colour)
def tile(size, radius_frac, pad):
    t = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(t)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * radius_frac), fill=(250, 246, 236, 255))
    m = fit(sq, size, pad)
    t.alpha_composite(m)
    return t
tile(512, .22, .15).save(f"{OUT}/icon-512.png", optimize=True)
tile(192, .22, .15).save(f"{OUT}/icon-192.png", optimize=True)
tile(180, 0, .15).convert("RGB").save(f"{OUT}/apple-touch-icon.png", optimize=True)   # iOS rounds it itself
for s in (16, 32, 48):
    tile(s * 4, .22, .10).resize((s, s), Image.LANCZOS).save(f"{OUT}/favicon-{s}.png", optimize=True)
tile(256, .22, .10).save(f"{OUT}/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])

# 3. social share card 1200x630
card = Image.new("RGB", (1200, 630), (26, 23, 18))
m = fit(sq, 360)
card.paste(m, (110, 135), m)
card.save(f"{OUT}/social-card.png", optimize=True)
# sample brand colours from the mark
rgb = np.asarray(sq)[..., :3]; al = np.asarray(sq)[..., 3]
def px(x, y): return "#%02x%02x%02x" % tuple(rgb[int(y*side), int(x*side)])
print("teal", px(.5, .30), "gold", px(.25, .70), "navy", px(.75, .70))
