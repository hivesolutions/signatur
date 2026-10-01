#!/usr/bin/env python3

import io
import os
import sys
import json
import base64
import shutil
import tempfile
import unittest
import contextlib
import subprocess

from unittest import mock

import numpy
from PIL import Image, ImageDraw
from fontTools.ttLib import TTFont

ROOT_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "..")
)
SCRIPTS_DIR = os.path.join(ROOT_DIR, ".agents", "skills", "match-f3s-fonts", "scripts")
sys.path.insert(0, SCRIPTS_DIR)

import f3s_model as M
import measure

SPACE = dict(metrics=[5000, 0, -428, 0, 0, 0, 3862, 0, 0, 3419, 0], strokes=[])

H = dict(
    metrics=[5000, 0, -650, 0, 0, 0, 4570, 0, 0, 3920, 5000],
    strokes=[
        [["on", 0, 0], ["end", 0, 5000]],
        [["on", 3920, 0], ["end", 3920, 5000]],
        [["on", 0, 2500], ["end", 3920, 2500]],
    ],
)

X = dict(
    metrics=[5000, 0, -300, 0, 0, 0, 4000, 0, 0, 3700, 5000],
    strokes=[
        [["on", 0, 0], ["end", 3700, 5000]],
        [["on", 0, 5000], ["end", 3700, 0]],
    ],
)

# stored at twice the units of the other glyphs, like some F3S glyphs
# are, so that only a per glyph scale lays it out right
O = dict(
    metrics=[10000, 0, -1000, 0, 0, 0, 9800, 0, 0, 8800, 10000],
    strokes=[
        [
            ["on", 0, 0],
            ["on", 8800, 0],
            ["on", 8800, 10000],
            ["on", 0, 10000],
            ["end", 0, 0],
        ]
    ],
)

V = dict(
    metrics=[5000, 0, -300, 0, 0, 0, 4000, 0, 0, 3700, 5000],
    strokes=[[["on", 0, 5000], ["on", 1850, 0], ["end", 3700, 5000]]],
)

L = dict(
    metrics=[5000, 0, -650, 0, 0, 0, 3500, 0, 0, 2900, 5000],
    strokes=[[["on", 0, 5000], ["on", 0, 0], ["end", 2900, 0]]],
)

# the less than sign, that the Helvetica 4L TTFs lack, drawn above the
# baseline (m[4] below zero)
LESS = dict(
    metrics=[5000, 0, -500, 0, -500, 0, 3500, 0, 0, 3000, 4000],
    strokes=[[["on", 3000, 0], ["on", 0, 2000], ["end", 3000, 4000]]],
)

FAMILY = dict(
    metrics=[9417, 0, 0, 0, 0, 0, 5705, 0, 0, 5705, 9417],
    strokes=[
        [["on", 0, 0], ["on", 5705, 0], ["end", 2852, 8297]],
        [["on", 2852, 9417], ["end", 2852, 9417]],
    ],
)

GLYPHS = {" ": SPACE, "H": H, "X": X, "O": O, "V": V, "L": L, "<": LESS}

FONT = "Helvetica 4L"
SIZE = 4
PLATE = (40, 24)
MARGINS = [2, 2, 2, 2]

# the composition screenshot: 12 px per mm, the plate border drawn from
# the BORDER pixel, inside an image smaller than the 2512x1009 ones of
# gravo-pilot to keep the tests fast
PX_MM = 12
BORDER = (60, 50)
IMAGE_SIZE = (600, 400)

LAYOUT_CSS = """@font-face {
    font-family: "Helvetica 4L";
    src: url(/static/fonts/helvetica4l.ttf);
}

@font-face {
    font-family: "Roman 4L";
    src: url(/static/fonts/roman4l.ttf);
}
"""


class FakeParser(object):
    """
    Stand-in for the F3S parser of the gravo-native repository, that is
    not public, reading the glyphs of a font from the JSON the tests
    write to its F3S file.
    """

    def parse_f3s(self, path):
        with open(path, encoding="utf-8") as file:
            glyphs = json.load(file)
        return dict(glyphs=dict((int(code), glyph) for code, glyph in glyphs.items()))

    def strokes_to_polylines(self, glyph):
        return [
            [(x, y) for _kind, x, y in stroke] for stroke in glyph["strokes"] if stroke
        ]


class MeasureTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self._gravo_pilot = M.GRAVO_PILOT
        self._parser = M._PARSER
        self._ttf = measure._TTF
        measure._TTF = dict()

    def tearDown(self):
        M.GRAVO_PILOT = self._gravo_pilot
        M._PARSER = self._parser
        measure._TTF = self._ttf
        shutil.rmtree(self.temp_dir)

    def _write(self, path, data):
        path = os.path.join(self.temp_dir, path)
        if not os.path.exists(os.path.dirname(path)):
            os.makedirs(os.path.dirname(path))
        with open(path, "w", encoding="utf-8") as file:
            file.write(data)
        return path

    def _fonts(self, fonts=None):
        M._PARSER = FakeParser()
        M.GRAVO_PILOT = self.temp_dir
        if fonts == None:
            fonts = {
                "HELVETICA 4L": dict(
                    (str(ord(char)), glyph) for char, glyph in GLYPHS.items()
                )
            }
        for name, glyphs in fonts.items():
            self._write(
                os.path.join("src", "gravo_pilot", "res", "fonts", "%s.f3s" % name),
                json.dumps(glyphs),
            )

    def _root(self):
        """
        Creates a Signatur checkout in the temporary directory with the
        stylesheet declaring the font faces and copies of the public TTF
        fonts that the viewport renders.
        """

        root = os.path.join(self.temp_dir, "signatur")
        self._write(os.path.join("signatur", "static", "css", "layout.css"), LAYOUT_CSS)
        os.makedirs(os.path.join(root, "static", "fonts"))
        for name in ("helvetica4l.ttf", "helvetica4l-f3s.ttf", "roman4l.ttf"):
            shutil.copy(
                os.path.join(ROOT_DIR, "static", "fonts", name),
                os.path.join(root, "static", "fonts", name),
            )
        return root

    def _layout(self, lines, size=SIZE, shift=None, glyphs=GLYPHS):
        """
        Lays out the lines like Gravostyle does (the F3S model): the pen
        advancing by -m[2] + m[6] at size / m[0] mm per unit, every line
        centred on its ink inside the margin box and the block centred
        from the first cap top to the last baseline, the line pitch being
        1.76 times the size; `shift` moves a line by that many mm.
        """

        left, right, top, bottom = MARGINS
        pitch = M.LINE_PITCH * size
        span = (len(lines) - 1) * pitch + size
        cap_top = top + (PLATE[1] - top - bottom - span) / 2.0
        layout = []
        for index, text in enumerate(lines):
            pen, placed = 0.0, []
            for char in text:
                glyph = glyphs[char]
                unit = size / M.size_units(glyph)
                placed.append(dict(char=char, glyph=glyph, pen=pen, unit=unit))
                pen += M.advance(glyph) * unit
            inks = []
            for item in placed:
                metrics = item["glyph"]["metrics"]
                if item["glyph"]["strokes"]:
                    ink_left = item["pen"] - metrics[2] * item["unit"]
                    inks.extend([ink_left, ink_left + metrics[9] * item["unit"]])
            area = PLATE[0] - left - right
            offset = left + (area - (max(inks) - min(inks))) / 2.0 - min(inks)
            offset += (shift or dict()).get(index, 0.0)
            for item in placed:
                item["pen"] += offset
                item["centre"] = (
                    item["pen"] + M.ink_centre(item["glyph"]) * item["unit"]
                )
            baseline = cap_top + size + index * pitch
            layout.append(dict(text=text, baseline=baseline, glyphs=placed))
        return layout

    def _draw(self, draw, layout, scale, origin):
        # draws the strokes of the laid out glyphs at `scale` px per mm,
        # two pixels wide like the Gravostyle strokes
        for line in layout:
            for item in line["glyphs"]:
                metrics, unit = item["glyph"]["metrics"], item["unit"]
                for stroke in item["glyph"]["strokes"]:
                    points = []
                    for _kind, x, y in stroke:
                        x_mm = item["pen"] + (x - metrics[2]) * unit
                        y_mm = line["baseline"] - (y - metrics[4]) * unit
                        points.append(
                            (origin[0] + x_mm * scale, origin[1] + y_mm * scale)
                        )
                    draw.line(points, fill=(0, 0, 0), width=2)

    def _composition(self, path, layout, blocks=()):
        """
        Writes a Gravostyle composition screenshot: the white plate with
        its one pixel border on the dark background, the dashed margin
        box and the strokes of the laid out glyphs (plus filled blocks
        given as mm boxes), at PX_MM pixels per mm.
        """

        image = Image.new("RGB", IMAGE_SIZE, (74, 75, 75))
        draw = ImageDraw.Draw(image)
        width, height = PLATE[0] * PX_MM, PLATE[1] * PX_MM
        draw.rectangle(
            [BORDER[0], BORDER[1], BORDER[0] + width, BORDER[1] + height],
            fill=(255, 255, 255),
            outline=(0, 0, 0),
        )
        origin = (BORDER[0] + 0.5, BORDER[1] + 0.5)
        left, right, top, bottom = (value * PX_MM for value in MARGINS)
        x_a, y_a = origin[0] + left, origin[1] + top
        x_b, y_b = origin[0] + width - right, origin[1] + height - bottom
        for x in range(int(x_a), int(x_b), 6):
            draw.line([(x, y_a), (x + 2, y_a)], fill=(0, 0, 0))
            draw.line([(x, y_b), (x + 2, y_b)], fill=(0, 0, 0))
        for y in range(int(y_a), int(y_b), 6):
            draw.line([(x_a, y), (x_a, y + 2)], fill=(0, 0, 0))
            draw.line([(x_b, y), (x_b, y + 2)], fill=(0, 0, 0))
        for box in blocks:
            corners = [
                origin[index % 2] + value * PX_MM for index, value in enumerate(box)
            ]
            draw.rectangle(corners, fill=(0, 0, 0))
        self._draw(draw, layout, PX_MM, origin)
        image.save(path)
        return path

    def _shot(self, layout, blocks=()):
        path = os.path.join(self.temp_dir, "composition.png")
        self._composition(path, layout, blocks=blocks)
        return measure.Screenshot(path, PLATE[0], PLATE[1])

    def _bounds(self, path, char):
        face = TTFont(path)
        glyf = face["glyf"]
        glyph = glyf[face.getBestCmap()[ord(char)]]
        glyph.recalcBounds(glyf)
        return glyph.xMin, glyph.xMax

    def _entry(self, case, layout, root, zoom=2.0, payload=True):
        """
        Builds the capture.js entry of a case whose viewport draws every
        glyph centred on the ink centre the layout gives it, placing the
        character boxes from the outline bounds and the vertical metrics
        of the TTF that renders them, the viewport zoomed by `zoom`.
        """

        face = TTFont(os.path.join(root, "static", "fonts", "helvetica4l-f3s.ttf"))
        cmap, glyf = face.getBestCmap(), face["glyf"]
        upm = float(face["head"].unitsPerEm)
        ascent, descent = face["OS/2"].sTypoAscender, -face["OS/2"].sTypoDescender
        px_mm = measure.VIEWPORT_SCALE * zoom
        plate = dict(
            left=100.0, top=50.0, width=PLATE[0] * px_mm, height=PLATE[1] * px_mm
        )
        font_size = case["font_size"] / M.CAP_RATIO * measure.VIEWPORT_SCALE
        line_height = font_size * M.LINE_PITCH * M.CAP_RATIO
        size_px, line_px = font_size * zoom, line_height * zoom
        content = (ascent + descent) * size_px / upm
        spans, text = [], []
        for index, line in enumerate(layout):
            if index > 0:
                spans.append(
                    dict(
                        char="\n",
                        font="",
                        display="block",
                        left=0.0,
                        right=0.0,
                        top=0.0,
                        bottom=0.0,
                    )
                )
                text.append([None, "\n"])
            text.append([FONT, line["text"]])
            top = (
                plate["top"]
                + line["baseline"] * px_mm
                - (line_px - content) / 2.0
                - ascent * size_px / upm
            )
            for glyph in line["glyphs"]:
                left = plate["left"] + glyph["pen"] * px_mm
                name = cmap.get(ord(glyph["char"]))
                if name != None and glyf[name].numberOfContours:
                    bounds = glyf[name]
                    bounds.recalcBounds(glyf)
                    left = (
                        plate["left"]
                        + glyph["centre"] * px_mm
                        - (bounds.xMin + bounds.xMax) / 2.0 * size_px / upm
                    )
                spans.append(
                    dict(
                        char=glyph["char"],
                        font=FONT,
                        display="block",
                        left=left,
                        right=left + 10.0,
                        top=top,
                        bottom=top + line_px,
                    )
                )
        entry = dict(
            case=case,
            plate=plate,
            fontSize=font_size,
            lineHeight=line_height,
            fontFamily="Lato, sans-serif",
            fontSizeInput=str(case["font_size"]),
            spans=spans,
        )
        if payload:
            entry["job"] = dict(id="job-%s" % case["name"], status="queued")
            entry["payload"] = dict(
                text=text,
                font=FONT,
                debug=True,
                dry_run=True,
                record=False,
                check_path=False,
                width=case["width"],
                height=case["height"],
                font_size=case["font_size"],
                margins=case["margins"],
            )
        return entry

    def _case(self, name, lines):
        return dict(
            name=name,
            font=FONT,
            font_size=SIZE,
            lines=lines,
            profile="plate",
            width=PLATE[0],
            height=PLATE[1],
            margins=list(MARGINS),
            f3s=True,
        )

    def _capture(
        self, directory, root, cases, fonts=True, label="after", zoom=2.0, payload=True
    ):
        """
        Writes a capture.js run of the cases (name and lines) in the
        directory, the capture.json plus the plate and viewport images of
        every case, the fonts loaded recorded unless `fonts` is false (a
        capture made before the font hashes were recorded).
        """

        if not os.path.exists(directory):
            os.makedirs(directory)
        entries = dict()
        scale = measure.VIEWPORT_SCALE * zoom * 2
        size = (int(PLATE[0] * scale), int(PLATE[1] * scale))
        for name, lines in cases:
            layout = self._layout(lines)
            entries[name] = self._entry(
                self._case(name, lines), layout, root, zoom=zoom, payload=payload
            )
            for kind in ("plate", "viewport"):
                image = Image.new("RGB", size, (255, 255, 255))
                self._draw(ImageDraw.Draw(image), layout, scale, (0, 0))
                image.save(os.path.join(directory, "%s-%s.png" % (name, kind)))
        meta = dict(
            label=label,
            base_url="http://127.0.0.1:3123",
            root=root,
            date="2026-10-01T16:28:03.144Z",
            device_scale_factor=2,
        )
        if fonts:
            path = os.path.join(root, "static", "fonts", "helvetica4l-f3s.ttf")
            meta["fonts"] = {"/static/fonts/helvetica4l-f3s.ttf": M.file_sha256(path)}
        capture = dict(meta=meta, cases=entries)
        path = os.path.join(directory, "capture.json")
        with open(path, "w", encoding="utf-8") as file:
            json.dump(capture, file)
        return capture

    def _gravo(self, directory, name, lines, shift=None):
        if not os.path.exists(directory):
            os.makedirs(directory)
        path = os.path.join(directory, "%s-composition.png" % name)
        return self._composition(path, self._layout(lines, shift=shift))

    def _measure(self, name, captures, directory):
        images = measure.Images(os.path.join(self.temp_dir, "report"))
        return measure.measure_case(
            name, captures, directory, measure.THRESHOLDS, 24, images
        )

    def _result(self, **values):
        result = dict(
            trimmed=False,
            shown=7,
            expected=7,
            glyphs=7,
            spacing_mean=0.02,
            spacing_max=0.05,
            absolute_mean=0.03,
            absolute_max=0.08,
            widths=[-0.01, 0.02],
            baselines=[0.02, 0.10],
            height=0.01,
            match=0.98,
            match_min=0.91,
            worst=[
                dict(char="O", line=1, error=0.05),
                dict(char="X", line=2, error=-0.04),
            ],
            missing_in_ttf=[],
            missing_in_f3s=[],
            unmatched=[],
            typing=[],
            overflow=[],
            steps_off=[],
        )
        result.update(values)
        return result

    def _main(self, *args):
        stdout = io.StringIO()
        argv = ["measure.py"]
        argv.extend(args)
        with mock.patch.object(sys, "argv", argv):
            with mock.patch.object(measure, "git_head", return_value="abc1234"):
                with contextlib.redirect_stdout(stdout):
                    measure.main()
        return stdout.getvalue().splitlines()

    def test_ttf(self):
        path = os.path.join(ROOT_DIR, "static", "fonts", "helvetica4l.ttf")

        face = measure.ttf(path)
        self.assertEqual(face["head"].unitsPerEm, 1000)
        self.assertIs(measure.ttf(path), face)

        other = measure.ttf(
            os.path.join(ROOT_DIR, "static", "fonts", "helvetica4l-f3s.ttf")
        )
        self.assertIsNot(other, face)
        self.assertEqual(len(measure._TTF), 2)

    def test_screenshot(self):
        shot = self._shot([])
        self.assertEqual(shot.image.size, IMAGE_SIZE)
        self.assertEqual(shot.pixels.shape, (400, 600, 3))
        self.assertEqual((shot.width_mm, shot.height_mm), PLATE)

        # the plate edges sit at the middle of its one pixel border
        self.assertEqual((shot.x0, shot.x1), (60.5, 540.5))
        self.assertEqual((shot.y0, shot.y1), (50.5, 338.5))
        self.assertEqual((shot.px_mm_x, shot.px_mm_y), (12.0, 12.0))

        # the text and the margin box do not move the calibration
        shot = self._shot(self._layout(["HXOV", "LXH"]))
        self.assertEqual(
            (shot.x0, shot.x1, shot.y0, shot.y1), (60.5, 540.5, 50.5, 338.5)
        )

        # the scale follows the plate size of the payload
        shot = measure.Screenshot(shot.path, 48, 32)
        self.assertEqual((shot.px_mm_x, shot.px_mm_y), (10.0, 9.0))

    def test_to_mm(self):
        shot = self._shot([])

        self.assertEqual(shot.to_mm(60.5, 50.5), (0.0, 0.0))
        self.assertEqual(shot.to_mm(540.5, 338.5), (40.0, 24.0))
        self.assertEqual(shot.to_mm(180.5, 110.5), (10.0, 5.0))
        self.assertEqual(shot.to_mm(0.5, 2.5), (-5.0, -4.0))

    def test_to_px(self):
        shot = self._shot([])

        self.assertEqual(shot.to_px(0, 0), (60.5, 50.5))
        self.assertEqual(shot.to_px(40, 24), (540.5, 338.5))
        self.assertEqual(shot.to_px(10, 5), (180.5, 110.5))

        x, y = shot.to_mm(*shot.to_px(12.3, 4.5))
        self.assertAlmostEqual(x, 12.3)
        self.assertAlmostEqual(y, 4.5)

    def test_ink(self):
        layout = self._layout(["HXOV"])
        shot = self._shot(layout, blocks=[(0.5, 0.5, 1.5, 1.5)])

        ink = shot.ink(MARGINS)
        self.assertEqual(ink.shape, (400, 600))
        self.assertEqual(ink.dtype, bool)

        # nothing is kept outside the margin box less its guard, neither
        # the dashed margin lines nor the ink drawn in the margins
        self.assertFalse(ink[:77].any())
        self.assertFalse(ink[312:].any())
        self.assertFalse(ink[:, :87].any())
        self.assertFalse(ink[:, 514:].any())
        self.assertTrue((shot.pixels[57:67, 67:77] < 140).all())

        # the ink of the glyphs is kept, the crossbar of the H 2 mm above
        # the baseline across its centre
        x, y = shot.to_px(layout[0]["glyphs"][0]["centre"], layout[0]["baseline"] - 2)
        self.assertTrue(ink[int(y) - 1 : int(y) + 2, int(x)].any())
        self.assertFalse(ink[int(y) - 12 : int(y) - 3, int(x)].any())

        # without the guard the dashed margin lines are taken as ink
        loose = shot.ink(MARGINS, guard_px=0)
        self.assertTrue(loose[74:76].any())
        self.assertTrue((loose >= ink).all())
        self.assertGreater(loose.sum(), ink.sum())

    def test_columns(self):
        shot = self._shot([], blocks=[(1, 10, 39, 11)])

        self.assertEqual(shot.columns(MARGINS), (87, 513))
        self.assertEqual(shot.columns(MARGINS, guard_px=0), (84, 516))
        self.assertEqual(shot.columns([10, 5, 2, 2]), (183, 477))

        # the first and the last columns that the ink mask may hold
        columns = numpy.nonzero(shot.ink(MARGINS).any(axis=0))[0]
        self.assertEqual((columns.min(), columns.max()), shot.columns(MARGINS))
        columns = numpy.nonzero(shot.ink(MARGINS, guard_px=0).any(axis=0))[0]
        self.assertEqual(
            (columns.min(), columns.max()), shot.columns(MARGINS, guard_px=0)
        )

    def test_bands(self):
        shot = self._shot([])
        ink = numpy.zeros((200, 50), dtype=bool)
        ink[10:13, 5:8] = True
        ink[20:61, 5:40] = True
        ink[62:65, 10:12] = True
        ink[100:141, 5:40] = True
        ink[180:200, 5:40] = True

        # the short band above a line (a marker) is folded into the band
        # below it, the bands two rows apart merged and a band touching
        # the bottom of the ink kept
        bands = shot.bands(ink, SIZE)
        self.assertEqual(bands, [[10, 64], [100, 140], [180, 199]])

        # a band is short when it spans under a fifth of the size (9.6
        # rows here, 14.4 at 6 mm)
        ink = numpy.zeros((200, 50), dtype=bool)
        ink[10:20, 5:8] = True
        ink[30:71, 5:40] = True
        self.assertEqual(shot.bands(ink, SIZE), [[10, 70]])
        ink[20, 5:8] = True
        bands = shot.bands(ink, SIZE)
        self.assertEqual(bands, [[10, 20], [30, 70]])
        bands = shot.bands(ink, 6)
        self.assertEqual(bands, [[10, 70]])

        # the gap that merges two bands
        ink = numpy.zeros((200, 50), dtype=bool)
        ink[20:61, 5:40] = True
        ink[64:105, 5:40] = True
        self.assertEqual(shot.bands(ink, SIZE), [[20, 60], [64, 104]])
        self.assertEqual(shot.bands(ink, SIZE, gap_px=4), [[20, 104]])

        self.assertEqual(shot.bands(numpy.zeros((200, 50), dtype=bool), SIZE), [])

    def test_bands_count(self):
        shot = self._shot([])
        ink = numpy.zeros((200, 50), dtype=bool)
        ink[10:26, 5:40] = True
        ink[30:71, 5:40] = True
        ink[100:141, 5:40] = True

        self.assertEqual(shot.bands(ink, SIZE), [[10, 25], [30, 70], [100, 140]])
        self.assertEqual(
            shot.bands(ink, SIZE, count=3), [[10, 25], [30, 70], [100, 140]]
        )
        self.assertEqual(
            shot.bands(ink, SIZE, count=5), [[10, 25], [30, 70], [100, 140]]
        )

        # the bands beyond the count are merged with the neighbour whose
        # pair spans the least, an accent standing apart from its line
        self.assertEqual(shot.bands(ink, SIZE, count=2), [[10, 70], [100, 140]])
        self.assertEqual(shot.bands(ink, SIZE, count=1), [[10, 140]])

    def test_bands_trailing(self):
        shot = self._shot([])

        # a last line of short glyphs (dashes) is a band of its own
        ink = numpy.zeros((200, 50), dtype=bool)
        ink[20:61, 5:40] = True
        ink[100:103, 5:40] = True
        self.assertEqual(shot.bands(ink, SIZE), [[20, 60], [100, 102]])
        self.assertEqual(shot.bands(ink, SIZE, count=2), [[20, 60], [100, 102]])

        # merged into the line above when the case has a single line
        self.assertEqual(shot.bands(ink, SIZE, count=1), [[20, 102]])

        # and the only band of a case made of short glyphs
        ink = numpy.zeros((200, 50), dtype=bool)
        ink[100:103, 5:40] = True
        self.assertEqual(shot.bands(ink, SIZE, count=1), [[100, 102]])

    def test_glyph_template(self):
        self._fonts(dict())

        tpl, pad, baseline, left = measure.glyph_template(H, 0.01)
        self.assertEqual(tpl.dtype, bool)
        self.assertEqual(tpl.shape, (58, 47))
        self.assertEqual(pad, 3)
        self.assertEqual(baseline, 53.0)
        self.assertEqual(left, 650)

        # the stems run the whole height, the crossbar at mid height
        self.assertTrue(tpl[4:52, 2:5].any(axis=1).all())
        self.assertTrue(tpl[4:52, 41:44].any(axis=1).all())
        self.assertTrue(tpl[27:30, 5:41].any(axis=0).all())
        self.assertFalse(tpl[8:24, 8:38].any())
        self.assertFalse(tpl[:2].any())
        self.assertFalse(tpl[-2:].any())

        # the baseline row and the stroke left follow m[4] and m[2]
        tpl, pad, baseline, left = measure.glyph_template(LESS, 0.01)
        self.assertEqual(tpl.shape, (48, 38))
        self.assertEqual(baseline, 48.0)
        self.assertEqual(left, 500)

        # strokes starting right of the ink left move the stroke left
        glyph = dict(
            metrics=[5000, 0, -100, 0, 0, 0, 3000, 0, 0, 2000, 5000],
            strokes=[[["on", 1000, 0], ["end", 1000, 5000]]],
        )
        tpl, pad, baseline, left = measure.glyph_template(glyph, 0.01)
        self.assertEqual(tpl.shape, (58, 8))
        self.assertEqual(left, 1100)

        # a stroke ending where it starts (the family marker) or made of a
        # single point is drawn as a dot
        tpl, pad, baseline, left = measure.glyph_template(FAMILY, 0.01)
        self.assertEqual(tpl.shape, (102, 65))
        self.assertTrue(tpl[2:5, 30:33].any())
        glyph = dict(
            H, strokes=[H["strokes"][0], H["strokes"][1], [["end", 2000, 2500]]]
        )
        tpl, pad, baseline, left = measure.glyph_template(glyph, 0.01)
        self.assertTrue(tpl[27:30, 22:25].any())
        self.assertFalse(tpl[27:30, 8:20].any())

        # a blank glyph has no template
        self.assertEqual(measure.glyph_template(SPACE, 0.01), None)

    def test_match(self):
        self._fonts(dict())
        template = measure.glyph_template(H, 0.0096)
        tpl, pad, tpl_baseline, _left = template
        ink = numpy.zeros((100, 150), dtype=bool)
        ink[20 : 20 + tpl.shape[0], 30 : 30 + tpl.shape[1]] = tpl

        # the stroke left is found around a wrong guess, with the whole
        # template on the ink
        x, hit, dy = measure.match(ink, template, 20 + tpl_baseline, 35.0, 5)
        self.assertAlmostEqual(x, 30 + pad, delta=0.5)
        self.assertEqual(hit, 1.0)

        # the vertical offset of the best overlap from the guessed baseline,
        # the dilated strokes scoring alike one pixel around it
        self.assertLessEqual(abs(dy), 1)
        x, hit, dy = measure.match(ink, template, 20 + tpl_baseline - 4, 31.0, 5)
        self.assertAlmostEqual(x, 30 + pad, delta=0.5)
        self.assertEqual(hit, 1.0)
        self.assertLessEqual(abs(dy - 4), 1)

        # out of the vertical search the template is only partly found
        _x, hit, _dy = measure.match(
            ink, template, 20 + tpl_baseline - 8, 33.0, 5, vertical_px=2
        )
        self.assertLess(hit, 0.8)

        # the score is the share of the template found on the ink
        ink[:, 30 + tpl.shape[1] // 2 :] = False
        x, hit, dy = measure.match(ink, template, 20 + tpl_baseline, 33.0, 5)
        self.assertGreater(hit, 0.3)
        self.assertLess(hit, 0.7)

    def test_match_outside(self):
        self._fonts(dict())
        template = measure.glyph_template(H, 0.0096)

        # no window of the search fits the ink
        ink = numpy.ones((30, 150), dtype=bool)
        self.assertEqual(measure.match(ink, template, 50.0, 40.0, 5), None)
        ink = numpy.ones((100, 30), dtype=bool)
        self.assertEqual(measure.match(ink, template, 50.0, 10.0, 5), None)

    def test_walk(self):
        self._fonts()
        layout = self._layout(["HXOV"])
        shot = self._shot(layout)
        ink = shot.ink(MARGINS)
        baseline_px = shot.to_px(0, layout[0]["baseline"])[1]

        result = measure.walk(shot, ink, "HXOV", FONT, dict(), SIZE, baseline_px, 3)
        self.assertEqual([glyph["char"] for glyph in result], ["H", "X", "O", "V"])
        for glyph, placed in zip(result, layout[0]["glyphs"]):
            self.assertEqual(
                sorted(glyph), ["centre", "char", "dy", "height", "hit", "ink"]
            )
            self.assertAlmostEqual(glyph["centre"], placed["centre"], delta=0.08)
            self.assertGreaterEqual(glyph["hit"], 0.95)
            self.assertLessEqual(abs(glyph["dy"]), 2)
            metrics = placed["glyph"]["metrics"]
            ink_left = placed["pen"] - metrics[2] * placed["unit"]
            self.assertAlmostEqual(glyph["ink"][0], ink_left, delta=0.08)
            self.assertAlmostEqual(
                glyph["ink"][1], ink_left + metrics[9] * placed["unit"], delta=0.08
            )
            self.assertAlmostEqual(glyph["height"], SIZE, delta=1e-9)

        # a line of segments reads the font of every segment
        line = [[FONT, "HX"], [FONT, "OV"]]
        segmented = measure.walk(
            shot, ink, line, "Roman 4L", None, SIZE, baseline_px, 3
        )
        self.assertEqual(segmented, result)

    def test_walk_missing(self):
        self._fonts()
        layout = self._layout(["HX"])
        shot = self._shot(layout)
        baseline_px = shot.to_px(0, layout[0]["baseline"])[1]

        # the F3S font has no Z, so Gravostyle engraves the X right after
        # the H
        result = measure.walk(
            shot, shot.ink(MARGINS), "HZX", FONT, dict(), SIZE, baseline_px, 3
        )
        self.assertEqual(result[1], dict(char="Z", centre=None, missing=True))
        self.assertAlmostEqual(
            result[2]["centre"], layout[0]["glyphs"][1]["centre"], delta=0.08
        )
        self.assertGreaterEqual(result[2]["hit"], 0.95)

    def test_walk_space(self):
        self._fonts()
        layout = self._layout(["H X"])
        shot = self._shot(layout)
        baseline_px = shot.to_px(0, layout[0]["baseline"])[1]

        result = measure.walk(
            shot, shot.ink(MARGINS), "H X", FONT, dict(), SIZE, baseline_px, 3
        )
        self.assertEqual(result[1], dict(char=" ", centre=None))
        self.assertAlmostEqual(
            result[2]["centre"], layout[0]["glyphs"][2]["centre"], delta=0.08
        )
        self.assertGreaterEqual(result[2]["hit"], 0.95)

    def test_walk_unmatched(self):
        self._fonts()
        layout = self._layout(["HLOV"])
        shot = self._shot(layout)
        baseline_px = shot.to_px(0, layout[0]["baseline"])[1]

        # an L engraved in place of the X is no typing error, the X is
        # recorded with its low score
        result = measure.walk(
            shot, shot.ink(MARGINS), "HXOV", FONT, dict(), SIZE, baseline_px, 3
        )
        self.assertEqual([glyph["char"] for glyph in result], ["H", "X", "O", "V"])
        self.assertLess(result[1]["hit"], measure.GLYPH_MATCH)
        for glyph in result:
            self.assertFalse(set(glyph) & set(["dropped", "extra", "replaced"]))
        self.assertGreaterEqual(result[2]["hit"], 0.95)
        self.assertGreaterEqual(result[3]["hit"], 0.95)

    def test_walk_dropped(self):
        self._fonts()
        layout = self._layout(["HOV"])
        shot = self._shot(layout)
        baseline_px = shot.to_px(0, layout[0]["baseline"])[1]

        result = measure.walk(
            shot, shot.ink(MARGINS), "HXOV", FONT, dict(), SIZE, baseline_px, 3
        )
        self.assertEqual(result[1], dict(char="X", centre=None, dropped=True))
        for glyph, placed in zip(result[2:], layout[0]["glyphs"][1:]):
            self.assertEqual(glyph["char"], placed["char"])
            self.assertAlmostEqual(glyph["centre"], placed["centre"], delta=0.08)
            self.assertGreaterEqual(glyph["hit"], 0.95)

    def test_walk_extra(self):
        self._fonts()
        layout = self._layout(["HXXOV"])
        shot = self._shot(layout)
        baseline_px = shot.to_px(0, layout[0]["baseline"])[1]

        result = measure.walk(
            shot, shot.ink(MARGINS), "HXOV", FONT, dict(), SIZE, baseline_px, 3
        )
        self.assertEqual([glyph["char"] for glyph in result], ["H", "X", "O", "V"])
        self.assertEqual(result[2]["extra"], "X")
        self.assertFalse("extra" in result[3])
        for glyph, placed in zip(result[2:], layout[0]["glyphs"][3:]):
            self.assertAlmostEqual(glyph["centre"], placed["centre"], delta=0.08)
            self.assertGreaterEqual(glyph["hit"], 0.95)

    def test_walk_replaced(self):
        self._fonts()
        layout = self._layout(["HXXV"])
        shot = self._shot(layout)
        baseline_px = shot.to_px(0, layout[0]["baseline"])[1]

        result = measure.walk(
            shot, shot.ink(MARGINS), "HXOV", FONT, dict(), SIZE, baseline_px, 3
        )
        self.assertEqual(result[2], dict(char="O", centre=None, replaced="X"))
        self.assertAlmostEqual(
            result[3]["centre"], layout[0]["glyphs"][3]["centre"], delta=0.08
        )
        self.assertGreaterEqual(result[3]["hit"], 0.95)

    def test_gravostyle_lines(self):
        self._fonts()
        layout = self._layout(["HXOV", "LXH"])
        shot = self._shot(layout)
        payload = dict(width=PLATE[0], height=PLATE[1], margins=MARGINS, font_size=SIZE)

        lines, bands = measure.gravostyle_lines(
            shot, payload, ["HXOV", "LXH"], FONT, dict()
        )
        self.assertEqual(len(lines), 2)
        self.assertEqual(len(bands), 2)
        for line, band, placed in zip(lines, bands, layout):
            self.assertEqual(line["overflow"], False)
            self.assertAlmostEqual(line["baseline"], placed["baseline"], delta=0.15)
            self.assertLessEqual(band[0], shot.to_px(0, placed["baseline"] - SIZE)[1])
            self.assertGreaterEqual(band[1] + 1, shot.to_px(0, placed["baseline"])[1])
            self.assertEqual(
                [glyph["char"] for glyph in line["glyphs"]], list(placed["text"])
            )
            for glyph, expected in zip(line["glyphs"], placed["glyphs"]):
                self.assertAlmostEqual(glyph["centre"], expected["centre"], delta=0.08)
                self.assertGreaterEqual(glyph["hit"], 0.95)

    def test_gravostyle_lines_crossbar(self):
        self._fonts()
        layout = self._layout(["HHH"])
        shot = self._shot(layout)
        payload = dict(width=PLATE[0], height=PLATE[1], margins=MARGINS, font_size=SIZE)

        # most ink columns of an H end on its crossbar, 2 mm above the
        # baseline, which the template searches correct
        lines, _bands = measure.gravostyle_lines(shot, payload, ["HHH"], FONT, dict())
        self.assertAlmostEqual(lines[0]["baseline"], layout[0]["baseline"], delta=0.15)
        for glyph, expected in zip(lines[0]["glyphs"], layout[0]["glyphs"]):
            self.assertAlmostEqual(glyph["centre"], expected["centre"], delta=0.08)
            self.assertGreaterEqual(glyph["hit"], 0.95)

    def test_gravostyle_lines_overflow(self):
        self._fonts()
        payload = dict(width=PLATE[0], height=PLATE[1], margins=MARGINS, font_size=SIZE)

        # the second line runs past the right of the margin box
        shot = self._shot(self._layout(["HXOV", "LXH"], shift={1: 15.0}))
        lines, _bands = measure.gravostyle_lines(
            shot, payload, ["HXOV", "LXH"], FONT, dict()
        )
        self.assertEqual([line["overflow"] for line in lines], [False, True])

        # and past its left, the first glyph cut by the margin box
        shot = self._shot(self._layout(["HXOV", "LXH"], shift={1: -14.0}))
        lines, _bands = measure.gravostyle_lines(
            shot, payload, ["HXOV", "LXH"], FONT, dict()
        )
        self.assertEqual([line["overflow"] for line in lines], [False, True])
        self.assertLess(lines[1]["glyphs"][0]["hit"], measure.GLYPH_MATCH)

    def test_gravostyle_lines_emojis(self):
        self._fonts(
            {
                "HELVETICA 4L": {"32": SPACE},
                "3007.filho-familia": {"97": FAMILY},
                "1101.coracao": {"97": X},
            }
        )
        mapping = {"!": "3007.filho-familia", "#": "1101.coracao"}
        layout = self._layout(["!!", "# !"], glyphs={"!": FAMILY, " ": SPACE, "#": X})
        shot = self._shot(layout)
        payload = dict(width=PLATE[0], height=PLATE[1], margins=MARGINS, font_size=SIZE)
        lines = [[[M.EMOJI_FONT, "!!"]], [[M.EMOJI_FONT, "# !"]]]

        # every emoji is engraved from the a of its own F3S at its height,
        # the space being a Helvetica 4L one, and the marker dots drawn
        # above the family figures are folded into their line
        result, bands = measure.gravostyle_lines(shot, payload, lines, FONT, mapping)
        self.assertEqual(len(bands), 2)
        for line, placed in zip(result, layout):
            self.assertEqual(line["overflow"], False)
            self.assertAlmostEqual(line["baseline"], placed["baseline"], delta=0.15)
            for glyph, expected in zip(line["glyphs"], placed["glyphs"]):
                if expected["char"] == " ":
                    self.assertEqual(glyph, dict(char=" ", centre=None))
                    continue
                self.assertAlmostEqual(glyph["centre"], expected["centre"], delta=0.08)
                self.assertGreaterEqual(glyph["hit"], 0.95)

        # the ink of the family figure leaves its marker out
        unit = SIZE / 9417.0
        ink = result[0]["glyphs"][0]["ink"]
        self.assertAlmostEqual(ink[1] - ink[0], 5705 * unit, delta=1e-9)
        self.assertAlmostEqual(result[0]["glyphs"][0]["height"], 8297 * unit)

    def test_viewport_lines(self):
        root = self._root()
        tuned = os.path.join(root, "static", "fonts", "helvetica4l-f3s.ttf")
        roman = os.path.join(root, "static", "fonts", "roman4l.ttf")
        font_size = SIZE / M.CAP_RATIO * measure.VIEWPORT_SCALE
        entry = dict(
            plate=dict(left=100.0, top=50.0, width=240.0, height=144.0),
            fontSize=font_size,
            lineHeight=font_size * 1.232,
            spans=[
                dict(char="H", font=FONT, display="block", left=160.0, top=60.0),
                dict(char="\u00a0", font="", display="block", left=175.0, top=60.0),
                dict(char="<", font="", display="block", left=180.0, top=60.0),
                dict(char="X", font=FONT, display="none", left=0.0, top=0.0),
                dict(char="\n", font="", display="block", left=0.0, top=0.0),
                dict(char="O", font="Roman 4L", display="block", left=200.0, top=100.0),
            ],
        )

        lines, fonts = measure.viewport_lines(entry, 40, FONT, True, root)
        self.assertEqual(fonts, sorted([tuned, roman]))
        self.assertEqual(len(lines), 2)

        # the plate is 6 px per mm, the viewport zoomed twice, so the font
        # size and the line height (before the zoom) are doubled
        size_px, line_px = font_size * 2, font_size * 1.232 * 2
        x_min, x_max = self._bounds(tuned, "H")
        face = TTFont(tuned)
        ascent, descent = face["OS/2"].sTypoAscender, -face["OS/2"].sTypoDescender
        baseline_px = (
            60.0
            + (line_px - (ascent + descent) * size_px / 1000.0) / 2.0
            + ascent * size_px / 1000.0
        )
        self.assertAlmostEqual(lines[0]["baseline"], (baseline_px - 50.0) / 6.0)
        self.assertEqual(
            [glyph["char"] for glyph in lines[0]["glyphs"]], ["H", "\u00a0", "<"]
        )
        self.assertAlmostEqual(
            lines[0]["glyphs"][0]["centre"],
            (160.0 + (x_min + x_max) / 2.0 * size_px / 1000.0 - 100.0) / 6.0,
        )
        self.assertEqual(lines[0]["glyphs"][0]["missing"], False)

        # the outline of the H is the cap, as tall as the font size
        self.assertAlmostEqual(lines[0]["glyphs"][0]["height"], SIZE)

        # the no-break space is the space of the font, a glyph without
        # contours, while the TTF lacks the less than sign
        self.assertEqual(
            lines[0]["glyphs"][1],
            dict(char="\u00a0", centre=None, height=None, missing=False),
        )
        self.assertEqual(
            lines[0]["glyphs"][2],
            dict(char="<", centre=None, height=None, missing=True),
        )

        # the span of another family is measured with its own TTF, the
        # regular one when it has no F3S counterpart
        x_min, x_max = self._bounds(roman, "O")
        self.assertAlmostEqual(
            lines[1]["glyphs"][0]["centre"],
            (200.0 + (x_min + x_max) / 2.0 * size_px / 1000.0 - 100.0) / 6.0,
        )
        face = TTFont(roman)
        ascent, descent = face["OS/2"].sTypoAscender, -face["OS/2"].sTypoDescender
        baseline_px = (
            100.0
            + (line_px - (ascent + descent) * size_px / 1000.0) / 2.0
            + ascent * size_px / 1000.0
        )
        self.assertAlmostEqual(lines[1]["baseline"], (baseline_px - 50.0) / 6.0)

        # the regular TTFs without the F3S fonts toggle
        _lines, fonts = measure.viewport_lines(entry, 40, FONT, False, root)
        self.assertEqual(
            fonts, [os.path.join(root, "static", "fonts", "helvetica4l.ttf"), roman]
        )

    def test_viewport_lines_hhea(self):
        root = self._root()
        path = os.path.join(root, "static", "fonts", "helvetica4l.ttf")
        face = TTFont(path)
        face["OS/2"].fsSelection &= ~(1 << 7)
        face["hhea"].ascent, face["hhea"].descent = 1100, -400
        face.save(path)
        font_size = SIZE / M.CAP_RATIO * measure.VIEWPORT_SCALE
        entry = dict(
            plate=dict(left=0.0, top=0.0, width=120.0, height=72.0),
            fontSize=font_size,
            lineHeight=font_size * 1.232,
            spans=[dict(char="H", font=FONT, display="block", left=10.0, top=20.0)],
        )

        # without USE_TYPO_METRICS the browser places the baseline with
        # the hhea ascent and descent
        lines, _fonts = measure.viewport_lines(entry, 40, FONT, False, root)
        baseline_px = (
            20.0 + (font_size * 1.232 - 1.5 * font_size) / 2.0 + 1.1 * font_size
        )
        self.assertAlmostEqual(lines[0]["baseline"], baseline_px / 3.0)

    def test_verify_fonts(self):
        root = self._root()
        regular = os.path.join(root, "static", "fonts", "helvetica4l.ttf")
        tuned = os.path.join(root, "static", "fonts", "helvetica4l-f3s.ttf")
        served = {
            "/static/fonts/helvetica4l.ttf": M.file_sha256(regular),
            "/static/fonts/helvetica4l-f3s.ttf": M.file_sha256(tuned),
            "/static/fonts/roman4l.ttf": "0" * 64,
        }

        entries = measure.verify_fonts([regular, tuned], served)
        self.assertEqual(
            entries,
            [
                dict(path=regular, sha=M.file_sha256(regular)[:12], verified=True),
                dict(path=tuned, sha=M.file_sha256(tuned)[:12], verified=True),
            ],
        )
        self.assertEqual(measure.verify_fonts([], served), [])

    def test_verify_fonts_mismatch(self):
        root = self._root()
        tuned = os.path.join(root, "static", "fonts", "helvetica4l-f3s.ttf")
        roman = os.path.join(root, "static", "fonts", "roman4l.ttf")
        served = {"/static/fonts/helvetica4l-f3s.ttf": "0" * 64}

        # a font that is not the one the browser loaded (a stale server)
        with self.assertRaises(RuntimeError) as context:
            measure.verify_fonts([tuned], served)
        self.assertEqual(
            str(context.exception),
            "%s is not the font the viewport loaded (sha256 %s, served %s)"
            % (tuned, M.file_sha256(tuned), "0" * 64),
        )

        # and a font the viewport never loaded
        with self.assertRaises(RuntimeError) as context:
            measure.verify_fonts([roman], served)
        self.assertIn("served None", str(context.exception))

    def test_verify_fonts_legacy(self):
        root = self._root()
        tuned = os.path.join(root, "static", "fonts", "helvetica4l-f3s.ttf")

        # a capture made before the hashes were recorded is measured, the
        # fonts flagged as not verified
        entries = measure.verify_fonts([tuned], dict())
        self.assertEqual(
            entries, [dict(path=tuned, sha=M.file_sha256(tuned)[:12], verified=False)]
        )

    def test_compare(self):
        gravo = [
            dict(
                glyphs=[
                    dict(char="H", centre=10.0, height=5.0, hit=1.0),
                    dict(char=" ", centre=None),
                    dict(char="X", centre=15.0, height=5.0, hit=0.95),
                    dict(char="O", centre=20.0, height=5.0, hit=0.97),
                ],
                baseline=8.0,
                overflow=False,
            ),
            dict(
                glyphs=[
                    dict(char="L", centre=10.0, height=5.0, hit=0.9),
                    dict(char="V", centre=14.0, height=5.0, hit=0.4),
                    dict(char="<", centre=18.0, height=4.0, hit=0.92),
                    dict(char="Z", centre=None, missing=True),
                ],
                baseline=15.1,
                overflow=False,
            ),
        ]
        view = [
            dict(
                glyphs=[
                    dict(char="H", centre=10.1, height=5.2, missing=False),
                    dict(char=" ", centre=None, height=None, missing=False),
                    dict(char="X", centre=15.4, height=5.5, missing=False),
                    dict(char="O", centre=20.2, height=4.9, missing=False),
                ],
                baseline=8.05,
            ),
            dict(
                glyphs=[
                    dict(char="L", centre=10.2, height=5.1, missing=False),
                    dict(char="V", centre=14.2, height=5.0, missing=False),
                    dict(char="<", centre=None, height=None, missing=True),
                    dict(char="Z", centre=22.0, height=5.0, missing=False),
                ],
                baseline=15.0,
            ),
        ]

        result = measure.compare(gravo, view, 8, 5)
        self.assertEqual(result["trimmed"], False)
        self.assertEqual((result["shown"], result["expected"]), (8, 8))

        # the paired glyphs are H, X and O of the first line and L of the
        # second (V is not found on the engraving, < not in the TTF)
        self.assertEqual(result["glyphs"], 4)
        self.assertAlmostEqual(result["spacing_mean"], 1 / 3.0 / 4, delta=1e-9)
        self.assertAlmostEqual(result["spacing_max"], 0.4 - 0.7 / 3, delta=1e-9)
        self.assertAlmostEqual(result["absolute_mean"], 0.225, delta=1e-9)
        self.assertAlmostEqual(result["absolute_max"], 0.4, delta=1e-9)
        self.assertEqual(len(result["widths"]), 2)
        self.assertAlmostEqual(result["widths"][0], 0.1, delta=1e-9)
        self.assertAlmostEqual(result["widths"][1], 0.0, delta=1e-9)
        self.assertEqual(len(result["baselines"]), 2)
        self.assertAlmostEqual(result["baselines"][0], 0.05, delta=1e-9)
        self.assertAlmostEqual(result["baselines"][1], -0.1, delta=1e-9)

        # the median ink height ratio of the paired glyphs (1.04, 1.10,
        # 0.98 and 1.02)
        self.assertAlmostEqual(result["height"], 0.03, delta=1e-9)

        # the match is over every located glyph, paired or not
        self.assertAlmostEqual(result["match"], 0.935, delta=1e-9)
        self.assertEqual(result["match_min"], 0.4)

        self.assertEqual(
            [(worst["char"], worst["line"]) for worst in result["worst"]],
            [("X", 1), ("H", 1), ("O", 1), ("L", 2)],
        )
        self.assertAlmostEqual(result["worst"][0]["error"], 0.4 - 0.7 / 3, delta=1e-9)
        self.assertAlmostEqual(result["worst"][1]["error"], 0.1 - 0.7 / 3, delta=1e-9)

        self.assertEqual(result["missing_in_ttf"], ["<"])
        self.assertEqual(result["missing_in_f3s"], ["Z"])
        self.assertEqual(result["unmatched"], [dict(char="V", line=2, match=0.4)])
        self.assertEqual(result["typing"], [])
        self.assertEqual(result["overflow"], [])

        # the centre to centre steps off by more than STEP_NOTE, largest
        # difference first
        self.assertEqual(
            [(step["pair"], step["line"]) for step in result["steps_off"]],
            [("H..X", 1), ("X..O", 1)],
        )
        self.assertEqual(result["steps_off"][0]["gravostyle"], 5.0)
        self.assertAlmostEqual(result["steps_off"][0]["difference"], 0.3, delta=1e-9)
        self.assertAlmostEqual(result["steps_off"][1]["difference"], -0.2, delta=1e-9)

    def test_compare_trimmed(self):
        gravo = [dict(glyphs=[dict(char="H", centre=10.0, hit=1.0)], baseline=8.0)]
        view = [dict(glyphs=[dict(char="H", centre=10.0)], baseline=8.0)]

        result = measure.compare(gravo, view, 2, SIZE)
        self.assertEqual(result, dict(trimmed=True, shown=1, expected=2))

        result = measure.compare(gravo, view, 1, SIZE)
        self.assertEqual(result["trimmed"], False)
        self.assertEqual(result["spacing_max"], 0.0)

    def test_compare_overflow(self):
        gravo = [
            dict(glyphs=[dict(char="H", centre=10.0, hit=1.0)], baseline=8.0),
            dict(
                glyphs=[dict(char="L", centre=1.0, hit=0.2)],
                baseline=15.0,
                overflow=True,
            ),
        ]
        view = [
            dict(glyphs=[dict(char="H", centre=10.0)], baseline=8.0),
            dict(glyphs=[dict(char="L", centre=1.0)], baseline=15.0),
        ]

        result = measure.compare(gravo, view, 2, SIZE)
        self.assertEqual(result["overflow"], [2])
        self.assertEqual(result["glyphs"], 1)
        self.assertEqual(result["baselines"], [0.0])

        result = measure.compare(gravo[1:], view[1:], 1, SIZE)
        self.assertEqual(result["empty"], True)
        self.assertEqual(result["overflow"], [1])

    def test_compare_typing(self):
        typed = [
            dict(char="H", centre=10.0, hit=1.0),
            dict(char="X", centre=None, dropped=True),
            dict(char="O", centre=15.0, hit=0.98, extra="H"),
            dict(char="V", centre=None, replaced="O"),
            dict(char="L", centre=25.0, hit=0.95),
        ]
        gravo = [
            dict(glyphs=typed, baseline=8.0),
            dict(glyphs=[dict(char="L", centre=10.0, hit=1.0)], baseline=15.0),
        ]
        view = [
            dict(
                glyphs=[
                    dict(char=char, centre=centre)
                    for char, centre in zip("HXOVL", (10.0, 12.0, 15.0, 20.0, 25.0))
                ],
                baseline=8.0,
            ),
            dict(glyphs=[dict(char="L", centre=10.0)], baseline=15.0),
        ]

        # the line whose engraving lost, doubled or swapped a glyph is left
        # out of the numbers, the other lines measured
        result = measure.compare(gravo, view, 6, SIZE)
        self.assertEqual(
            result["typing"],
            [
                "'X' dropped on line 1",
                "'H' doubled on line 1",
                "'V' engraved as 'O' on line 1",
            ],
        )
        self.assertEqual(result["glyphs"], 1)
        self.assertEqual(len(result["baselines"]), 1)

        # without another line nothing is left to measure
        result = measure.compare(gravo[:1], view[:1], 5, SIZE)
        self.assertEqual(result["empty"], True)
        self.assertEqual(len(result["typing"]), 3)
        self.assertEqual(result["overflow"], [])

        # a line that matches poorly is no evidence of a typing error and
        # is measured as it is
        poor = [dict(glyph, hit=0.6) if "hit" in glyph else glyph for glyph in typed]
        result = measure.compare([dict(glyphs=poor, baseline=8.0)], view[:1], 5, SIZE)
        self.assertEqual(result["typing"], [])
        self.assertEqual(result["glyphs"], 3)

    def test_compare_height(self):
        gravo = [
            dict(
                glyphs=[
                    dict(char="H", centre=10.0, height=5.0, hit=1.0),
                    dict(char="-", centre=12.0, height=0.1, hit=0.9),
                    dict(char="o", centre=14.0, height=3.6, hit=0.95),
                    dict(char="X", centre=16.0, height=5.0, hit=0.97),
                ],
                baseline=8.0,
            )
        ]
        view = [
            dict(
                glyphs=[
                    dict(char="H", centre=10.0, height=6.5),
                    dict(char="-", centre=12.0, height=0.6),
                    dict(char="o", centre=14.0, height=4.68),
                    dict(char="X", centre=16.0, height=None),
                ],
                baseline=8.0,
            )
        ]

        # outlines 30% taller than the engraved strokes, with the advances
        # and the centres right, the dash being too low to tell a size and
        # the X drawn without contours
        result = measure.compare(gravo, view, 4, 5)
        self.assertAlmostEqual(result["height"], 0.3, delta=1e-9)
        self.assertEqual(result["spacing_max"], 0.0)

        # no glyph is a third of the size tall, so there is no height
        result = measure.compare(gravo, view, 4, 20)
        self.assertEqual(result["height"], None)
        self.assertEqual(result["glyphs"], 4)

    def test_compare_empty(self):
        gravo = [dict(glyphs=[dict(char="H", centre=10.0, hit=1.0)], baseline=8.0)]

        # nothing pairs: another character, a glyph without centre or one
        # whose strokes are not found on the engraving
        for glyph, hit in (
            (dict(char="X", centre=10.0), 1.0),
            (dict(char="H", centre=None), 1.0),
            (dict(char="H", centre=10.0), 0.3),
        ):
            gravo[0]["glyphs"][0]["hit"] = hit
            view = [dict(glyphs=[glyph], baseline=8.0)]
            result = measure.compare(gravo, view, 1, SIZE)
            self.assertEqual(
                result,
                dict(
                    trimmed=False,
                    empty=True,
                    shown=1,
                    expected=1,
                    typing=[],
                    overflow=[],
                ),
            )

    def test_signed(self):
        self.assertEqual(measure.signed([0.1, -0.256, 0]), "+0.10/-0.26/+0.00")
        self.assertEqual(measure.signed([1.005]), "+1.00")
        self.assertEqual(measure.signed([]), "-")

    def test_verdict(self):
        status, reasons = measure.verdict(self._result(), measure.THRESHOLDS)
        self.assertEqual(status, "PASS")
        self.assertEqual(reasons, [])

        # the limits themselves pass
        result = self._result(
            spacing_mean=0.10,
            spacing_max=0.30,
            widths=[-0.35],
            baselines=[0.30],
            height=-0.15,
            match=0.60,
        )
        self.assertEqual(measure.verdict(result, measure.THRESHOLDS), ("PASS", []))

        # a case without a glyph tall enough to tell a size is not judged
        # on the height
        result = self._result(height=None)
        self.assertEqual(measure.verdict(result, measure.THRESHOLDS), ("PASS", []))

    def test_verdict_trimmed(self):
        result = dict(trimmed=True, shown=3, expected=4)

        status, reasons = measure.verdict(result, measure.THRESHOLDS)
        self.assertEqual(status, "FAIL")
        self.assertEqual(reasons, ["the viewport trims the text (3 of 4 glyphs shown)"])

    def test_verdict_overflow(self):
        result = self._result(overflow=[1, 3], typing=["'X' dropped on line 2"])

        # the overflow comes first, even with a typing error
        status, reasons = measure.verdict(result, measure.THRESHOLDS)
        self.assertEqual(status, "FAIL")
        self.assertEqual(
            reasons,
            [
                "the engraving runs past the margin box on line 1/3 (Gravostyle may also resize it), lines left out, use a smaller size"
            ],
        )

        result = dict(
            trimmed=False, empty=True, shown=3, expected=3, typing=[], overflow=[2]
        )
        status, reasons = measure.verdict(result, measure.THRESHOLDS)
        self.assertEqual(status, "FAIL")
        self.assertIn("on line 2 ", reasons[0])

    def test_verdict_typing(self):
        result = self._result(
            typing=["'X' dropped on line 2", "'F' engraved as 'E' on line 3"],
            spacing_mean=0.5,
        )

        status, reasons = measure.verdict(result, measure.THRESHOLDS)
        self.assertEqual(status, "RETRY")
        self.assertEqual(
            reasons,
            [
                "the engraving differs from the case ('X' dropped on line 2, 'F' engraved as 'E' on line 3), lines left out, submit the dry run again"
            ],
        )

        # also when no other line is left to measure
        result = dict(
            trimmed=False,
            empty=True,
            shown=4,
            expected=4,
            typing=["'H' doubled on line 1"],
            overflow=[],
        )
        status, _reasons = measure.verdict(result, measure.THRESHOLDS)
        self.assertEqual(status, "RETRY")

    def test_verdict_empty(self):
        result = dict(
            trimmed=False, empty=True, shown=4, expected=4, typing=[], overflow=[]
        )

        status, reasons = measure.verdict(result, measure.THRESHOLDS)
        self.assertEqual(status, "FAIL")
        self.assertEqual(reasons, ["no glyph could be paired"])

    def test_verdict_fail(self):
        result = self._result(
            match=0.42,
            spacing_mean=0.12,
            spacing_max=0.41,
            worst=[
                dict(char="O", line=1, error=0.41),
                dict(char="'", line=2, error=-0.33),
                dict(char="X", line=2, error=0.2),
            ],
            widths=[0.1, -0.5],
            baselines=[0.31, -0.02],
            height=0.2,
            unmatched=[
                dict(char="V", line=1, match=0.3),
                dict(char="L", line=2, match=0.1),
            ],
            glyphs=7,
            missing_in_ttf=["<", "["],
        )

        status, reasons = measure.verdict(result, measure.THRESHOLDS)
        self.assertEqual(status, "FAIL")
        self.assertEqual(
            reasons,
            [
                "low F3S match on the engraving (0.42), wrong font or size, or Gravostyle resized an overflow",
                "spacing mean 0.12 mm",
                "spacing max 0.41 mm ('O' line 1, \"'\" line 2)",
                "line width +0.10/-0.50 mm",
                "baseline +0.31/-0.02 mm",
                "glyph height +20.0%",
                "not found on the engraving, not measured: 'V' line 1, 'L' line 2",
                "previewed with a fallback font: <[",
            ],
        )

        # a single glyph left out of the numbers fails a long case, as the
        # case does not prove that glyph
        result = self._result(unmatched=[dict(char="7", line=2, match=0.45)], glyphs=20)
        self.assertEqual(
            measure.verdict(result, measure.THRESHOLDS),
            ("FAIL", ["not found on the engraving, not measured: '7' line 2"]),
        )

        # outlines drawn smaller than the engraving fail as well
        result = self._result(height=-0.16)
        self.assertEqual(
            measure.verdict(result, measure.THRESHOLDS),
            ("FAIL", ["glyph height -16.0%"]),
        )

        # the thresholds are the ones given
        thresholds = dict(measure.THRESHOLDS, spacing_mean=0.01)
        status, reasons = measure.verdict(self._result(), thresholds)
        self.assertEqual((status, reasons), ("FAIL", ["spacing mean 0.02 mm"]))

    def test_plate_crop(self):
        shot = self._shot([], blocks=[(10, 8, 20, 14)])

        crop, box = measure.plate_crop(shot, 10)
        self.assertEqual(box, (60, 50, 540, 338))
        self.assertEqual(crop.size, (400, 240))
        self.assertEqual(crop.mode, "RGB")
        self.assertEqual(crop.getpixel((150, 110)), (0, 0, 0))
        self.assertEqual(crop.getpixel((300, 200)), (255, 255, 255))

        crop, box = measure.plate_crop(shot, 8)
        self.assertEqual(box, (60, 50, 540, 338))
        self.assertEqual(crop.size, (320, 192))

    def test_overlay(self):
        shot = self._shot([], blocks=[(10, 8, 20, 14)])
        crop, box = measure.plate_crop(shot, 10)
        plate = Image.new("RGB", (480, 288), (255, 255, 255))
        ImageDraw.Draw(plate).rectangle([180, 96, 300, 168], fill=(20, 20, 20))

        image = measure.overlay(shot, MARGINS, box, plate, crop.size)
        self.assertEqual(image.size, (400, 240))
        self.assertEqual(image.mode, "RGB")

        # Gravostyle only from 10 to 15 mm, both from 15 to 20 mm and the
        # viewport only from 20 to 25 mm
        self.assertEqual(image.getpixel((120, 110)), (226, 46, 46))
        self.assertEqual(image.getpixel((175, 110)), (72, 22, 96))
        self.assertEqual(image.getpixel((225, 110)), (40, 96, 226))

        # the plate is white inside its grey frame, the dashed margin box
        # and the plate border of the composition left out
        self.assertEqual(image.getpixel((300, 50)), (255, 255, 255))
        self.assertEqual(image.getpixel((20, 100)), (255, 255, 255))
        self.assertEqual(image.getpixel((5, 5)), (255, 255, 255))
        self.assertEqual(image.getpixel((0, 0)), (150, 150, 150))
        self.assertEqual(image.getpixel((1, 120)), (150, 150, 150))
        self.assertEqual(image.getpixel((399, 239)), (150, 150, 150))

    def test_images(self):
        out_dir = os.path.join(self.temp_dir, "report")

        images = measure.Images(out_dir)
        self.assertTrue(os.path.isdir(os.path.join(out_dir, "img")))

        path = images.add(Image.new("RGBA", (30, 20), (255, 0, 0, 128)), "case-shot")
        self.assertEqual(path, "img/case-shot.jpg")
        with Image.open(os.path.join(out_dir, "img", "case-shot.jpg")) as image:
            self.assertEqual(image.format, "JPEG")
            self.assertEqual(image.size, (30, 20))

        path = images.add(Image.new("RGB", (30, 20), (40, 96, 226)), "case-ov", "PNG")
        self.assertEqual(path, "img/case-ov.png")
        with Image.open(os.path.join(out_dir, "img", "case-ov.png")) as image:
            self.assertEqual(image.format, "PNG")
            self.assertEqual(image.convert("RGB").getpixel((10, 10)), (40, 96, 226))

        # an existing directory is kept
        measure.Images(out_dir)
        self.assertTrue(os.path.exists(os.path.join(out_dir, "img", "case-ov.png")))

    def test_images_embed(self):
        out_dir = os.path.join(self.temp_dir, "report")

        images = measure.Images(out_dir, embed=True)
        self.assertFalse(os.path.exists(out_dir))

        uri = images.add(Image.new("RGB", (30, 20), (40, 96, 226)), "case-ov", "PNG")
        self.assertTrue(uri.startswith("data:image/png;base64,"))
        data = base64.b64decode(uri.split(",", 1)[1])
        with Image.open(io.BytesIO(data)) as image:
            self.assertEqual(image.format, "PNG")
            self.assertEqual(image.convert("RGB").getpixel((10, 10)), (40, 96, 226))

        uri = images.add(Image.new("L", (30, 20), 128), "case-shot")
        self.assertTrue(uri.startswith("data:image/jpeg;base64,"))
        data = base64.b64decode(uri.split(",", 1)[1])
        with Image.open(io.BytesIO(data)) as image:
            self.assertEqual(image.format, "JPEG")
            self.assertEqual(image.mode, "RGB")
        self.assertFalse(os.path.exists(out_dir))

    def test_git_head(self):
        with mock.patch.object(
            subprocess, "check_output", side_effect=[b"abc1234\n", b""]
        ) as check_output:
            self.assertEqual(measure.git_head("/srv/signatur"), "abc1234")
        self.assertEqual(
            [call[0][0] for call in check_output.call_args_list],
            [
                ["git", "-C", "/srv/signatur", "rev-parse", "--short", "HEAD"],
                ["git", "-C", "/srv/signatur", "status", "--porcelain", "static/fonts"],
            ],
        )

    def test_git_head_dirty(self):
        with mock.patch.object(
            subprocess,
            "check_output",
            side_effect=[b"abc1234\n", b" M static/fonts/roman4l-f3s.ttf\n"],
        ):
            self.assertEqual(
                measure.git_head("/srv/signatur"), "abc1234 + local font changes"
            )

    def test_git_head_missing(self):
        # not a repository, or no git at all
        for error in (
            subprocess.CalledProcessError(128, ["git"]),
            FileNotFoundError("git"),
        ):
            with mock.patch.object(subprocess, "check_output", side_effect=error):
                self.assertEqual(measure.git_head(self.temp_dir), "no git")

    def test_measure_case(self):
        self._fonts()
        root = self._root()
        directory = os.path.join(self.temp_dir, "run")
        self._gravo(directory, "pass", ["HXOV", "LXH"])
        capture = self._capture(directory, root, [("pass", ["HXOV", "LXH"])])

        record = self._measure("pass", [("after", capture, directory)], directory)
        self.assertEqual(record["name"], "pass")
        self.assertEqual(record["case"], self._case("pass", ["HXOV", "LXH"]))
        self.assertEqual(
            record["payload"],
            dict(width=40, height=24, margins=[2, 2, 2, 2], font_size=4),
        )
        self.assertEqual(record["job"], "job-pass")
        self.assertEqual((record["lines_found"], record["lines_expected"]), (2, 2))
        self.assertEqual(
            record["images"],
            dict(
                gravostyle="img/pass-gravostyle.jpg",
                composition="img/pass-composition.jpg",
            ),
        )
        report = os.path.join(self.temp_dir, "report")
        with Image.open(os.path.join(report, "img", "pass-gravostyle.jpg")) as image:
            self.assertEqual(image.size, (960, 576))
        with Image.open(os.path.join(report, "img", "pass-composition.jpg")) as image:
            self.assertEqual(image.size, IMAGE_SIZE)

        self.assertEqual(len(record["views"]), 1)
        view = record["views"][0]
        self.assertEqual(view["label"], "after")
        self.assertEqual(view["status"], "PASS")
        self.assertEqual(view["reasons"], [])
        self.assertEqual(
            view["fonts"],
            [
                dict(
                    path=os.path.join("static", "fonts", "helvetica4l-f3s.ttf"),
                    sha=M.file_sha256(
                        os.path.join(root, "static", "fonts", "helvetica4l-f3s.ttf")
                    )[:12],
                    verified=True,
                )
            ],
        )
        self.assertAlmostEqual(view["font_size_px"], 4 / 0.7 * 3)
        self.assertAlmostEqual(view["line_height_px"], 4 * 1.76 * 3)
        self.assertEqual(
            view["images"],
            dict(
                viewport="img/pass-after-viewport.jpg",
                overlay="img/pass-after-overlay.png",
            ),
        )
        with Image.open(os.path.join(report, "img", "pass-after-overlay.png")) as image:
            self.assertEqual(image.size, (960, 576))

        result = view["result"]
        self.assertEqual((result["shown"], result["expected"]), (7, 7))
        self.assertEqual(result["glyphs"], 7)
        self.assertLess(result["spacing_mean"], 0.05)
        self.assertLess(result["spacing_max"], 0.1)
        self.assertLess(result["absolute_max"], 0.1)
        for value in result["widths"]:
            self.assertAlmostEqual(value, 0.0, delta=0.1)
        for value in result["baselines"]:
            self.assertAlmostEqual(value, 0.0, delta=0.15)
        self.assertAlmostEqual(result["height"], 0.0, delta=0.01)
        self.assertGreaterEqual(result["match_min"], 0.95)
        self.assertEqual(result["unmatched"], [])
        self.assertEqual(result["steps_off"], [])

    def test_measure_case_captures(self):
        self._fonts()
        root = self._root()
        directory = os.path.join(self.temp_dir, "gravo")
        self._gravo(directory, "pass", ["HXOV", "LXH"])
        jobs = self._write(
            os.path.join("gravo", "jobs.json"), json.dumps({"other": {"job_id": "6"}})
        )
        before = os.path.join(self.temp_dir, "before")
        old = self._capture(
            before,
            root,
            [("pass", ["HXOV", "LXH"])],
            fonts=False,
            label="before",
            zoom=1.0,
            payload=False,
        )
        after = os.path.join(self.temp_dir, "after")
        new = self._capture(after, root, [("pass", ["HXOV", "LXH"])])
        other = self._capture(os.path.join(self.temp_dir, "other"), root, [])

        # the plate of the payload Signatur sent takes over the one of the
        # case, the capture without a payload measured too
        entry = new["cases"]["pass"]
        entry["case"] = dict(entry["case"], margins=[3, 3, 3, 3])
        old["cases"]["pass"]["case"] = entry["case"]
        captures = [
            ("before", old, before),
            ("other", other, None),
            ("after", new, after),
        ]
        record = self._measure("pass", captures, directory)
        self.assertEqual(record["payload"]["margins"], [2, 2, 2, 2])
        self.assertEqual(record["job"], "job-pass")
        self.assertEqual(
            [view["label"] for view in record["views"]], ["before", "after"]
        )
        for view in record["views"]:
            self.assertEqual(view["status"], "PASS")

        # the capture made before the font hashes were recorded is not
        # verified, at another zoom of the viewport
        self.assertEqual(record["views"][0]["fonts"][0]["verified"], False)
        self.assertEqual(record["views"][1]["fonts"][0]["verified"], True)

        # without a submitted job, the job of the gravo directory
        del entry["job"]
        record = self._measure("pass", captures, directory)
        self.assertEqual(record["job"], None)
        self._write(jobs, json.dumps({"pass": {"job_id": "7"}}))
        record = self._measure("pass", captures, directory)
        self.assertEqual(record["job"], "7")

    def test_measure_case_retry(self):
        self._fonts()
        root = self._root()
        directory = os.path.join(self.temp_dir, "run")
        self._gravo(directory, "typing", ["HOV", "LXH"])
        capture = self._capture(directory, root, [("typing", ["HXOV", "LXH"])])

        # the engraving lost the X of the first line, which is left out
        # while the second one is measured
        record = self._measure("typing", [("after", capture, directory)], directory)
        view = record["views"][0]
        self.assertEqual(view["status"], "RETRY")
        self.assertEqual(
            view["reasons"],
            [
                "the engraving differs from the case ('X' dropped on line 1), lines left out, submit the dry run again"
            ],
        )
        self.assertEqual(view["result"]["typing"], ["'X' dropped on line 1"])
        self.assertEqual(view["result"]["glyphs"], 3)
        self.assertEqual(len(view["result"]["baselines"]), 1)

    def test_measure_case_overflow(self):
        self._fonts()
        root = self._root()
        directory = os.path.join(self.temp_dir, "run")
        self._gravo(directory, "wide", ["HXOVLHXOVL", "LXH"])
        capture = self._capture(directory, root, [("wide", ["HXOVLHXOVL", "LXH"])])

        # the first line is wider than the margin box, Gravostyle drawing
        # it past both sides
        record = self._measure("wide", [("after", capture, directory)], directory)
        view = record["views"][0]
        self.assertEqual(view["status"], "FAIL")
        self.assertEqual(
            view["reasons"],
            [
                "the engraving runs past the margin box on line 1 (Gravostyle may also resize it), lines left out, use a smaller size"
            ],
        )
        self.assertEqual(view["result"]["overflow"], [1])
        self.assertEqual(view["result"]["glyphs"], 3)

    def test_measure_case_lines(self):
        self._fonts()
        root = self._root()
        directory = os.path.join(self.temp_dir, "run")
        capture = self._capture(directory, root, [("lost", ["HXOV", "LXH"])])

        # the composition only has the first line of the case
        self._composition(
            os.path.join(directory, "lost-composition.png"),
            self._layout(["HXOV", "LXH"])[:1],
        )
        record = self._measure("lost", [("after", capture, directory)], directory)
        self.assertEqual((record["lines_found"], record["lines_expected"]), (1, 2))
        view = record["views"][0]
        self.assertEqual(view["status"], "FAIL")
        self.assertEqual(
            view["reasons"], ["found 1 text lines on the composition for 2 case lines"]
        )
        self.assertEqual(view["result"]["glyphs"], 4)

    def test_measure_case_trimmed(self):
        self._fonts()
        root = self._root()
        directory = os.path.join(self.temp_dir, "run")
        self._gravo(directory, "trim", ["HXOV", "LXH"])
        capture = self._capture(directory, root, [("trim", ["HXOV", "LXH"])])
        capture["cases"]["trim"]["spans"][-1]["display"] = "none"

        record = self._measure("trim", [("after", capture, directory)], directory)
        view = record["views"][0]
        self.assertEqual(view["status"], "FAIL")
        self.assertEqual(
            view["reasons"], ["the viewport trims the text (6 of 7 glyphs shown)"]
        )
        self.assertEqual(view["result"], dict(trimmed=True, shown=6, expected=7))

    def test_measure_case_spacing(self):
        self._fonts()
        root = self._root()
        directory = os.path.join(self.temp_dir, "run")
        self._gravo(directory, "spacing", ["HXOV", "LXH"])
        middle = os.path.join(self.temp_dir, "middle")
        last = os.path.join(self.temp_dir, "last")
        captures = [
            (label, self._capture(path, root, [("spacing", ["HXOV", "LXH"])]), path)
            for label, path in (("middle", middle), ("last", last))
        ]

        # one viewport draws the O of the first line 0.5 mm too far right
        # and the other its V 0.6 mm (6 px per mm at the zoom of 2)
        captures[0][1]["cases"]["spacing"]["spans"][2]["left"] += 3.0
        captures[1][1]["cases"]["spacing"]["spans"][3]["left"] += 3.6
        record = self._measure("spacing", captures, directory)

        view = record["views"][0]
        self.assertEqual(view["status"], "FAIL")
        self.assertEqual(len(view["reasons"]), 2)
        self.assertRegex(view["reasons"][0], r"^spacing mean 0\.1\d mm$")
        self.assertRegex(
            view["reasons"][1],
            r"^spacing max 0\.[34]\d mm \('O' line 1, '\w' line 1\)$",
        )
        self.assertEqual(view["result"]["worst"][0]["char"], "O")
        self.assertAlmostEqual(view["result"]["worst"][0]["error"], 0.375, delta=0.05)
        self.assertEqual(
            [step["pair"] for step in view["result"]["steps_off"]], ["X..O", "O..V"]
        )
        self.assertAlmostEqual(
            view["result"]["steps_off"][0]["difference"], 0.5, delta=0.08
        )

        # moving the last glyph of a line changes its width too
        view = record["views"][1]
        self.assertEqual(view["status"], "FAIL")
        self.assertEqual(len(view["reasons"]), 3)
        self.assertRegex(view["reasons"][2], r"^line width \+0\.[56]\d/[+-]0\.0\d mm$")
        self.assertAlmostEqual(view["result"]["widths"][0], 0.6, delta=0.08)
        self.assertEqual(
            [step["pair"] for step in view["result"]["steps_off"]], ["O..V"]
        )

    def test_measure_case_height(self):
        self._fonts()
        root = self._root()
        directory = os.path.join(self.temp_dir, "run")
        self._gravo(directory, "height", ["HXOV", "LXH"])

        # a candidate whose outlines are 30% larger, scaled from the
        # baseline around their own centres, keeping the advances and the
        # centres of the tuned font
        path = os.path.join(root, "static", "fonts", "helvetica4l-f3s.ttf")
        face = TTFont(path)
        glyf = face["glyf"]
        for name in face.getGlyphOrder():
            glyph = glyf[name]
            if glyph.numberOfContours <= 0:
                continue
            glyph.recalcBounds(glyf)
            centre = (glyph.xMin + glyph.xMax) / 2.0
            glyph.coordinates.translate((-centre, 0))
            glyph.coordinates.scale((1.3, 1.3))
            glyph.coordinates.translate((centre, 0))
        face.save(path)
        capture = self._capture(directory, root, [("height", ["HXOV", "LXH"])])

        # the spacing alone cannot tell such outlines from the right ones
        record = self._measure("height", [("after", capture, directory)], directory)
        view = record["views"][0]
        result = view["result"]
        self.assertLess(result["spacing_max"], 0.1)
        self.assertAlmostEqual(result["height"], 0.3, delta=0.02)
        self.assertEqual(view["status"], "FAIL")
        self.assertEqual(
            view["reasons"], ["glyph height %+.1f%%" % (result["height"] * 100)]
        )

    def test_measure_case_unmatched(self):
        self._fonts()
        root = self._root()
        directory = os.path.join(self.temp_dir, "run")
        capture = self._capture(directory, root, [("unmatched", ["HXOV", "LXH"])])

        # the engraving draws no V at the end of the first line, whose F3S
        # strokes are then not found, so the case never measures the V
        layout = self._layout(["HXOV", "LXH"])
        layout[0]["glyphs"][3]["glyph"] = dict(V, strokes=[])
        self._composition(os.path.join(directory, "unmatched-composition.png"), layout)
        record = self._measure("unmatched", [("after", capture, directory)], directory)
        view = record["views"][0]
        self.assertEqual(view["status"], "FAIL")
        self.assertEqual(
            view["reasons"], ["not found on the engraving, not measured: 'V' line 1"]
        )
        self.assertEqual(view["result"]["glyphs"], 6)
        self.assertLess(view["result"]["spacing_max"], 0.1)

    def test_measure_case_fallback(self):
        self._fonts()
        root = self._root()
        directory = os.path.join(self.temp_dir, "run")
        self._gravo(directory, "fallback", ["H<X", "LXH"])
        capture = self._capture(directory, root, [("fallback", ["H<X", "LXH"])])

        # the TTF has no less than sign, the browser draws another font
        record = self._measure("fallback", [("after", capture, directory)], directory)
        view = record["views"][0]
        self.assertEqual(view["status"], "FAIL")
        self.assertEqual(view["reasons"], ["previewed with a fallback font: <"])
        self.assertEqual(view["result"]["missing_in_ttf"], ["<"])
        self.assertEqual(view["result"]["glyphs"], 5)

    def test_measure_case_fonts(self):
        self._fonts()
        root = self._root()
        directory = os.path.join(self.temp_dir, "run")
        self._gravo(directory, "stale", ["HXOV", "LXH"])
        capture = self._capture(directory, root, [("stale", ["HXOV", "LXH"])])

        # the font of the root changed after the capture (a stale server
        # or the wrong root), so it is not the font that was rendered
        path = os.path.join(root, "static", "fonts", "helvetica4l-f3s.ttf")
        with open(path, "ab") as file:
            file.write(b"\0\0\0\0")
        with self.assertRaises(RuntimeError) as context:
            self._measure("stale", [("after", capture, directory)], directory)
        self.assertIn(
            "%s is not the font the viewport loaded" % path, str(context.exception)
        )

    def test_fmt(self):
        self.assertEqual(measure.fmt(None), "-")
        self.assertEqual(measure.fmt(0.123456), "0.12")
        self.assertEqual(measure.fmt(-0.5), "-0.50")
        self.assertEqual(measure.fmt(4.5, 1), "4.5")
        self.assertEqual(measure.fmt(3, 0), "3")
        self.assertEqual(measure.fmt(0), "0.00")

    def test_render(self):
        captures = [
            (
                "before",
                dict(
                    meta=dict(
                        base_url="http://127.0.0.1:3124",
                        root="/srv/master",
                        date="2026-09-30T10:00:00Z",
                    )
                ),
                "/runs/before",
            ),
            (
                "after",
                dict(
                    meta=dict(
                        base_url="http://127.0.0.1:3123",
                        root="/srv/signatur",
                        date="2026-10-01T16:28:03Z",
                    )
                ),
                "/runs/after",
            ),
        ]
        images = dict(
            viewport="img/pass-after-viewport.jpg", overlay="img/pass-after-overlay.png"
        )
        passed = dict(
            label="after",
            status="PASS",
            reasons=[],
            result=self._result(
                spacing_mean=0.0123,
                spacing_max=0.0456,
                widths=[-0.2, 0.1],
                baselines=[0.05],
                absolute_mean=0.07,
                match=0.98,
                match_min=0.91,
                steps_off=[dict(pair="H..X", line=1, gravostyle=4.2, difference=0.2)],
                unmatched=[dict(char="V", line=2, match=0.31)],
            ),
            fonts=[
                dict(
                    path="static/fonts/helvetica4l-f3s.ttf",
                    sha="61a64d629836",
                    verified=True,
                )
            ],
            font_size_px=17.142857,
            line_height_px=21.12,
            images=images,
        )
        failed = dict(
            passed,
            label="before",
            status="FAIL",
            reasons=["spacing mean 0.22 mm", "baseline <x> mm"],
            result=self._result(
                spacing_mean=0.22, spacing_max=0.5, widths=[0.4], height=None
            ),
            fonts=[
                dict(
                    path="static/fonts/helvetica4l.ttf",
                    sha="7cdce351b248",
                    verified=False,
                )
            ],
        )
        trimmed = dict(
            passed,
            status="FAIL",
            reasons=["the viewport trims the text (3 of 4 glyphs shown)"],
            result=dict(trimmed=True, shown=3, expected=4),
        )
        records = [
            dict(
                name="pass",
                case=dict(
                    name="pass",
                    font=FONT,
                    font_size=4.5,
                    lines=["HX", [["Roman 4L", "OV"]]],
                ),
                payload=dict(width=40, height=24, margins=[2, 2, 2, 2], font_size=4.5),
                job="job-1",
                lines_found=2,
                lines_expected=2,
                images=dict(
                    gravostyle="img/pass-gravostyle.jpg",
                    composition="img/pass-composition.jpg",
                ),
                views=[failed, passed],
            ),
            dict(
                name="trim<1>",
                case=dict(
                    name="trim<1>", font=FONT, font_size=5, lines=["HXOV"], typed=["!"]
                ),
                payload=dict(width=70, height=70, margins=[5, 5, 5, 5], font_size=5),
                job=None,
                lines_found=1,
                lines_expected=2,
                images=dict(
                    gravostyle="data:image/jpeg;base64,AAAA", composition="c.jpg"
                ),
                views=[trimmed],
            ),
        ]
        checks = [
            dict(
                ttf="/srv/signatur/static/fonts/helvetica4l-f3s.ttf",
                glyphs=121,
                tolerance=0.015,
                worst=dict(advance_dev=0.0007, centre_dev=0.0011, height_dev=0.1264),
                spacing_off=[],
                passed=True,
            ),
            dict(
                ttf="/srv/master/static/fonts/roman4l.ttf",
                glyphs=90,
                tolerance=0.015,
                worst=dict(advance_dev=0.27, centre_dev=0.31, height_dev=0.05),
                spacing_off=["@", "<"],
                passed=False,
            ),
        ]

        with mock.patch.object(
            measure, "git_head", side_effect=lambda root: "head of %s" % root
        ):
            page = measure.render(
                records, captures, checks, measure.THRESHOLDS, "TTF <vs> F3S"
            )
        self.assertFalse("{{" in page)
        self.assertIn("<title>TTF &lt;vs&gt; F3S</title>", page)
        self.assertIn("<h1>TTF &lt;vs&gt; F3S</h1>", page)
        self.assertRegex(page, r"Generated \d{4}-\d\d-\d\d \d\d:\d\d by")

        # a RETRY or a FAIL is a case that does not pass
        self.assertIn(
            "<span class='tally-label'>before</span><span class='tally-value'>0 / 1</span>",
            page,
        )
        self.assertIn(
            "<span class='tally-label'>after</span><span class='tally-value'>1 / 2</span>",
            page,
        )

        # the summary has a row per case and four cells per capture
        self.assertIn("<th colspan='4'>before</th><th colspan='4'>after</th>", page)
        self.assertIn(
            "<tr><td><a href='#pass'>pass</a></td><td>Helvetica 4L</td><td class='num'>4.5</td>"
            "<td class='num'>0.22</td><td class='num'>0.50</td><td class='num'>0.40</td><td><span class='badge fail'>FAIL</span></td>"
            "<td class='num'>0.01</td><td class='num'>0.05</td><td class='num'>0.20</td><td><span class='badge pass'>PASS</span></td></tr>",
            page,
        )
        self.assertIn(
            "<tr><td><a href='#trim&lt;1&gt;'>trim&lt;1&gt;</a></td><td>Helvetica 4L</td><td class='num'>5</td>"
            "<td>-</td><td>-</td><td>-</td><td>-</td>"
            "<td class='num'>-</td><td class='num'>-</td><td class='num'>-</td><td><span class='badge fail'>FAIL</span></td></tr>",
            page,
        )

        # the card of every case, with its text and the job
        self.assertIn(
            "<section class='case' id='pass'><header><h3>pass</h3><p class='muted'>Helvetica 4L &middot; 4.50 mm &middot; plate 40 x 24 mm, margins 2/2/2/2 mm &middot; dry run job <code>job-1</code> &middot; 2 of 2 lines found</p><p class='sample'>HX / OV</p></header>",
            page,
        )
        self.assertIn("<img class='full' src='img/pass-composition.jpg'", page)
        self.assertIn(
            "dry run job <code>-</code> &middot; 1 of 2 lines found</p><p class='sample'>HXOV / !</p>",
            page,
        )
        self.assertIn("<img src='data:image/jpeg;base64,AAAA'", page)

        # the numbers of a measured view, its steps off and the glyphs left
        # out, and the reasons of a failure
        self.assertIn(
            "<p class='metrics'>spacing mean 0.01 mm, max 0.05 mm &middot; line width -0.20/+0.10 mm &middot; baseline +0.05 mm &middot; glyph height +1.0% &middot; absolute mean 0.07 mm &middot; F3S match 0.98 (min 0.91)"
            " &middot; steps off (viewport minus Gravostyle): H..X +0.20"
            " &middot; not found on the engraving (left out): &#x27;V&#x27; line 2 (0.31)</p>",
            page,
        )
        self.assertIn(
            "<ul class='reasons'><li>spacing mean 0.22 mm</li><li>baseline &lt;x&gt; mm</li></ul>",
            page,
        )

        # a view without a glyph tall enough to tell a size has no height
        self.assertIn(
            "baseline +0.02/+0.10 mm &middot; glyph height - &middot; absolute mean",
            page,
        )
        self.assertIn(
            "<p class='metrics'>the viewport trims the text (3 of 4 glyphs shown)</p><ul class='reasons'>",
            page,
        )
        self.assertEqual(page.count("<ul class='reasons'>"), 2)
        self.assertIn(
            "<strong>after</strong><span class='muted'>font-size 17.14px, line-height 21.12px</span>",
            page,
        )
        self.assertIn(
            "TTF rendered: static/fonts/helvetica4l-f3s.ttf <code>61a64d629836</code> (the file the browser loaded)",
            page,
        )
        self.assertIn(
            "TTF rendered: static/fonts/helvetica4l.ttf <code>7cdce351b248</code> (not verified, the capture recorded no fonts)",
            page,
        )
        self.assertIn(
            "<img src='img/pass-after-overlay.png' alt='overlay after'>", page
        )

        # the pre-flight check of every TTF in % of the size
        self.assertIn("tolerance 1.5%", page)
        self.assertIn(
            "<tr><td>helvetica4l-f3s.ttf</td><td class='num'>121</td><td class='num'>0.07</td><td class='num'>0.11</td><td class='num'>12.64</td><td>-</td><td><span class='badge pass'>PASS</span></td></tr>",
            page,
        )
        self.assertIn(
            "<tr><td>roman4l.ttf</td><td class='num'>90</td><td class='num'>27.00</td><td class='num'>31.00</td><td class='num'>5.00</td><td>@&lt;</td><td><span class='badge fail'>FAIL</span></td></tr>",
            page,
        )

        # where every capture comes from
        self.assertIn(
            "<li><strong>before</strong>: http://127.0.0.1:3124, Signatur at <code>/srv/master</code> (head of /srv/master), captured 2026-09-30T10:00:00Z</li>",
            page,
        )
        self.assertIn("(head of /srv/signatur), captured 2026-10-01T16:28:03Z", page)
        self.assertIn(
            "spacing mean &lt;= 0.10 mm, spacing max &lt;= 0.30 mm, line width &lt;= 0.35 mm, baseline &lt;= 0.30 mm, glyph height &lt;= 15%, F3S match &gt;= 0.60, nothing trimmed",
            page,
        )

    def test_render_empty(self):
        with mock.patch.object(measure, "git_head", return_value="abc1234"):
            page = measure.render([], [], [], measure.THRESHOLDS, "Empty")
        self.assertFalse("{{" in page)
        self.assertFalse("Pre-flight metric check" in page)
        self.assertFalse("<section class='case'" in page)
        self.assertIn("<tbody></tbody></table>", page)

    def test_main(self):
        self._fonts()
        root = self._root()
        directory = os.path.join(self.temp_dir, "run")
        self._gravo(directory, "pass", ["HXOV", "LXH"])
        self._capture(directory, root, [("pass", ["HXOV", "LXH"]), ("pending", ["LV"])])
        check = self._write(
            "check.json",
            json.dumps(
                dict(
                    ttf=os.path.join(root, "static", "fonts", "helvetica4l-f3s.ttf"),
                    glyphs=7,
                    tolerance=0.015,
                    worst=dict(advance_dev=0.001, centre_dev=0.001, height_dev=0.1),
                    spacing_off=[],
                    passed=True,
                )
            ),
        )
        out_dir = os.path.join(self.temp_dir, "report")

        # the case without a composition yet is left out
        output = self._main(
            "--viewport", "after=%s" % directory, "--out", out_dir, "--check", check
        )
        self.assertEqual(len(output), 2)
        self.assertRegex(
            output[0],
            r"^pass {21}after {3}PASS spacing 0\.0\d/0\.\d\d mm, width [+-]0\.\d\d/[+-]0\.\d\d mm, baseline [+-]0\.\d\d/[+-]0\.\d\d mm, match 1\.00$",
        )
        self.assertEqual(output[1], "report: %s" % os.path.join(out_dir, "report.html"))

        with open(os.path.join(out_dir, "report.json"), encoding="utf-8") as file:
            report = json.load(file)
        self.assertEqual(report["thresholds"], measure.THRESHOLDS)
        self.assertEqual(len(report["cases"]), 1)
        case = report["cases"][0]
        self.assertEqual(case["name"], "pass")
        self.assertEqual(case["case"], self._case("pass", ["HXOV", "LXH"]))
        self.assertEqual(case["job"], "job-pass")
        self.assertEqual(
            case["payload"],
            dict(width=40, height=24, margins=[2, 2, 2, 2], font_size=4),
        )
        self.assertEqual(len(case["views"]), 1)
        view = case["views"][0]
        self.assertEqual(
            sorted(view), ["fonts", "label", "reasons", "result", "status"]
        )
        self.assertEqual(
            (view["label"], view["status"], view["reasons"]), ("after", "PASS", [])
        )
        self.assertEqual(view["fonts"][0]["verified"], True)
        self.assertEqual(view["result"]["glyphs"], 7)

        with open(os.path.join(out_dir, "report.html"), encoding="utf-8") as file:
            page = file.read()
        self.assertIn("<title>TTF vs F3S matching report</title>", page)
        self.assertIn("<section class='case' id='pass'>", page)
        self.assertFalse("id='pending'" in page)
        self.assertIn("<img src='img/pass-gravostyle.jpg'", page)
        self.assertIn("<td>helvetica4l-f3s.ttf</td><td class='num'>7</td>", page)
        self.assertIn("Signatur at <code>%s</code> (abc1234)" % root, page)
        self.assertEqual(
            sorted(os.listdir(os.path.join(out_dir, "img"))),
            [
                "pass-after-overlay.png",
                "pass-after-viewport.jpg",
                "pass-composition.jpg",
                "pass-gravostyle.jpg",
            ],
        )

    def test_main_embed(self):
        self._fonts()
        root = self._root()
        directory = os.path.join(self.temp_dir, "run")
        self._gravo(directory, "pass", ["HXOV", "LXH"])
        self._capture(directory, root, [("pass", ["HXOV", "LXH"])])
        out_dir = os.path.join(self.temp_dir, "report")

        # the thresholds can be tightened, the images go in the page
        output = self._main(
            "--viewport",
            "after=%s" % directory,
            "--out",
            out_dir,
            "--embed",
            "--spacing-mean",
            "0.001",
            "--title",
            "Embedded",
        )
        self.assertRegex(output[0], r" FAIL spacing .* \| spacing mean 0\.0\d mm$")

        with open(os.path.join(out_dir, "report.json"), encoding="utf-8") as file:
            report = json.load(file)
        self.assertEqual(
            report["thresholds"], dict(measure.THRESHOLDS, spacing_mean=0.001)
        )
        self.assertEqual(report["cases"][0]["views"][0]["status"], "FAIL")

        self.assertEqual(sorted(os.listdir(out_dir)), ["report.html", "report.json"])
        with open(os.path.join(out_dir, "report.html"), encoding="utf-8") as file:
            page = file.read()
        self.assertIn("<title>Embedded</title>", page)
        self.assertIn("<img src='data:image/jpeg;base64,", page)
        self.assertIn("<img src='data:image/png;base64,", page)
        self.assertFalse("Pre-flight metric check" in page)

    def test_main_gravo(self):
        self._fonts()
        root = self._root()
        before = os.path.join(self.temp_dir, "before")
        after = os.path.join(self.temp_dir, "after")
        self._capture(before, root, [("pass", ["HXOV", "LXH"])], label="before")
        self._capture(after, root, [("pass", ["HXOV", "LXH"])])
        self._gravo(after, "pass", ["HXOV", "LXH"])
        out_dir = os.path.join(self.temp_dir, "report")

        # the compositions are read from the first run that has them
        output = self._main(
            "--viewport",
            "before=%s" % before,
            "--viewport",
            "after=%s" % after,
            "--out",
            out_dir,
        )
        self.assertEqual(len(output), 3)
        self.assertRegex(output[0], r"^pass {21}before  PASS ")
        self.assertRegex(output[1], r"^pass {21}after {3}PASS ")

        # or from the one given, the cases filtered by name
        output = self._main(
            "--viewport",
            "before=%s" % before,
            "--gravo",
            after,
            "--cases",
            "other,pass",
            "--out",
            out_dir,
        )
        self.assertEqual(len(output), 2)
        self.assertRegex(output[0], r"^pass {21}before  PASS ")

    def test_main_missing(self):
        self._fonts()
        root = self._root()
        directory = os.path.join(self.temp_dir, "run")
        self._capture(directory, root, [("pass", ["HXOV", "LXH"])])
        out_dir = os.path.join(self.temp_dir, "report")

        # no composition fetched yet
        with self.assertRaises(SystemExit) as context:
            self._main("--viewport", "after=%s" % directory, "--out", out_dir)
        self.assertEqual(
            context.exception.code,
            "no case has a composition in %s, run gravo_job.py fetch first" % directory,
        )

        # none of the cases asked for
        self._gravo(directory, "pass", ["HXOV", "LXH"])
        with self.assertRaises(SystemExit) as context:
            self._main(
                "--viewport",
                "after=%s" % directory,
                "--out",
                out_dir,
                "--cases",
                "other",
            )
        self.assertIn("no case has a composition", context.exception.code)
        self.assertFalse(os.path.exists(out_dir))

        # the viewport runs and the output directory are required
        with contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit) as context:
                self._main("--out", out_dir)
            self.assertEqual(context.exception.code, 2)
            with self.assertRaises(SystemExit) as context:
                self._main("--viewport", "after=%s" % directory)
            self.assertEqual(context.exception.code, 2)

        # a viewport run without its label is a usage error
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            with self.assertRaises(SystemExit) as context:
                self._main("--viewport", directory, "--out", out_dir)
        self.assertEqual(context.exception.code, 2)
        self.assertIn(
            "--viewport takes LABEL=DIR, got %r" % directory, stderr.getvalue()
        )
