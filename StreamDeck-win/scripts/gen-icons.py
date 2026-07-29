"""One-off icon generator for the plugin's static placeholder assets.
Run: python3 scripts/gen-icons.py
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SDPLUGIN = ROOT / "com.emilberglund.batterymonitor.sdPlugin"

BG = (30, 32, 36, 255)
FG = (235, 235, 235, 255)
ACCENT = (46, 204, 113, 255)


MUTED = (90, 95, 102, 255)


def battery_glyph(img_size: int, draw_bg: bool, fill_ratio: float = 0.7) -> Image.Image:
    img = Image.new("RGBA", (img_size, img_size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if draw_bg:
        d.rounded_rectangle([0, 0, img_size - 1, img_size - 1], radius=img_size * 0.18, fill=BG)

    s = img_size
    body_w, body_h = s * 0.62, s * 0.34
    x0, y0 = (s - body_w) / 2 - s * 0.03, (s - body_h) / 2
    x1, y1 = x0 + body_w, y0 + body_h
    d.rounded_rectangle([x0, y0, x1, y1], radius=s * 0.04, outline=FG, width=max(1, int(s * 0.035)))

    nub_w, nub_h = s * 0.04, body_h * 0.4
    d.rounded_rectangle(
        [x1, y0 + (body_h - nub_h) / 2, x1 + nub_w, y0 + (body_h - nub_h) / 2 + nub_h],
        radius=s * 0.015,
        fill=FG,
    )

    pad = s * 0.035
    if fill_ratio > 0:
        fill_w = (body_w - 2 * pad) * fill_ratio
        d.rectangle([x0 + pad, y0 + pad, x0 + pad + fill_w, y1 - pad], fill=ACCENT)
    else:
        # Empty placeholder: the on-key image is only ever seen before the plugin
        # renders a real reading, so it must not look like a real level.
        d.line(
            [x0 + body_w * 0.3, y0 + body_h * 0.5, x1 - body_w * 0.3, y0 + body_h * 0.5],
            fill=MUTED,
            width=max(2, int(s * 0.04)),
        )
    return img


def save_pair(base_size: int, name: str, draw_bg: bool, fill_ratio: float = 0.7):
    for scale, suffix in ((1, ""), (2, "@2x")):
        img = battery_glyph(base_size * scale, draw_bg, fill_ratio)
        out = SDPLUGIN / f"{name}{suffix}.png"
        out.parent.mkdir(parents=True, exist_ok=True)
        img.save(out)
        print("wrote", out)


save_pair(28, "imgs/plugin/marketplace", draw_bg=True)
save_pair(28, "imgs/plugin/category-icon", draw_bg=True)
save_pair(20, "imgs/actions/battery-status/icon", draw_bg=False)
save_pair(72, "imgs/actions/battery-status/key", draw_bg=True, fill_ratio=0)
