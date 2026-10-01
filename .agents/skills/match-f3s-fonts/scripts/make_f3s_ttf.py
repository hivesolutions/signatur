#!/usr/bin/env python3

"""
Tunes and checks TrueType fonts so the Signatur preview lays them out
like Gravostyle engraves their F3S counterparts.

Modes:
    build  regenerates every `static/fonts/<stem>-f3s.ttf` from its
           regular TTF and its F3S font as listed in `fonts.json` (the
           F3S files pinned by their SHA-256 and the measured per glyph
           corrections), byte for byte reproducible, `--verify` comparing
           the result with the committed fonts instead of writing them
    text   respaces a text font: every glyph shared with the F3S font
           advances by -m[2] + m[6] and has its outline shifted so its
           ink centre lands on the F3S ink centre, ascent - descent is
           set to the cap height (keeping ascent + descent) and DSIG is
           dropped, the outlines are kept (optionally scaled as a whole)
    emoji  refits Cool Emojis glyphs to their per glyph F3S fonts: the
           outline is scaled to the F3S ink height, sits on the F3S ink
           bottom, is centred on the F3S ink centre and advances by the
           F3S advance, the space taking the Helvetica 4L space advance
    check  compares a TTF with the model without writing anything and
           exits non zero when a glyph is off by more than the tolerance

The scale maps m[0] F3S units (the font size) onto 0.7 of the em, the
cap that the preview renders at the font size (FONT_SIZE_SCALE = 1/0.7).

Corrections (the `adjust` of `fonts.json` or --adjust FILE) are measured
on top of the model for glyphs that Gravostyle sets differently from it,
as {"@": {"left": -43, "right": -18}} in TTF units: left moves the ink
against the pen (negative tightens the space before the glyph) and right
changes the space after it. Only add one when the viewport against dry
run screenshots shows the same residual next to different neighbours.

Usage:
    python make_f3s_ttf.py build [--verify]
    python make_f3s_ttf.py text --ttf static/fonts/roman4l.ttf --f3s "Roman 4L"
        --output roman4l-f3s.ttf
    python make_f3s_ttf.py emoji --ttf static/fonts/coolemojis.ttf --chars "CEW"
        --output coolemojis.ttf
    python make_f3s_ttf.py check --ttf static/fonts/roman4l-f3s.ttf --f3s "Roman 4L"
    python make_f3s_ttf.py check --ttf static/fonts/coolemojis.ttf --emoji

Requirements:
    pip install fonttools numpy pillow scipy
"""

import io
import os
import sys
import json
import argparse

from fontTools.ttLib import TTFont
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.recordingPen import DecomposingRecordingPen

import f3s_model as M

FONTS_DIR = os.path.join(M.ROOT_DIR, "static", "fonts")

# the default tolerance of the check, as a fraction of the font size
# (1.5% is 0.075 mm at 5 mm), the tuned fonts stay within rounding
TOLERANCE = 0.015

HINTING_TABLES = ("fpgm", "prep", "cvt ", "hdmx", "LTSH", "VDMX")


def open_font(path):
    """
    Opens a TTF keeping its head timestamp on save, so a font generated
    twice from the same sources is the same file byte for byte.
    """

    return TTFont(path, recalcTimestamp=False)


def cap_units(font):
    return font["head"].unitsPerEm * M.CAP_RATIO


def load_adjust(path):
    if not path:
        return dict()
    with open(path, encoding="utf-8") as file:
        return json.load(file)


def decompose(font):
    """
    Replaces every composite glyph by its decomposed outline, so the
    glyphs can be moved one by one without moving their components.
    """

    glyph_set = font.getGlyphSet()
    glyf = font["glyf"]
    names = [name for name in font.getGlyphOrder() if glyf[name].isComposite()]
    for name in names:
        recording = DecomposingRecordingPen(glyph_set)
        glyph_set[name].draw(recording)
        pen = TTGlyphPen(None)
        recording.replay(pen)
        glyf[name] = pen.glyph()
    return names


