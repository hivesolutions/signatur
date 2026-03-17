#!/usr/bin/env python3

"""
Renders a given text string using a TTF font with an overlay of
glyph metrics (advance width, LSB, bounding box, overshoot) into
a PNG image for visual inspection.

Usage:
    python scripts/font_metrics.py
    python scripts/font_metrics.py --font static/fonts/script4l.ttf --text "Hello"
    python scripts/font_metrics.py --size 80 --output metrics.png

Requirements:
    pip install Pillow fonttools
"""

import argparse
import os

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)

DEFAULT_FONT = os.path.join(ROOT_DIR, "static", "fonts", "script4l.ttf")
DEFAULT_OUTPUT = os.path.join(ROOT_DIR, "static", "fonts", "font_metrics.png")
DEFAULT_TEXT = "Tiago"
DEFAULT_SIZE = 120

MARGIN = 40
LABEL_OFFSET = 42


def get_glyph_metrics(ttfont, ch):
    """Extracts the horizontal metrics and bounding box for a
    single character from the given TTFont instance."""
    hmtx = ttfont["hmtx"]
    glyf_table = ttfont["glyf"]
    cmap = ttfont.getBestCmap()
    code = ord(ch)
    name = cmap.get(code, ".notdef")
    aw, lsb = hmtx[name]
    g = glyf_table.get(name)
    has_outline = g and hasattr(g, "xMin") and g.numberOfContours > 0
    return {
        "char": ch,
        "aw": aw,
        "lsb": lsb,
        "xmin": g.xMin if has_outline else 0,
        "xmax": g.xMax if has_outline else aw,
        "ymin": g.yMin if has_outline else 0,
        "ymax": g.yMax if has_outline else ttfont["head"].unitsPerEm,
    }


def render_metrics(font_path, text, font_size, output_path):
    """Renders the text with per-glyph metric overlays and saves
    the result as a PNG image."""
    ttfont = TTFont(font_path)
    upm = ttfont["head"].unitsPerEm
    scale = font_size / upm

    pil_font = ImageFont.truetype(font_path, font_size)

    glyphs = [get_glyph_metrics(ttfont, ch) for ch in text]

    total_advance = sum(g["aw"] for g in glyphs)
    img_w = int(total_advance * scale) + MARGIN * 2
    img_h = int(font_size * 2.2) + MARGIN * 2
    baseline_y = MARGIN + int(font_size * 1.5)

    img = Image.new("RGB", (img_w, img_h), "white")
    draw = ImageDraw.Draw(img)

    # draws the baseline reference line
    draw.line(
        [(MARGIN, baseline_y), (img_w - MARGIN, baseline_y)],
        fill="#cccccc",
        width=1,
    )

    # draws per-glyph metric overlays
    cursor_x = MARGIN
    for g in glyphs:
        aw_px = g["aw"] * scale
        lsb_px = g["lsb"] * scale
        xmin_px = g["xmin"] * scale
        xmax_px = g["xmax"] * scale

        # advance width box (blue outline)
        draw.rectangle(
            [(cursor_x, MARGIN), (cursor_x + aw_px, baseline_y + 40)],
            outline="#4a90d9",
            width=1,
        )

        # LSB zone (yellow fill, from cursor to xMin)
        if g["lsb"] > 2:
            draw.rectangle(
                [(cursor_x, MARGIN), (cursor_x + lsb_px, baseline_y + 40)],
                fill="#fff3b0",
                outline="#e6c200",
                width=1,
            )

        # glyph bounding box (green outline)
        draw.rectangle(
            [
                (cursor_x + xmin_px, baseline_y - g["ymax"] * scale),
                (cursor_x + xmax_px, baseline_y - g["ymin"] * scale),
            ],
            outline="#4caf50",
            width=1,
        )

        # overshoot zone (red fill, where glyph extends past advance)
        if g["xmax"] * scale > aw_px:
            draw.rectangle(
                [
                    (cursor_x + aw_px, baseline_y - g["ymax"] * scale),
                    (cursor_x + xmax_px, baseline_y - g["ymin"] * scale),
                ],
                fill="#ffcccc",
                outline="#ff4444",
                width=1,
            )

        # per-glyph label with metrics
        label = "{} aw={} lsb={}".format(g["char"], g["aw"], g["lsb"])
        draw.text(
            (cursor_x + 2, baseline_y + LABEL_OFFSET),
            label,
            fill="#333333",
            font=ImageFont.load_default(),
        )

        cursor_x += aw_px

    # renders the actual text on top of the overlays
    draw.text((MARGIN, baseline_y - font_size), text, fill="black", font=pil_font)

    # draws the legend at the bottom of the image
    ly = img_h - 30
    draw.rectangle([(10, ly), (20, ly + 10)], fill="#fff3b0", outline="#e6c200")
    draw.text((25, ly - 2), "LSB (left margin)", fill="#333")
    draw.rectangle([(180, ly), (190, ly + 10)], outline="#4a90d9")
    draw.text((195, ly - 2), "Advance width", fill="#333")
    draw.rectangle([(330, ly), (340, ly + 10)], outline="#4caf50")
    draw.text((345, ly - 2), "Glyph bbox", fill="#333")
    draw.rectangle([(470, ly), (480, ly + 10)], fill="#ffcccc", outline="#ff4444")
    draw.text((485, ly - 2), "Overshoot", fill="#333")

    img.save(output_path)
    print("Saved metrics image: " + output_path)
    print("Size: {}x{}, {} glyphs".format(img_w, img_h, len(glyphs)))


def main():
    parser = argparse.ArgumentParser(
        description="Render TTF font text with glyph metric overlays"
    )
    parser.add_argument("--font", default=DEFAULT_FONT, help="path to TTF font file")
    parser.add_argument("--text", default=DEFAULT_TEXT, help="text string to render")
    parser.add_argument(
        "--size", type=int, default=DEFAULT_SIZE, help="font size in pixels"
    )
    parser.add_argument("--output", default=DEFAULT_OUTPUT, help="output PNG path")
    args = parser.parse_args()
    render_metrics(args.font, args.text, args.size, args.output)


if __name__ == "__main__":
    main()
