#!/usr/bin/env python3

"""
Tunes and checks TrueType fonts so the Signatur preview lays them out
like Gravostyle engraves their F3S counterparts.

Modes:
    build  regenerates every `static/fonts/<stem>-f3s.ttf` from its
           regular TTF and its F3S font as listed in `fonts.json` (the
           F3S files pinned by their SHA-256, the measured per glyph
           corrections and the outline scale of a TTF whose cap is not
           0.7 em), byte for byte reproducible, `--verify` comparing the
           result with the committed fonts instead of writing them
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
    glyphs draws the accented letters that the regular TTFs lack and the
           F3S fonts engrave, as listed in the `glyphs` of `fonts.json`:
           the outline of the base letter is kept and the accent is
           placed where the F3S glyph draws it, drawn from its F3S lines
           (`f3s`) or taken from a character of the font that has the
           same F3S accent (the tilde of an existing letter), `--verify`
           comparing the result with the fonts instead of writing them

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
    python make_f3s_ttf.py glyphs [--verify]

Requirements:
    pip install fonttools numpy pillow scipy skia-pathops
"""

import io
import os
import sys
import json
import math
import argparse
import unicodedata

from fontTools import agl
from fontTools.ttLib import TTFont
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.recordingPen import DecomposingRecordingPen

import f3s_model as M

FONTS_DIR = os.path.join(M.ROOT_DIR, "static", "fonts")

# the default tolerance of the check, as a fraction of the font size
# (1.5% is 0.075 mm at 5 mm), the tuned fonts stay within rounding
TOLERANCE = 0.015

HINTING_TABLES = ("fpgm", "prep", "cvt ", "hdmx", "LTSH", "VDMX")

# the source of the accent of a glyph drawn from its F3S lines, any other
# source being a character of the font whose accent is used
F3S_SOURCE = "f3s"

# the width of the outline the fonts draw around a single F3S line, as a
# ratio of the em: 14 to 15 units of 1000 in the six fonts, measured on
# the strokes of the one line fonts and on the accents of all of them
LINE_WIDTH = 0.015

# the distance between the ends of an F3S line, as a ratio of the em,
# under which the line is a loop, filled like the fonts fill them
LOOP_GAP = 0.005

# the most an accent that the F3S joins to its letter is extended to get
# into the outline of the letter, in line widths, as the outlines of the
# fonts are not always drawn where the F3S lines are
JOIN_REACH = 3

# the most a coordinate of a drawn glyph may differ from the one in the
# font for both to be the same, the outlines coming from floating point
# path operations
GLYPH_TOLERANCE = 1

_PATHOPS = None


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


def entry_f3s(entry):
    """
    Returns the path of the F3S font of a manifest entry, refusing a
    file that is not the one its fonts were measured with.
    """

    path = M.find_f3s(entry["f3s"])
    sha256 = M.file_sha256(path)
    if sha256 != entry["f3s_sha256"]:
        raise RuntimeError(
            "%s changed (sha256 %s, manifest %s), measure it again before updating fonts.json"
            % (path, sha256, entry["f3s_sha256"])
        )
    return path


def build_font(entry):
    """
    Generates the F3S counterpart of a manifest entry, refusing an F3S
    file that is not the one the corrections were measured with, and
    returns the bytes of the generated font.
    """

    path = entry_f3s(entry)
    font = open_font(os.path.join(FONTS_DIR, "%s.ttf" % entry["stem"]))
    tune_text(
        font, M.load_f3s(path), scale=entry.get("scale"), adjust=entry.get("adjust")
    )
    buffer = io.BytesIO()
    font.save(buffer)
    return buffer.getvalue()


def pathops():
    """
    Imports skia-pathops, the path operations that draw the F3S lines
    as outlines and merge them with the ones of the font, raising an
    explanatory error when it is not installed.
    """

    global _PATHOPS
    if _PATHOPS:
        return _PATHOPS
    try:
        import pathops as module
    except ImportError:
        raise RuntimeError(
            "skia-pathops not found, run pip install -r requirements.txt to draw glyphs"
        )
    _PATHOPS = module
    return _PATHOPS