def drop_hinting(font):
    for tag in HINTING_TABLES:
        if tag in font:
            del font[tag]
    font["glyf"].removeHinting()


def scale_outlines(font, factor):
    """
    Scales every outline and advance of the font around the origin, the
    hinting being dropped as the instructions no longer fit the outlines.
    """

    glyf = font["glyf"]
    hmtx = font["hmtx"]
    for name in font.getGlyphOrder():
        glyph = glyf[name]
        if glyph.numberOfContours > 0:
            coordinates = glyph.coordinates
            for index in range(len(coordinates)):
                x, y = coordinates[index]
                coordinates[index] = (int(round(x * factor)), int(round(y * factor)))
            glyph.recalcBounds(glyf)
        advance, _lsb = hmtx[name]
        lsb = glyph.xMin if glyph.numberOfContours > 0 else 0
        hmtx[name] = (int(round(advance * factor)), lsb)
    drop_hinting(font)


def auto_scale(font, f3s):
    """
    Returns the factor that brings the cap glyph (H) of the TTF to the
    height of the F3S cap glyph in TTF units.
    """

    cmap = font.getBestCmap()
    glyf = font["glyf"]
    glyph_f3s = f3s["glyphs"].get(ord("H"))
    if not ord("H") in cmap or glyph_f3s == None:
        raise RuntimeError("no H glyph to derive the scale from, pass --scale FACTOR")
    glyph = glyf[cmap[ord("H")]]
    glyph.recalcBounds(glyf)
    box = M.main_ink(glyph_f3s)
    target = (box[3] - box[1]) * cap_units(font) / M.size_units(glyph_f3s)
    return target / float(glyph.yMax - glyph.yMin)


def set_vertical(font):
    """
    Sets ascent - descent to the cap height (the H top), keeping their
    sum, so the line box of the preview is centred on the capitals like
    Gravostyle centres the block on the cap tops and the baselines.
    """

    cmap = font.getBestCmap()
    glyf = font["glyf"]
    cap = glyf[cmap[ord("H")]]
    cap.recalcBounds(glyf)
    hhea = font["hhea"]
    os2 = font["OS/2"]
    total = hhea.ascent - hhea.descent
    ascent = int(round((total + cap.yMax) / 2.0))
    descent = ascent - cap.yMax
    hhea.ascent, hhea.descent = ascent, -descent
    os2.sTypoAscender, os2.sTypoDescender = ascent, -descent

    # makes every browser use the typographic metrics (bit 7 of the
    # selection flags) instead of the platform specific ones
    if not os2.fsSelection & (1 << 7):
        os2.version = max(os2.version, 4)
        os2.fsSelection |= 1 << 7
    return ascent, -descent, cap.yMax


def tune_text(font, f3s, scale=None, adjust=None):
    """
    Respaces the text font after the F3S font, returning a summary of
    the changes (glyphs respaced, glyphs decomposed and the scale).
    """

    decomposed = decompose(font)
    if scale == "auto":
        scale = auto_scale(font, f3s)
    if scale and abs(float(scale) - 1.0) > 1e-9:
        scale_outlines(font, float(scale))

    glyf = font["glyf"]
    hmtx = font["hmtx"]
    cmap = font.getBestCmap()
    units = cap_units(font)
    done = set()
    changed = 0
    for code, name in sorted(cmap.items()):
        glyph_f3s = f3s["glyphs"].get(code)
        if not glyph_f3s or name in done:
            continue
        done.add(name)
        unit = units / M.size_units(glyph_f3s)
        correction = (adjust or dict()).get(chr(code), dict())
        left, right = correction.get("left", 0), correction.get("right", 0)
        advance = int(round(M.advance(glyph_f3s) * unit + left + right))
        glyph = glyf[name]
        if glyph.numberOfContours and not chr(code).isspace():
            glyph.recalcBounds(glyf)
            centre_old = (glyph.xMin + glyph.xMax) / 2.0
            centre_new = M.ink_centre(glyph_f3s) * unit + left
            shift = int(round(centre_new - centre_old))
            if shift:
                glyph.coordinates.translate((shift, 0))
            glyph.recalcBounds(glyf)
            hmtx[name] = (advance, glyph.xMin)
        else:
            hmtx[name] = (advance, 0)
        changed += 1

    vertical = set_vertical(font)
    font["OS/2"].recalcAvgCharWidth(font)
    if "DSIG" in font:
        del font["DSIG"]
    return dict(changed=changed, decomposed=decomposed, scale=scale, vertical=vertical)


