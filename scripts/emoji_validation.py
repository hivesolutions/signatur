#!/usr/bin/env python3

"""
Renders all Cool Emojis TTF glyphs alongside their mapped F3S font
names into a validation PNG image for visual inspection.

Usage:
    python scripts/emoji_validation.py

Requirements:
    pip install Pillow fonttools
"""

import datetime
import json
import os

from PIL import Image, ImageDraw, ImageFont

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)

FONT_PATH = os.path.join(ROOT_DIR, "static", "fonts", "coolemojis.ttf")
MAPPING_PATH = os.path.join(ROOT_DIR, "static", "fonts", "coolemojis.mapping.json")
OUTPUT_PATH = os.path.join(ROOT_DIR, "static", "fonts", "coolemojis.validation.png")

COLS = 7
CELL_W = 300
CELL_H = 280
MARGIN = 40
GLYPH_SIZE = 100
LABEL_SIZE = 24
TITLE_SIZE = 20


def main():
    with open(MAPPING_PATH, encoding="utf-8") as f:
        mapping = json.load(f)

    chars = [c for c in mapping.keys() if len(c) == 1]
    chars = sorted(chars, key=lambda c: mapping[c])

    pil_font = ImageFont.truetype(FONT_PATH, GLYPH_SIZE)
    label_font = ImageFont.truetype("arial.ttf", LABEL_SIZE)
    title_font = ImageFont.truetype("arial.ttf", TITLE_SIZE)

    rows = (len(chars) + COLS - 1) // COLS
    header_h = 240
    img_w = COLS * CELL_W + MARGIN * 2
    img_h = rows * CELL_H + MARGIN * 2 + header_h
    img = Image.new("RGB", (img_w, img_h), "white")
    draw = ImageDraw.Draw(img)

    header_font = ImageFont.truetype("arial.ttf", 40)
    font_name = os.path.basename(FONT_PATH)
    render_date = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    draw.text((MARGIN, 10), "Cool Emojis TTF - Glyph to F3S Font Mapping Validation", font=header_font, fill="#000000")
    draw.text((MARGIN, 70), "Font: " + font_name, font=header_font, fill="#666666")
    draw.text((MARGIN, 125), "Glyphs: " + str(len(chars)), font=header_font, fill="#666666")
    draw.text((MARGIN, 180), "Rendered: " + render_date, font=header_font, fill="#666666")

    for i, ch in enumerate(chars):
        col = i % COLS
        row = i // COLS
        x0 = MARGIN + col * CELL_W
        y0 = MARGIN + header_h + row * CELL_H

        draw.rectangle(
            [x0, y0, x0 + CELL_W - 1, y0 + CELL_H - 1], outline="#aaaaaa"
        )

        try:
            glyph_area_w = CELL_W - 16
            glyph_area_h = CELL_H - 70
            bbox = draw.textbbox((0, 0), ch, font=pil_font)
            w = bbox[2] - bbox[0]
            h = bbox[3] - bbox[1]
            if w > 0 and h > 0:
                scale = min(glyph_area_w / w, glyph_area_h / h, 1.0)
                if scale < 1.0:
                    scaled_font = ImageFont.truetype(FONT_PATH, int(GLYPH_SIZE * scale))
                    bbox = draw.textbbox((0, 0), ch, font=scaled_font)
                    w = bbox[2] - bbox[0]
                    h = bbox[3] - bbox[1]
                else:
                    scaled_font = pil_font
                gx = x0 + (CELL_W - w) // 2 - bbox[0]
                gy = y0 + 8 + (glyph_area_h - h) // 2 - bbox[1]
                draw.text((gx, gy), ch, font=scaled_font, fill="black")
        except Exception:
            pass

        f3s = mapping.get(ch, "?")
        char_label = "Key: " + repr(ch)
        draw.text(
            (x0 + 8, y0 + CELL_H - 50), char_label, font=title_font, fill="#888888"
        )
        draw.text((x0 + 8, y0 + CELL_H - 30), f3s, font=label_font, fill="#cc3333")

    img.save(OUTPUT_PATH)
    print("Saved validation image: " + OUTPUT_PATH)
    print("Size: {}x{}, {} glyphs".format(img_w, img_h, len(chars)))


if __name__ == "__main__":
    main()