def base_char(char):
    """
    Returns the letter of an accented character (c for ç), the
    character itself when it has no accent.
    """

    return unicodedata.normalize("NFD", char)[0]


def glyph_path(font, name):
    """
    Returns the outline of a glyph of the font as a path.
    """

    path = pathops().Path()
    font.getGlyphSet()[name].draw(pathops().PathPen(path))
    return path


def contour_width(contour):
    """
    Returns the mean width of a contour of a path, twice its area over
    the length of its points (the control points taken as corners).
    """

    points = [point for _verb, values in contour.segments for point in values]
    length = sum(
        math.hypot(x_b - x_a, y_b - y_a)
        for (x_a, y_a), (x_b, y_b) in zip(points, points[1:] + points[:1])
    )
    return 2.0 * contour.area / length if length else 0.0


def curves_path(curves, width, gap):
    """
    Returns the ink of F3S curves as a path: every curve drawn with the
    provided width (round ends and joins), the curves that end where
    they start and the holes narrower than the width left between the
    curves being filled, like the fonts fill the lines of a stroke.
    """

    ops = pathops()
    drawn, filled = ops.Path(), ops.Path()
    for curve in curves:
        start, end = curve[0][1], curve[-1][1]
        loop = (
            len(curve) > 2 and math.hypot(start[0] - end[0], start[1] - end[1]) <= gap
        )
        for path in (drawn, filled) if loop else (drawn,):
            path.moveTo(*start)
            for control, point in curve[1:]:
                if control == None:
                    path.lineTo(*point)
                else:
                    path.quadTo(control[0], control[1], point[0], point[1])
            if loop:
                path.close()
    drawn.stroke(width, ops.LineCap.ROUND_CAP, ops.LineJoin.ROUND_JOIN, 4)
    drawn.convertConicsToQuads()
    ink = ops.op(
        drawn,
        filled,
        ops.PathOp.UNION,
        fix_winding=True,
        keep_starting_points=False,
        clockwise=True,
    )
    result = ops.Path()
    for contour in ink.contours:
        if contour.clockwise or contour_width(contour) >= width:
            result.addPath(contour)
    return result


def join_curve(outline, curve, joined, width):
    """
    Extends the ends of an accent curve that the F3S joins to its letter
    (start, end) until they get into the outline of the letter, along
    the direction the curve ends with and for at most `JOIN_REACH` line
    widths, an end already in the outline being left as it is.
    """

    curve = list(curve)
    for index, towards in (
        (0, curve[1][0] or curve[1][1]),
        (-1, curve[-1][0] or curve[-2][1]),
    ):
        end = curve[index][1]
        length = math.hypot(end[0] - towards[0], end[1] - towards[1])
        if not joined[index] or not length or outline.contains(end):
            continue
        direction = ((end[0] - towards[0]) / length, (end[1] - towards[1]) / length)
        for step in range(1, int(JOIN_REACH * width) + 1):
            point = (end[0] + direction[0] * step, end[1] + direction[1] * step)
            if not outline.contains(point):
                continue
            if index == 0:
                curve = [(None, point), (None, end)] + curve[1:]
            else:
                curve.append((None, point))
            break
    return curve


def accent_path(font, char):
    """
    Returns the accent of a character of the font as a path: the
    contours of its glyph drawn above the top or below the bottom of
    its letter.
    """

    cmap = font.getBestCmap()
    glyf = font["glyf"]
    base = base_char(char)
    if base == char or not ord(char) in cmap or not ord(base) in cmap:
        raise RuntimeError("%r is not an accented letter of the font" % char)
    letter = glyf[cmap[ord(base)]]
    letter.recalcBounds(glyf)
    accent = pathops().Path()
    for contour in glyph_path(font, cmap[ord(char)]).contours:
        _x_min, y_min, _x_max, y_max = contour.bounds
        if y_min >= letter.yMax or y_max <= letter.yMin:
            accent.addPath(contour)
    if not accent.bounds[2] > accent.bounds[0]:
        raise RuntimeError("%r has no accent apart from its letter" % char)
    return accent