def build_font(entry):
    """
    Generates the F3S counterpart of a manifest entry, refusing an F3S
    file that is not the one the corrections were measured with, and
    returns the bytes of the generated font.
    """

    path = M.find_f3s(entry["f3s"])
    sha256 = M.file_sha256(path)
    if sha256 != entry["f3s_sha256"]:
        raise RuntimeError(
            "%s changed (sha256 %s, manifest %s), measure it again before updating fonts.json"
            % (path, sha256, entry["f3s_sha256"])
        )
    font = open_font(os.path.join(FONTS_DIR, "%s.ttf" % entry["stem"]))
    tune_text(font, M.load_f3s(path), adjust=entry.get("adjust"))
    buffer = io.BytesIO()
    font.save(buffer)
    return buffer.getvalue()


def emoji_targets(font, glyph_f3s):
    """
    Returns the target ink box (left, bottom, width, height) and the
    advance of an emoji glyph in TTF units.
    """

    units = cap_units(font)
    size = M.size_units(glyph_f3s)
    box = M.main_ink(glyph_f3s)
    return dict(
        left=box[0] * units / size,
        bottom=box[1] * units / size,
        width=(box[2] - box[0]) * units / size,
        height=(box[3] - box[1]) * units / size,
        advance=M.advance(glyph_f3s) * units / size,
    )


def tune_emoji(font, mapping, chars=None, tolerance=TOLERANCE):
    """
    Refits the Cool Emojis glyphs off by more than the tolerance (or the
    provided characters) to their F3S glyphs, returning the summary.
    """

    decomposed = decompose(font)
    glyf = font["glyf"]
    hmtx = font["hmtx"]
    cmap = font.getBestCmap()
    limit = tolerance * cap_units(font)
    changed = []
    for char, name in sorted(mapping.items()):
        if chars and not char in chars:
            continue
        if not ord(char) in cmap:
            continue
        glyph_f3s = M.resolve(M.EMOJI_FONT, char, mapping)
        glyph_name = cmap[ord(char)]
        glyph = glyf[glyph_name]
        if glyph_f3s == None or not glyph.numberOfContours > 0:
            continue
        glyph.recalcBounds(glyf)
        target = emoji_targets(font, glyph_f3s)
        deviations = (
            (glyph.yMax - glyph.yMin) - target["height"],
            glyph.yMin - target["bottom"],
            (glyph.xMin + glyph.xMax) / 2.0 - (target["left"] + target["width"] / 2.0),
            hmtx[glyph_name][0] - target["advance"],
        )
        if not chars and max(abs(value) for value in deviations) <= limit:
            continue

        # scales the outline from its bottom left corner to the F3S ink
        # height, placing it on the F3S ink bottom, and then centres it
        # horizontally on the F3S ink centre
        x_min, y_min = glyph.xMin, glyph.yMin
        factor = target["height"] / float(glyph.yMax - glyph.yMin)
        coordinates = glyph.coordinates
        for index in range(len(coordinates)):
            x, y = coordinates[index]
            coordinates[index] = (
                int(round((x - x_min) * factor)),
                int(round((y - y_min) * factor + target["bottom"])),
            )
        glyph.recalcBounds(glyf)
        centre = target["left"] + target["width"] / 2.0
        shift = int(round(centre - (glyph.xMin + glyph.xMax) / 2.0))
        if shift:
            glyph.coordinates.translate((shift, 0))
        glyph.recalcBounds(glyf)
        hmtx[glyph_name] = (int(round(target["advance"])), glyph.xMin)
        changed.append(char)

    space = M.resolve(M.EMOJI_FONT, " ", mapping)
    if 32 in cmap and space:
        space_advance = M.advance(space) * cap_units(font) / M.size_units(space)
        hmtx[cmap[32]] = (int(round(space_advance)), 0)

    if "DSIG" in font:
        del font["DSIG"]
    return dict(changed=changed, decomposed=decomposed)


