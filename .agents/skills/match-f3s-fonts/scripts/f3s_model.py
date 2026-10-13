#!/usr/bin/env python3

"""
Shared model of how Gravostyle lays out F3S glyphs, used by the other
scripts of the skill to tune, check and measure TrueType fonts against
their F3S engraving counterparts.

The model, measured on dry run compositions of the gravo-gold-std node:

- m[0] F3S units of each glyph are the font size, the cap height in mm:
  5000 for most text glyphs but not all (Roman 4L Ł 20000, Helvetica 4L
  @ 21740), and the glyph height for the Cool Emojis glyphs, so every
  glyph is scaled by its own m[0]
- the strokes are stored normalized to their own bounding box and are
  drawn at x = pen - m[2] and y = baseline - m[4]
- the pen advances by -m[2] + m[6], m[6] counting from the ink left
- m[9] and m[10] are the ink width and height

The F3S parser comes from the gravo-native repository and the bundled
F3S fonts from the gravo-pilot one, both found through the GRAVO_NATIVE
and GRAVO_PILOT environment variables or as siblings of this repository.

Requirements:
    pip install fonttools numpy pillow scipy
"""

import os
import re
import sys
import json
import math
import hashlib

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SKILL_DIR = os.path.dirname(SCRIPT_DIR)
ROOT_DIR = os.path.abspath(os.path.join(SKILL_DIR, "..", "..", ".."))

GRAVO_NATIVE = os.environ.get(
    "GRAVO_NATIVE", os.path.join(os.path.dirname(ROOT_DIR), "gravo-native")
)
GRAVO_PILOT = os.environ.get(
    "GRAVO_PILOT", os.path.join(os.path.dirname(ROOT_DIR), "gravo-pilot")
)

MANIFEST_PATH = os.path.join(SKILL_DIR, "fonts.json")
MAPPING_PATH = os.path.join(ROOT_DIR, "static", "fonts", "coolemojis.mapping.json")

# the font of the Signatur text that holds the emojis, whose characters
# are engraved with one F3S font per glyph through the mapping, the space
# of the font being engraved as a Helvetica 4L space by Signatur
EMOJI_FONT = "Cool Emojis"
EMOJI_SPACE_FONT = "HELVETICA 4L"

# the ratio of the em that renders at the font size in the preview, the
# inverse of the FONT_SIZE_SCALE of `static/js/main.js`
CAP_RATIO = 0.7

# the line pitch of Gravostyle as a ratio of the font size, the source
# of the LINE_HEIGHT_SCALE of `static/js/main.js` (1.76 * 0.7)
LINE_PITCH = 1.76

# the distance to the strokes of the base letter, as a ratio of the font
# size, past which a point of an accented glyph belongs to its accent,
# the letter being drawn up to 2% apart in the two glyphs (their m[0])
ACCENT_DISTANCE = 0.03

_PARSER = None
_FONTS = dict()
_MAPPINGS = dict()


def parser():
    """
    Imports the F3S parser of the gravo-native repository, raising an
    explanatory error when the repository cannot be found.
    """

    global _PARSER
    if _PARSER:
        return _PARSER
    if not os.path.exists(os.path.join(GRAVO_NATIVE, "f3s_parser.py")):
        raise RuntimeError(
            "gravo-native not found at %s, clone hivesolutions/gravo-native and point GRAVO_NATIVE at it"
            % GRAVO_NATIVE
        )
    sys.path.insert(0, GRAVO_NATIVE)
    import f3s_parser

    _PARSER = f3s_parser
    return _PARSER


def f3s_dirs():
    """
    Returns the directories searched for F3S files by name, the fonts
    uploaded to Signatur first and the ones bundled with gravo-pilot
    (the ones the engraving node uses) last.
    """

    return [
        os.path.join(ROOT_DIR, "static", "fonts", "f3s"),
        os.path.join(GRAVO_PILOT, "src", "gravo_pilot", "res", "fonts"),
    ]


def find_f3s(name):
    """
    Resolves an F3S font from a path or a font name, matching the file
    name without case like gravo-pilot does (`Helvetica 4L` finds the
    bundled `HELVETICA 4L.f3s`, `1101.coracao` the emoji glyph).
    """

    if os.path.exists(name):
        return name
    target = ("%s.f3s" % name).lower()
    for directory in f3s_dirs():
        for root, _dirs, files in os.walk(directory):
            for filename in files:
                if filename.lower() == target:
                    return os.path.join(root, filename)
    raise RuntimeError("F3S font %r not found in %s" % (name, f3s_dirs()))