def draw_glyph(font, f3s, char, source=F3S_SOURCE):
    """
    Draws an accented letter after its F3S glyph with the outlines of
    the font, returning the glyph and its advance (the one of the
    letter, like the accented letters of the fonts).

    The outline of the letter is the one of the font and the accent is
    placed where the F3S glyph draws it against the letter: drawn from
    its F3S lines with the line width of the fonts (the `f3s` source) or
    taken from the character of the font given as the source, one with
    the same F3S accent, and centred on the F3S accent.

    An accent that stands apart from the letter is added to the points
    of the letter, kept as they are, and one that touches it is merged
    with its outline, which is then the same within a rounding unit.
    """

    ops = pathops()
    cmap = font.getBestCmap()
    base = base_char(char)
    glyph_f3s = f3s["glyphs"].get(ord(char))
    base_f3s = f3s["glyphs"].get(ord(base))
    if base == char or glyph_f3s == None or base_f3s == None:
        raise RuntimeError("%r has no F3S glyph or no F3S letter to draw from" % char)
    if not ord(base) in cmap:
        raise RuntimeError("the font has no %r to draw %r from" % (base, char))
    accents, letter = M.accent_curves(glyph_f3s, base_f3s)
    if not accents:
        raise RuntimeError("the F3S %r draws no accent on its %r" % (char, base))
    if not letter:
        raise RuntimeError("the F3S %r is not drawn on its %r" % (char, base))

    # finds the pen of the F3S letter in the coordinates of the outline
    # as it is rendered (moved to its left side bearing, which is not
    # always its left edge in the regular fonts), taking the curves of
    # the outline, and not their control points, as centred on the F3S
    # ink (the fonts follow the F3S strokes within a few units, which
    # is how well the accent can be placed against the letter), corrected
    # by the distance between the letter of the accented glyph and its
    # own glyph
    name = cmap[ord(base)]
    outline = glyph_path(font, name)
    x_min, _y_min, x_max, _y_max = outline.bounds
    units = cap_units(font)
    origin = (x_min + x_max) / 2.0 - M.ink_centre(base_f3s) * units / (
        M.size_units(base_f3s)
    )
    base_box = M.points_box(
        point for curve in M.pen_curves(base_f3s) for point in M.flatten(curve)
    )
    letter_box = M.points_box(letter)
    origin -= (letter_box[0] + letter_box[2] - base_box[0] - base_box[2]) / 2.0 * units

    def place(point):
        return (origin + point[0] * units, point[1] * units)

    curves = [
        (
            [
                (None if control == None else place(control), place(point))
                for control, point in curve
            ],
            ends,
        )
        for curve, ends in accents
    ]
    upm = font["head"].unitsPerEm
    if source == F3S_SOURCE:
        width = LINE_WIDTH * upm
        accent = curves_path(
            [join_curve(outline, curve, ends, width) for curve, ends in curves],
            width,
            LOOP_GAP * upm,
        )
    else:
        accent = accent_path(font, source)
        box = accent.bounds
        target = M.points_box(
            point for curve, _ends in curves for point in M.flatten(curve)
        )

        # the transform returns the moved path, leaving the one it is
        # called on where it was
        accent = accent.transform(
            1,
            0,
            0,
            1,
            (target[0] + target[2] - box[0] - box[2]) / 2.0,
            (target[1] + target[3] - box[1] - box[3]) / 2.0,
        )

    accent.convertConicsToQuads()
    common = ops.op(
        outline,
        accent,
        ops.PathOp.INTERSECTION,
        fix_winding=True,
        keep_starting_points=False,
        clockwise=True,
    )
    pen = TTGlyphPen(None)
    if not common.area:
        # draws the letter as the font has it and then the accent,
        # without the points that its curves imply
        font.getGlyphSet()[name].draw(pen)
        accent_pen = TTGlyphPen(None)
        accent.draw(accent_pen)
        accent_pen.glyph(dropImpliedOnCurves=True).draw(pen, font["glyf"])
        return pen.glyph(), font["hmtx"][name][0]

    outline = ops.op(
        outline,
        accent,
        ops.PathOp.UNION,
        fix_winding=True,
        keep_starting_points=True,
        clockwise=True,
    )
    outline.convertConicsToQuads()
    outline.draw(pen)
    return pen.glyph(dropImpliedOnCurves=True), font["hmtx"][name][0]