def check(font, f3s=None, mapping=None, tolerance=TOLERANCE, adjust=None):
    """
    Compares every glyph of the TTF that has an F3S counterpart with the
    model, returning a report with the per glyph deviations (TTF units
    and fraction of the font size) and the coverage gaps.

    The spacing deviations (advance and ink centre) decide the matching
    of the layout, the size deviations (ink height and bottom) the scale
    of the drawing, which for text fonts also reflects the thickness of
    the outline around the F3S centre lines.
    """

    glyf = font["glyf"]
    hmtx = font["hmtx"]
    cmap = font.getBestCmap()
    units = cap_units(font)
    if mapping != None:
        pairs = [
            (char, M.resolve(M.EMOJI_FONT, char, mapping)) for char in sorted(mapping)
        ]
        pairs.append((" ", M.resolve(M.EMOJI_FONT, " ", mapping)))
        missing_f3s = [char for char, glyph in pairs if glyph == None]
    else:
        pairs = [(chr(code), glyph) for code, glyph in sorted(f3s["glyphs"].items())]
        missing_f3s = sorted(
            chr(code)
            for code in cmap
            if not code in f3s["glyphs"] and code > 32 and not chr(code).isspace()
        )
    missing_ttf = sorted(
        char for char, glyph in pairs if glyph != None and not ord(char) in cmap
    )

    rows = []
    for char, glyph_f3s in pairs:
        if glyph_f3s == None or not ord(char) in cmap:
            continue
        name = cmap[ord(char)]
        glyph = glyf[name]
        unit = units / M.size_units(glyph_f3s)
        correction = (adjust or dict()).get(char, dict())
        left, right = correction.get("left", 0), correction.get("right", 0)
        row = dict(
            char=char,
            glyph=name,
            advance=hmtx[name][0],
            advance_model=round(M.advance(glyph_f3s) * unit + left + right, 1),
        )
        row["advance_dev"] = round(row["advance"] - row["advance_model"], 1)
        box = M.main_ink(glyph_f3s)
        if glyph.numberOfContours and box != None and not char.isspace():
            glyph.recalcBounds(glyf)
            centre = (glyph.xMin + glyph.xMax) / 2.0
            row["centre_dev"] = round(centre - (box[0] + box[2]) / 2.0 * unit - left, 1)
            row["height_dev"] = round(
                (glyph.yMax - glyph.yMin) - (box[3] - box[1]) * unit, 1
            )
            row["bottom_dev"] = round(glyph.yMin - box[1] * unit, 1)
        spacing = max(abs(row.get(key, 0.0)) for key in ("advance_dev", "centre_dev"))
        size = max(abs(row.get(key, 0.0)) for key in ("height_dev", "bottom_dev"))
        row["spacing_ok"] = spacing <= tolerance * units
        row["size_ok"] = size <= tolerance * units
        rows.append(row)

    def worst(key):
        values = [abs(row[key]) for row in rows if key in row]
        return round(max(values) / units, 4) if values else 0.0

    vertical = None
    if mapping == None and ord("H") in cmap:
        cap = glyf[cmap[ord("H")]]
        cap.recalcBounds(glyf)
        os2 = font["OS/2"]
        vertical = dict(
            ascent=os2.sTypoAscender,
            descent=os2.sTypoDescender,
            cap=cap.yMax,
            centred=abs((os2.sTypoAscender + os2.sTypoDescender) - cap.yMax) <= 1,
            use_typo=bool(os2.fsSelection & (1 << 7)),
            hhea_matches=font["hhea"].ascent == os2.sTypoAscender
            and font["hhea"].descent == os2.sTypoDescender,
        )
    spacing_off = [row["char"] for row in rows if not row["spacing_ok"]]
    size_off = [row["char"] for row in rows if not row["size_ok"]]
    passed = not spacing_off and (
        vertical == None or (vertical["centred"] and vertical["use_typo"])
    )
    if mapping != None:
        passed = passed and not size_off
    return dict(
        glyphs=len(rows),
        tolerance=tolerance,
        units_per_size=units,
        worst=dict(
            (key, worst(key))
            for key in ("advance_dev", "centre_dev", "height_dev", "bottom_dev")
        ),
        spacing_off=spacing_off,
        size_off=size_off,
        missing_in_ttf=missing_ttf,
        missing_in_f3s=missing_f3s,
        vertical=vertical,
        has_dsig="DSIG" in font,
        passed=passed,
        rows=rows,
    )