def load_f3s(name):
    path = find_f3s(name)
    if not path in _FONTS:
        _FONTS[path] = parser().parse_f3s(path)
    return _FONTS[path]


def load_mapping(path=None):
    """
    Loads the Cool Emojis mapping (display character to engraving glyph
    font name), the values being a name or an object with a name.
    """

    path = path or MAPPING_PATH
    if not path in _MAPPINGS:
        with open(path, encoding="utf-8") as file:
            data = json.load(file)
        _MAPPINGS[path] = dict(
            (char, entry["name"] if isinstance(entry, dict) else entry)
            for char, entry in data.items()
        )
    return _MAPPINGS[path]


def load_manifest(path=None):
    """
    Loads the manifest of the generated fonts, one entry per font with
    the regular TTF stem, the F3S font name, the SHA-256 of the F3S file
    and the measured per glyph corrections.
    """

    with open(path or MANIFEST_PATH, encoding="utf-8") as file:
        return json.load(file)


def file_sha256(path):
    with open(path, "rb") as file:
        return hashlib.sha256(file.read()).hexdigest()


def resolve(font, char, mapping=None):
    """
    Returns the F3S glyph Gravostyle engraves for a character of the
    provided Signatur font, None when the F3S font has no such glyph.
    """

    if font == EMOJI_FONT:
        if char == " ":
            return load_f3s(EMOJI_SPACE_FONT)["glyphs"].get(32)
        if mapping == None:
            mapping = load_mapping()
        name = mapping.get(char)
        if name == None:
            return None
        return load_f3s(name)["glyphs"].get(ord("a"))
    return load_f3s(font)["glyphs"].get(ord(char))


def advance(glyph):
    metrics = glyph["metrics"]
    return -metrics[2] + metrics[6]


def ink_centre(glyph):
    metrics = glyph["metrics"]
    return -metrics[2] + metrics[9] / 2.0


def size_units(glyph):
    """
    Returns the F3S units of the glyph that render at the font size.
    """

    return float(glyph["metrics"][0])


def polylines(glyph):
    return parser().strokes_to_polylines(glyph)


def main_ink(glyph):
    """
    Returns the ink box (x_min, y_min, x_max, y_max) of the glyph relative
    to the pen on the baseline in F3S units, None for blank glyphs.

    The box is the stored one (m[9] by m[10] at -m[2], -m[4]) unless the
    glyph carries single point strokes next to other strokes, like the
    marker the family emojis draw at their full height (setting m[0] and
    m[10] without being part of the figure), in which case it is the box
    of the other strokes.
    """

    metrics = glyph["metrics"]
    if not metrics[9] and not metrics[10]:
        return None
    box = (
        -metrics[2],
        -metrics[4],
        -metrics[2] + metrics[9],
        -metrics[4] + metrics[10],
    )
    lines = polylines(glyph)
    solid = [
        line for line in lines if len(set((round(x), round(y)) for x, y in line)) > 1
    ]
    if not solid or len(solid) == len(lines):
        return box
    xs = [x for line in solid for x, _y in line]
    ys = [y for line in solid for _x, y in line]
    return (
        min(xs) - metrics[2],
        min(ys) - metrics[4],
        max(xs) - metrics[2],
        max(ys) - metrics[4],
    )


def pen_curves(glyph):
    """
    Returns the strokes of the glyph as curves relative to the pen on
    the baseline, in units of the font size (the m[0] of the glyph):
    each a list of (control, point) steps, the control being None for a
    straight step, as for the first point, or the control point of a
    quadratic curve.

    Reads the strokes like the polylines of the F3S parser do: a control
    point takes the point after it as the end of its curve and a point
    of an unknown kind ends the curve it is in.
    """

    metrics = glyph["metrics"]
    size = size_units(glyph)

    def place(x, y):
        return ((x - metrics[2]) / size, (y - metrics[4]) / size)

    curves = []
    for stroke in glyph["strokes"]:
        steps = []
        index = 0
        while index < len(stroke):
            kind, x, y = stroke[index]
            if not kind in ("on", "ctrl", "end"):
                if len(steps) > 1:
                    curves.append(steps)
                steps = []
                index += 1
                continue
            if kind == "ctrl" and steps and index + 1 < len(stroke):
                _kind, end_x, end_y = stroke[index + 1]
                steps.append((place(x, y), place(end_x, end_y)))
                index += 2
                continue
            steps.append((None, place(x, y)))
            index += 1
        if len(steps) > 1:
            curves.append(steps)
    return curves