def set_glyph(font, char, glyph, advance):
    """
    Sets the glyph of a character of the font, adding the character
    when the font lacks it: its name to the glyph order (unless the font
    holds a glyph under that name already, which is then replaced) and
    its code to every character map (the Mac Roman one through its own
    encoding).
    """

    glyf = font["glyf"]
    hmtx = font["hmtx"]
    name = font.getBestCmap().get(ord(char))
    if name == None:
        name = agl.UV2AGL.get(ord(char), "uni%04X" % ord(char))
        if not name in font.getGlyphOrder():
            font.setGlyphOrder(font.getGlyphOrder() + [name])
    glyf[name] = glyph
    glyph.recalcBounds(glyf)
    hmtx[name] = (advance, glyph.xMin)
    for table in font["cmap"].tables:
        if table.isUnicode():
            table.cmap[ord(char)] = name
        elif table.platformID == 1 and table.platEncID == 0:
            try:
                table.cmap[char.encode("mac_roman")[0]] = name
            except UnicodeEncodeError:
                pass
    return name


def glyphs_font(entry):
    """
    Draws the glyphs of a manifest entry into its regular TTF, each
    after the F3S glyph of its character, and returns the font (DSIG is
    dropped as the edits invalidate the signature).
    """

    f3s = M.load_f3s(entry_f3s(entry))
    font = open_font(os.path.join(FONTS_DIR, "%s.ttf" % entry["stem"]))
    for char, source in sorted(entry.get("glyphs", dict()).items()):
        glyph, advance = draw_glyph(font, f3s, char, source=source)
        set_glyph(font, char, glyph, advance)
    if "DSIG" in font:
        del font["DSIG"]
    return font


def different_glyphs(font, other, chars, tolerance=GLYPH_TOLERANCE):
    """
    Returns the characters whose glyph differs between the two fonts,
    in its advance, its contours, the flags of its points (which tell
    the points of the outline from the control ones) or any coordinate
    by more than the tolerance, a character missing in one of them
    differing too, the glyphs built from others being compared by the
    outline they draw.
    """

    different = []
    for char in chars:
        glyphs = []
        for item in (font, other):
            name = item.getBestCmap().get(ord(char))
            if name == None:
                break
            glyf = item["glyf"]
            points, ends, flags = glyf[name].getCoordinates(glyf)
            glyphs.append(
                (item["hmtx"][name][0], list(ends), list(flags), list(points))
            )
        if len(glyphs) < 2:
            different.append(char)
            continue
        advance, ends, flags, points = glyphs[0]
        other_advance, other_ends, other_flags, other_points = glyphs[1]
        same = advance == other_advance and ends == other_ends
        same = same and flags == other_flags
        same = same and len(points) == len(other_points)
        same = same and all(
            abs(x - other_x) <= tolerance and abs(y - other_y) <= tolerance
            for (x, y), (other_x, other_y) in zip(points, other_points)
        )
        if not same:
            different.append(char)
    return different


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


def run_glyphs(args):
    differences = []
    for entry in M.load_manifest(args.manifest):
        if not entry.get("glyphs"):
            continue
        font = glyphs_font(entry)
        chars = "".join(sorted(entry["glyphs"]))
        path = os.path.join(args.output or FONTS_DIR, "%s.ttf" % entry["stem"])
        if args.verify:
            different = list(chars)
            if os.path.exists(path):
                different = different_glyphs(font, TTFont(path), chars)
            if different:
                print("%s: DIFFERENT %s" % (path, "".join(different)))
                differences.append(path)
            else:
                print("%s: the same %s" % (path, chars))
            continue
        font.save(path)
        print("%s: drew %s" % (path, chars))
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

    drawer = modes.add_parser(
        "glyphs", help="draw the missing accented letters of fonts.json"
    )
    drawer.add_argument(
        "--manifest", default=None, help="defaults to the skill fonts.json"
    )
    drawer.add_argument("--output", default=None, help="defaults to static/fonts")
    drawer.add_argument(
        "--verify",
        action="store_true",
        help="compare with the fonts instead of writing",
    )

    args = parser.parse_args()
    if args.mode == "build":
        run_build(args)
        return
    if args.mode == "glyphs":
        run_glyphs(args)
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
