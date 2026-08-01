"""Generates the plugin's static icons.

Run: python3 scripts/gen-icons.py

Everything is drawn on a supersampled canvas and downscaled with LANCZOS, since
Pillow does no anti-aliasing of its own and these are looked at down to 20px.

Sizes and styles follow Elgato's asset guidelines:
  marketplace     288  (@2x 576)  the icon inside the Stream Deck app
  store icon      256  (@2x 512)  uploaded separately in Maker Console
  category-icon    28  (@2x  56)  the group header in the actions list
  action icon      20  (@2x  40)  the action's own row
  key image        72  (@2x 144)  what a key shows before the first reading

The action and category icons are monochrome white on a transparent ground,
which the guidelines require: they sit in Stream Deck's own lists, where a
coloured icon would fight the surrounding chrome. Colour is kept for the two
icons that stand alone — the app icon and the store listing.
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
WHITE = (255, 255, 255, 255)

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


def battery(size, *, background, fill_ratio, with_bolt, monochrome=False, with_arrow=False):
    """A horizontal battery, optionally on a rounded-square background."""
    s = size * SS
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    outline = FG if not monochrome else WHITE
    level = GREEN if not monochrome else WHITE

    if background:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=s * 0.22, fill=BG)

    # Leave room for the cap on the right, so the whole mark reads as centred.
    body_w, body_h = s * 0.60, s * 0.34
    cap_w = s * 0.045
    x0 = (s - (body_w + cap_w)) / 2
    y0 = (s - body_h) / 2
    x1, y1 = x0 + body_w, y0 + body_h

    stroke = max(1, int(s * 0.035))
    d.rounded_rectangle([x0, y0, x1, y1], radius=s * 0.05, outline=outline, width=stroke)

    cap_h = body_h * 0.42
    d.rounded_rectangle(
        [x1, y0 + (body_h - cap_h) / 2, x1 + cap_w, y0 + (body_h - cap_h) / 2 + cap_h],
        radius=s * 0.015,
        fill=outline,
    )

    pad = stroke * 1.6
    if fill_ratio > 0:
        fill_w = (body_w - 2 * pad) * fill_ratio
        d.rounded_rectangle([x0 + pad, y0 + pad, x0 + pad + fill_w, y1 - pad], radius=s * 0.02, fill=level)
    else:
        # The key image is only ever seen before a real reading arrives, so it
        # must not look like a level. A dash says "nothing yet".
        d.line(
            [x0 + body_w * 0.32, (y0 + y1) / 2, x1 - body_w * 0.32, (y0 + y1) / 2],
            fill=MUTED,
            width=max(2, int(s * 0.04)),
        )

    if with_arrow:
        # Marks the "lowest" action apart from the single-device one: the same
        # battery, with a downward chevron where the bolt would go.
        cx, cy = x0 + body_w * 0.5, (y0 + y1) / 2
        arm = body_h * 0.42
        d.line([cx - arm, cy - arm * 0.45, cx, cy + arm * 0.55], fill=outline, width=stroke)
        d.line([cx + arm, cy - arm * 0.45, cx, cy + arm * 0.55], fill=outline, width=stroke)

    if with_bolt:
        # Sits over the level, outlined in the background colour so it stays
        # readable against the green.
        cx, cy = x0 + body_w * 0.5, (y0 + y1) / 2
        d.polygon(bolt_points(cx, cy, body_h * 1.5), fill=BOLT, outline=BG, width=max(1, int(s * 0.018)))

    return img.resize((size, size), Image.LANCZOS)


def tag(size, *, background, monochrome=False):
    """Luggage tag: the mark for the renaming action."""
    s = size * SS
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if background:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=s * 0.22, fill=BG)

    color = WHITE if monochrome else FG
    w = max(2, int(s * 0.055))
    # Body: a square rotated 45 degrees reads as a tag at any size.
    pts = [(s * 0.52, s * 0.2), (s * 0.8, s * 0.2), (s * 0.8, s * 0.48),
           (s * 0.5, s * 0.78), (s * 0.22, s * 0.5)]
    d.line(pts + [pts[0]], fill=color, width=w, joint="curve")
    r = s * 0.045
    d.ellipse([s * 0.68 - r, s * 0.3 - r, s * 0.68 + r, s * 0.3 + r], outline=color, width=w)
    return img.resize((size, size), Image.LANCZOS)


def save_tag(name, size, **kw):
    for scale, suffix in ((1, ""), (2, "@2x")):
        out = SDPLUGIN / f"{name}{suffix}.png"
        out.parent.mkdir(parents=True, exist_ok=True)
        tag(size * scale, **kw).save(out)
        print(f"wrote {out.relative_to(SDPLUGIN)} ({size * scale}px)")


def save(name, size, **kw):
    for scale, suffix in ((1, ""), (2, "@2x")):
        out = SDPLUGIN / f"{name}{suffix}.png"
        out.parent.mkdir(parents=True, exist_ok=True)
        battery(size * scale, **kw).save(out)
        print(f"wrote {out.relative_to(SDPLUGIN)} ({size * scale}px)")


# The icon shown inside the Stream Deck app.
save("imgs/plugin/marketplace", 288, background=True, fill_ratio=0.78, with_bolt=True)

# Actions-list group header: monochrome, per the icon guidelines.
save("imgs/plugin/category-icon", 28, background=False, fill_ratio=0.78, with_bolt=False, monochrome=True)

# The action's own row: monochrome white on transparent, same rule.
save("imgs/actions/battery-status/icon", 20, background=False, fill_ratio=0.78, with_bolt=False, monochrome=True)

# What a key shows until the first reading lands.
save("imgs/actions/battery-status/key", 72, background=True, fill_ratio=0, with_bolt=False)

# The "Lowest battery" action: same mark, chevron instead of a level.
save("imgs/actions/lowest-battery/icon", 20, background=False, fill_ratio=0, with_bolt=False,
     monochrome=True, with_arrow=True)
save("imgs/actions/lowest-battery/key", 72, background=True, fill_ratio=0, with_bolt=False, with_arrow=True)

# The renaming action: a tag rather than a battery, since it isn't about charge.
save_tag("imgs/actions/device-renaming/icon", 20, background=False, monochrome=True)
save_tag("imgs/actions/device-renaming/key", 72, background=True)

# Marketplace listing icon, uploaded in Maker Console rather than shipped in the
# package — hence a folder outside the .sdPlugin.
for store_size in (256, 512):
    out = ROOT / "store" / f"app-icon-{store_size}.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    battery(store_size, background=True, fill_ratio=0.78, with_bolt=True).save(out)
    print(f"wrote {out.relative_to(ROOT)} ({store_size}px)")