def flatten(curve, steps=8):
    """
    Returns the points of a curve as a polyline, every quadratic step
    split in the provided number of straight ones.
    """

    points = []
    for control, point in curve:
        if control == None or not points:
            points.append(point)
            continue
        start = points[-1]
        for step in range(1, steps + 1):
            ratio = step / float(steps)
            inverse = 1 - ratio
            points.append(
                (
                    inverse * inverse * start[0]
                    + 2 * inverse * ratio * control[0]
                    + ratio * ratio * point[0],
                    inverse * inverse * start[1]
                    + 2 * inverse * ratio * control[1]
                    + ratio * ratio * point[1],
                )
            )
    return points


def points_box(points):
    """
    Returns the box (x_min, y_min, x_max, y_max) of the points.
    """

    points = list(points)
    xs = [x for x, _y in points]
    ys = [y for _x, y in points]
    return min(xs), min(ys), max(xs), max(ys)


def lines_distance(point, lines):
    """
    Returns the distance from the point to the nearest of the polylines,
    infinite when there is none.
    """

    best = float("inf")
    for line in lines:
        for (x_a, y_a), (x_b, y_b) in zip(line[:-1], line[1:]):
            delta_x, delta_y = x_b - x_a, y_b - y_a
            length = delta_x * delta_x + delta_y * delta_y
            ratio = 0.0
            if length:
                ratio = (
                    (point[0] - x_a) * delta_x + (point[1] - y_a) * delta_y
                ) / length
                ratio = max(0.0, min(1.0, ratio))
            best = min(
                best,
                math.hypot(
                    point[0] - x_a - ratio * delta_x, point[1] - y_a - ratio * delta_y
                ),
            )
    return best


def accent_curves(glyph, base, distance=ACCENT_DISTANCE):
    """
    Splits an accented glyph in the curves of its accent and the points
    of its letter, both relative to the pen in units of the font size,
    the base glyph being the one of the letter without the accent.

    The accent is every run of points away from the strokes of the base
    glyph, taken with the point before and the point after it, as an
    accent may continue a stroke of the letter (the cedilla of the Roman
    4L Ç is the end of one of the lines of its C), each curve coming
    with the ends that are joined to the letter (start, end).
    """

    base_lines = [flatten(curve) for curve in pen_curves(base)]

    def away(point):
        return lines_distance(point, base_lines) > distance

    accents, letter = [], []
    for curve in pen_curves(glyph):
        letter.extend(point for point in flatten(curve) if not away(point))
        far = [away(point) for _control, point in curve]
        index = 0
        while index < len(curve):
            if not far[index]:
                index += 1
                continue
            end = index
            while end + 1 < len(curve) and far[end + 1]:
                end += 1
            steps = curve[max(index - 1, 0) : end + 2]
            steps = [(None, steps[0][1])] + steps[1:]
            joined = (not away(steps[0][1]), not away(steps[-1][1]))
            accents.append((steps, joined))
            index = end + 1
    return accents, letter


def font_files(root=None):
    """
    Returns the font family to TTF file mapping declared by the font
    faces of the Signatur stylesheet.
    """

    root = root or ROOT_DIR
    css_path = os.path.join(root, "static", "css", "layout.css")
    with open(css_path, encoding="utf-8") as file:
        css = file.read()
    pattern = r'font-family:\s*"([^"]+)";\s*src:\s*url\(/static/fonts/([^)]+)\)'
    return dict(
        (family, os.path.join(root, "static", "fonts", name))
        for family, name in re.findall(pattern, css)
    )


def ttf_for(family, f3s=False, root=None):
    """
    Resolves the TTF that renders a family in the Signatur preview, the
    `-f3s` counterpart when the F3S fonts toggle is on and one exists.
    """

    path = font_files(root).get(family)
    if path == None:
        raise RuntimeError("no font face declared for %r" % family)
    if f3s:
        candidate = "%s-f3s.ttf" % path[: -len(".ttf")]
        if os.path.exists(candidate):
            return candidate
    return path


def case_lines(case):
    """
    Returns the lines a case engraves, the lines of its text plus its
    typed lines (Cool Emojis lines typed through the viewport keyboard,
    as the pipe emoji cannot travel in the viewport URL).
    """

    typed = [[[EMOJI_FONT, line]] for line in case.get("typed", [])]
    return case["lines"] + typed


def segments(line, font):
    """
    Returns a case line as a list of (font, text) segments, a line being
    either a plain string in the case font or a list of [font, text].
    """

    if isinstance(line, str):
        return [(font, line)]
    return [(segment[0], segment[1]) for segment in line]


def elements(line, font):
    return [
        (segment_font, char)
        for segment_font, text in segments(line, font)
        for char in text
    ]
