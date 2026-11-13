"""Generates the plugin's static icons.

Run: python3 scripts/gen-icons.py   (needs Pillow)

Everything is drawn on a supersampled canvas and downscaled with LANCZOS, since
Pillow does no anti-aliasing of its own and these are looked at down to 20px.

The two glyphs are the ones the key renderer draws (src/ui/key-svg.ts), on the
same 48-unit grid, so a key looks the same before its first reading as after.
If one changes, change the other.

The app icon is not drawn here. It is a real key face from the plugin's own
renderer, kept as store/app-icon.svg and rasterised, with the gallery, by
scripts/render-store.mjs (it needs a browser, since Pillow can't draw SVG text):
  imgs/plugin/marketplace  288  (@2x 576)  the icon inside the Stream Deck app
  store/app-icon           256  (@2x 512)  uploaded separately in Maker Console

Sizes and styles for the rest follow Elgato's asset guidelines:
  category-icon    28  (@2x  56)  the group header in the actions list
  action icon      20  (@2x  40)  the action's own row
  key image        72  (@2x 144)  what a key shows before the first reading

The action and category icons are monochrome white on a transparent ground,
which the guidelines require: they sit in Stream Deck's own lists, where a
coloured icon would fight the surrounding chrome.
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SDPLUGIN = ROOT / "com.emilberglund.audioswitch.sdPlugin"

BLACK = (0, 0, 0, 255)
DIM = (125, 130, 139, 255)
WHITE = (255, 255, 255, 255)

SS = 8  # supersampling factor
GRID = 48  # the glyphs' own coordinate space


def speaker(d, at, color, stroke):
    """at(x, y) maps glyph units to pixels; stroke is in pixels."""
    d.polygon([at(6, 18), at(15, 18), at(27, 8), at(27, 40), at(15, 30), at(6, 30)], fill=color)
    # Round the body's corners the way the SVG's stroke-linejoin does.
    for (cx, cy, r, half) in ((25.86, 24, 10, 44.4), (25.35, 24, 18.5, 46.9)):
        x0, y0 = at(cx - r, cy - r)
        x1, y1 = at(cx + r, cy + r)
        pad = stroke / 2
        d.arc([x0 - pad, y0 - pad, x1 + pad, y1 + pad], -half, half, fill=color, width=stroke)


def microphone(d, at, color, stroke):
    d.rounded_rectangle([at(17, 4), at(31, 29)], radius=at(7, 0)[0] - at(0, 0)[0], fill=color)
    x0, y0 = at(10, 9)
    x1, y1 = at(38, 37)
    pad = stroke / 2
    d.arc([x0 - pad, y0 - pad, x1 + pad, y1 + pad], 0, 180, fill=color, width=stroke)
    d.line([at(24, 37), at(24, 44)], fill=color, width=stroke)
    d.line([at(16, 44), at(32, 44)], fill=color, width=stroke)
    # Pillow's lines end square; cap them so the foot matches the round-capped SVG.
    for (x, y) in ((16, 44), (32, 44)):
        cx, cy = at(x, y)
        d.ellipse([cx - stroke / 2, cy - stroke / 2, cx + stroke / 2, cy + stroke / 2], fill=color)


GLYPHS = {"output": speaker, "input": microphone}


def icon(size, flow, *, color, background=None, radius=0.0, fill=0.8):
    """One glyph centred on a square canvas. `fill` is the share of the canvas it spans."""
    s = size * SS
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if background:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=s * radius, fill=background)

    scale = s * fill / GRID
    offset = (s - GRID * scale) / 2
    at = lambda x, y: (offset + x * scale, offset + y * scale)
    # 3.5 units in the SVG. A little heavier at list sizes, where a hairline vanishes.
    stroke = max(SS, round((4.2 if size <= 28 else 3.5) * scale))
    GLYPHS[flow](d, at, color, stroke)
    return img.resize((size, size), Image.LANCZOS)


def save(name, size, flow, **kw):
    for scale, suffix in ((1, ""), (2, "@2x")):
        out = SDPLUGIN / f"{name}{suffix}.png"
        out.parent.mkdir(parents=True, exist_ok=True)
        icon(size * scale, flow, **kw).save(out)
        print(f"wrote {out.relative_to(SDPLUGIN)} ({size * scale}px)")


save("imgs/plugin/category-icon", 28, "output", color=WHITE, fill=0.92)

for flow, action in (("output", "output-device"), ("input", "input-device")):
    save(f"imgs/actions/{action}/icon", 20, flow, color=WHITE, fill=0.95)
    # Dim on black: the face a key has when its device is not the default, which
    # is the honest thing to show before anything is known.
    save(f"imgs/actions/{action}/key", 72, flow, color=DIM, background=BLACK, fill=0.55)