def print_check(path, report, limit=12):
    worst = report["worst"]
    print("%s: %s" % (path, "PASS" if report["passed"] else "FAIL"))
    print(
        "  %s glyphs, worst deviation in %% of the font size: advance %.2f, centre %.2f, height %.2f, bottom %.2f"
        % (
            report["glyphs"],
            worst["advance_dev"] * 100,
            worst["centre_dev"] * 100,
            worst["height_dev"] * 100,
            worst["bottom_dev"] * 100,
        )
    )
    tolerance = report["tolerance"] * report["units_per_size"]
    for label, chars, keys in (
        ("spacing", report["spacing_off"], ("advance_dev", "centre_dev")),
        ("size", report["size_off"], ("height_dev", "bottom_dev")),
    ):
        if not chars:
            continue

        # the outlines of a text font have a thickness around the F3S
        # centre lines and their own accent and punctuation drawings, so
        # their size deviations only inform (the spacing ones decide)
        if label == "size" and report["vertical"] != None:
            print(
                "  %s glyphs differ in ink height or bottom by more than %.1f units (outline thickness and drawing differences, informational for text fonts)"
                % (len(chars), tolerance)
            )
            continue

        rows = [row for row in report["rows"] if row["char"] in chars]
        rows.sort(key=lambda row: -max(abs(row.get(key, 0.0)) for key in keys))
        print(
            "  %s glyphs off in %s (over %.1f units):" % (len(rows), label, tolerance)
        )
        for row in rows[:limit]:
            values = " ".join(
                "%s %+.1f" % (key, row[key]) for key in keys if key in row
            )
            print("    %r %-14s %s" % (row["char"], row["glyph"], values))
    if report["missing_in_ttf"]:
        print(
            "  in the F3S but missing in the TTF (previewed with a fallback font): %s"
            % "".join(report["missing_in_ttf"])
        )
    if report["missing_in_f3s"]:
        print(
            "  in the TTF but missing in the F3S (not engraved): %s"
            % "".join(report["missing_in_f3s"])
        )
    if report["vertical"]:
        print("  vertical metrics: %s" % report["vertical"])
    if report["has_dsig"]:
        print("  DSIG table present (invalid once the font is edited)")


