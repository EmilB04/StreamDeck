"""Generates the plugin's static icons.

Run: python3 scripts/gen-icons.py

Everything is drawn on a supersampled canvas and downscaled with LANCZOS, since
Pillow does no anti-aliasing of its own and these are looked at down to 20px.

Sizes follow Elgato's asset spec:
  marketplace     288  (@2x 576)  the store / plugin listing
  category-icon    28  (@2x  56)  the group header in the actions list
  action icon      20  (@2x  40)  the action's own row, on a transparent ground
  key image        72  (@2x 144)  what a key shows before the first reading
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SDPLUGIN = ROOT / "com.emilberglund.batterymonitor.sdPlugin"

BG = (30, 32, 36, 255)
FG = (235, 235, 235, 255)
GREEN = (46, 204, 113, 255)
BOLT = (85, 255, 127, 255)
MUTED = (90, 95, 102, 255)

SS = 8  # supersampling factor


def bolt_points(cx, cy, h):
    """Lightning bolt centred on (cx, cy), h tall."""
    w = h * 0.52
    return [
        (cx + w * 0.18, cy - h / 2),
        (cx - w / 2, cy + h * 0.10),
        (cx - w * 0.04, cy + h * 0.10),
        (cx - w * 0.22, cy + h / 2),
        (cx + w / 2, cy - h * 0.14),
        (cx + w * 0.06, cy - h * 0.14),
    ]


def battery(size, *, background, fill_ratio, with_bolt):
    """A horizontal battery, optionally on a rounded-square background."""
    s = size * SS
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    if background:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=s * 0.22, fill=BG)

    # Leave room for the cap on the right, so the whole mark reads as centred.
    body_w, body_h = s * 0.60, s * 0.34
    cap_w = s * 0.045
    x0 = (s - (body_w + cap_w)) / 2
    y0 = (s - body_h) / 2
    x1, y1 = x0 + body_w, y0 + body_h

    stroke = max(1, int(s * 0.035))
    d.rounded_rectangle([x0, y0, x1, y1], radius=s * 0.05, outline=FG, width=stroke)

    cap_h = body_h * 0.42
    d.rounded_rectangle(
        [x1, y0 + (body_h - cap_h) / 2, x1 + cap_w, y0 + (body_h - cap_h) / 2 + cap_h],
        radius=s * 0.015,
        fill=FG,
    )

    pad = stroke * 1.6
    if fill_ratio > 0:
        fill_w = (body_w - 2 * pad) * fill_ratio
        d.rounded_rectangle([x0 + pad, y0 + pad, x0 + pad + fill_w, y1 - pad], radius=s * 0.02, fill=GREEN)
    else:
        # The key image is only ever seen before a real reading arrives, so it
        # must not look like a level. A dash says "nothing yet".
        d.line(
            [x0 + body_w * 0.32, (y0 + y1) / 2, x1 - body_w * 0.32, (y0 + y1) / 2],
            fill=MUTED,
            width=max(2, int(s * 0.04)),
        )

    if with_bolt:
        # Sits over the level, outlined in the background colour so it stays
        # readable against the green.
        cx, cy = x0 + body_w * 0.5, (y0 + y1) / 2
        d.polygon(bolt_points(cx, cy, body_h * 1.5), fill=BOLT, outline=BG, width=max(1, int(s * 0.018)))

    return img.resize((size, size), Image.LANCZOS)


def save(name, size, **kw):
    for scale, suffix in ((1, ""), (2, "@2x")):
        out = SDPLUGIN / f"{name}{suffix}.png"
        out.parent.mkdir(parents=True, exist_ok=True)
        battery(size * scale, **kw).save(out)
        print(f"wrote {out.relative_to(SDPLUGIN)} ({size * scale}px)")


# Store listing: the biggest one, so it can carry the bolt and a filled level.
save("imgs/plugin/marketplace", 288, background=True, fill_ratio=0.78, with_bolt=True)

# Actions-list group header: the same mark, minus a bolt that would be mud at 28px.
save("imgs/plugin/category-icon", 28, background=True, fill_ratio=0.78, with_bolt=False)

# The action's row: transparent, so it sits on the list's own background.
save("imgs/actions/battery-status/icon", 20, background=False, fill_ratio=0.78, with_bolt=False)

# What a key shows until the first reading lands.
save("imgs/actions/battery-status/key", 72, background=True, fill_ratio=0, with_bolt=False)