def run_build(args):
    differences = []
    for entry in M.load_manifest(args.manifest):
        data = build_font(entry)
        path = os.path.join(args.output or FONTS_DIR, "%s-f3s.ttf" % entry["stem"])
        if args.verify:
            same = False
            if os.path.exists(path):
                with open(path, "rb") as file:
                    same = file.read() == data
            print("%s: %s" % (path, "identical" if same else "DIFFERENT"))
            if not same:
                differences.append(path)
            continue
        with open(path, "wb") as file:
            file.write(data)
        print("%s: %s bytes" % (path, len(data)))
    if differences:
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        description="Tune and check TTF fonts against their F3S counterparts"
    )
    modes = parser.add_subparsers(dest="mode", required=True)

    builder = modes.add_parser(
        "build", help="generate the -f3s.ttf fonts of fonts.json"
    )
    builder.add_argument(
        "--manifest", default=None, help="defaults to the skill fonts.json"
    )
    builder.add_argument("--output", default=None, help="defaults to static/fonts")
    builder.add_argument(
        "--verify",
        action="store_true",
        help="compare with the fonts instead of writing",
    )

    text = modes.add_parser("text", help="respace a text font after its F3S font")
    text.add_argument("--ttf", required=True, help="the regular TTF to start from")
    text.add_argument("--f3s", required=True, help="the F3S font, a path or a name")
    text.add_argument("--output", required=True, help="the tuned TTF to write")
    text.add_argument(
        "--scale", default=None, help="'auto' or a factor for the outlines"
    )
    text.add_argument("--adjust", default=None, help="JSON of per glyph corrections")

    emoji = modes.add_parser(
        "emoji", help="refit Cool Emojis glyphs to their F3S glyphs"
    )
    emoji.add_argument("--ttf", required=True)
    emoji.add_argument(
        "--mapping", default=None, help="defaults to the Signatur mapping"
    )
    emoji.add_argument("--output", required=True)
    emoji.add_argument("--chars", default=None, help="only these, default the ones off")
    emoji.add_argument("--tolerance", type=float, default=TOLERANCE)

    checker = modes.add_parser("check", help="compare a TTF with the F3S model")
    checker.add_argument("--ttf", required=True)
    checker.add_argument("--f3s", default=None, help="the F3S font of a text font")
    checker.add_argument(
        "--emoji", action="store_true", help="check the Cool Emojis font"
    )
    checker.add_argument("--mapping", default=None)
    checker.add_argument("--tolerance", type=float, default=TOLERANCE)
    checker.add_argument("--adjust", default=None, help="JSON of per glyph corrections")
    checker.add_argument(
        "--json", default=None, help="write the full report to this file"
    )

    args = parser.parse_args()
    if args.mode == "build":
        run_build(args)
        return

    font = open_font(args.ttf)
    if args.mode == "text":
        adjust = load_adjust(args.adjust)
        result = tune_text(font, M.load_f3s(args.f3s), scale=args.scale, adjust=adjust)
        font.save(args.output)
        print(
            "%s: %s glyphs respaced, scale %s, ascent/descent/cap %s, decomposed %s"
            % (
                args.output,
                result["changed"],
                result["scale"] or 1,
                result["vertical"],
                len(result["decomposed"]),
            )
        )
    elif args.mode == "emoji":
        mapping = M.load_mapping(args.mapping)
        result = tune_emoji(font, mapping, chars=args.chars, tolerance=args.tolerance)
        font.save(args.output)
        print(
            "%s: refitted %s" % (args.output, "".join(result["changed"]) or "nothing")
        )
    else:
        if not args.emoji and not args.f3s:
            parser.error("check needs --f3s or --emoji")
        mapping = M.load_mapping(args.mapping) if args.emoji else None
        f3s = None if args.emoji else M.load_f3s(args.f3s)
        adjust = load_adjust(args.adjust)
        report = check(
            font, f3s=f3s, mapping=mapping, tolerance=args.tolerance, adjust=adjust
        )
        report["ttf"] = args.ttf
        report["f3s"] = "Cool Emojis mapping" if args.emoji else M.find_f3s(args.f3s)
        report["adjust"] = adjust
        print_check(args.ttf, report)
        if args.json:
            with open(args.json, "w", encoding="utf-8") as file:
                json.dump(report, file, indent=1, ensure_ascii=False)
        sys.exit(0 if report["passed"] else 1)


if __name__ == "__main__":
    main()
