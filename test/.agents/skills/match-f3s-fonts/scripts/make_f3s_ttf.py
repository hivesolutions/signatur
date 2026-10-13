#!/usr/bin/env python3

import io
import os
import sys
import json
import shutil
import hashlib
import argparse
import tempfile
import unittest
import contextlib

from unittest import mock

from fontTools.ttLib import TTFont, newTable
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib.tables._c_m_a_p import CmapSubtable

ROOT_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "..")
)
SCRIPTS_DIR = os.path.join(ROOT_DIR, ".agents", "skills", "match-f3s-fonts", "scripts")
STATIC_FONTS_DIR = os.path.join(ROOT_DIR, "static", "fonts")
sys.path.insert(0, SCRIPTS_DIR)

import f3s_model as M
import make_f3s_ttf as G

SPACE = dict(metrics=[5000, 0, -428, 0, 0, 0, 3862, 0, 0, 3419, 0], strokes=[])

H = dict(
    metrics=[5000, 0, -650, 0, 0, 0, 4570, 0, 0, 3920, 5000],
    strokes=[
        [["on", 0, 0], ["end", 0, 5000]],
        [["on", 3920, 0], ["end", 3920, 5000]],
        [["on", 0, 2500], ["end", 3920, 2500]],
    ],
)

# an H drawn at 0.9 of the cap height, for the outline scale
SMALL_H = dict(
    metrics=[5000, 0, -650, 0, 0, 0, 4570, 0, 0, 3920, 4500],
    strokes=[
        [["on", 0, 0], ["end", 0, 4500]],
        [["on", 3920, 0], ["end", 3920, 4500]],
    ],
)

I = dict(
    metrics=[5000, 0, -650, 0, 0, 0, 1300, 0, 0, 0, 5000],
    strokes=[[["on", 0, 0], ["end", 0, 5000]]],
)

# the @ of Helvetica 4L is stored at its own m[0], not at 5000
AT = dict(
    metrics=[21740, 0, -1200, 0, 3000, 0, 18600, 0, 0, 17400, 17000],
    strokes=[[["on", 0, 0], ["on", 17400, 0], ["end", 17400, 17000]]],
)

L_STROKE = dict(
    metrics=[20000, 0, -2000, 0, 0, 0, 16000, 0, 0, 14000, 20000],
    strokes=[[["on", 0, 20000], ["on", 0, 0], ["end", 14000, 0]]],
)

FAMILY = dict(
    metrics=[9417, 0, 0, 0, 0, 0, 5705, 0, 0, 5705, 9417],
    strokes=[
        [["on", 0, 0], ["on", 5705, 0], ["end", 2852, 8297]],
        [["on", 2852, 9417], ["end", 2852, 9417]],
    ],
)

INFINITY = dict(
    metrics=[5000, 0, -200, 0, -500, 0, 8400, 0, 0, 8000, 4000],
    strokes=[[["on", 0, 0], ["on", 8000, 4000], ["end", 0, 4000]]],
)

# spaced like the E of coolemojis.ttf but drawn lower
RINGS = dict(
    metrics=[5000, 0, 0, 0, 0, 0, 8043, 0, 0, 8043, 4000],
    strokes=[[["on", 0, 0], ["end", 8043, 4000]]],
)

TEXT_GLYPHS = {"32": SPACE, "64": AT, "72": H, "73": I, "321": L_STROKE}

# a letter drawn as three sides of a box and the same letter with a
# curved accent above it, that stands apart from the letter
U = dict(
    metrics=[5000, 0, -300, 0, 0, 0, 3600, 0, 0, 3000, 3500],
    strokes=[[["on", 0, 3500], ["on", 0, 0], ["on", 3000, 0], ["end", 3000, 3500]]],
)

U_TILDE = dict(
    metrics=[5000, 0, -300, 0, 0, 0, 4600, 0, 0, 4000, 6500],
    strokes=[
        [["on", 0, 3500], ["on", 0, 0], ["on", 3000, 0], ["end", 3000, 3500]],
        [["on", 2000, 6000], ["ctrl", 3000, 7000], ["end", 4000, 6000]],
    ],
)

# the stem of the I with an accent below, that starts on it
STEM_CEDILLA = dict(
    metrics=[5000, 0, -150, 0, 1000, 0, 1300, 0, 0, 500, 6000],
    strokes=[
        [["on", 500, 1000], ["end", 500, 6000]],
        [["on", 500, 1000], ["end", 0, 0]],
    ],
)

# the letters l and u with the accented ũ (drawn apart from the letter)
# and ļ (joined to it), neither being in the fonts of the repository
DRAW_GLYPHS = {
    "32": SPACE,
    "72": H,
    "108": I,
    "117": U,
    "316": STEM_CEDILLA,
    "361": U_TILDE,
}

ADJUST = {"@": {"left": -43, "right": -18}}

MAPPING = {
    "!": "3007.filho-familia",
    "C": "1103.infinito",
    "E": {"name": "1105.aliancas"},
    "W": "1406.camara",
    "ç": "1103.infinito",
}


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


class MakeF3STTFTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self._gravo_pilot = M.GRAVO_PILOT
        self._parser = M._PARSER
        self._f3s_fonts = M._FONTS
        self._manifest_path = M.MANIFEST_PATH
        self._fonts_dir = G.FONTS_DIR

        # the parsed fonts are cached by path and the fonts directory is
        # where build writes, both are kept away from the repository
        M._FONTS = dict()
        G.FONTS_DIR = os.path.join(self.temp_dir, "fonts")
        os.makedirs(G.FONTS_DIR)

    def tearDown(self):
        M.GRAVO_PILOT = self._gravo_pilot
        M._PARSER = self._parser
        M._FONTS = self._f3s_fonts
        M.MANIFEST_PATH = self._manifest_path
        G.FONTS_DIR = self._fonts_dir
        shutil.rmtree(self.temp_dir)

    def _write(self, path, data):
        path = os.path.join(self.temp_dir, path)
        if not os.path.exists(os.path.dirname(path)):
            os.makedirs(os.path.dirname(path))
        with open(path, "w", encoding="utf-8") as file:
            file.write(data)
        return path

    def _fonts(self, fonts):
        M._PARSER = FakeParser()
        M.GRAVO_PILOT = self.temp_dir
        paths = dict()
        for name, glyphs in fonts.items():
            paths[name] = self._write(
                os.path.join("src", "gravo_pilot", "res", "fonts", "%s.f3s" % name),
                json.dumps(glyphs),
            )
        return paths

    def _emoji_fonts(self):
        """
        Writes the F3S fonts of the test mapping and the mapping itself,
        returning its path and the mapping as Signatur loads it.
        """

        self._fonts(
            {
                "HELVETICA 4L": TEXT_GLYPHS,
                "3007.filho-familia": {"97": FAMILY},
                "1103.infinito": {"97": INFINITY},
                "1105.aliancas": {"97": RINGS},
                "1406.camara": {},
            }
        )
        path = self._write("mapping.json", json.dumps(MAPPING))
        return path, M.load_mapping(path)

    def _ttf(self, stem):
        path = os.path.join(G.FONTS_DIR, "%s.ttf" % stem)
        shutil.copyfile(os.path.join(STATIC_FONTS_DIR, "%s.ttf" % stem), path)
        return path

    def _open(self, stem):
        return G.open_font(self._ttf(stem))

    def _reload(self, font):
        buffer = io.BytesIO()
        font.save(buffer)
        return TTFont(io.BytesIO(buffer.getvalue()))

    def _bounds(self, font, char):
        glyf = font["glyf"]
        glyph = glyf[font.getBestCmap()[ord(char)]]
        glyph.recalcBounds(glyf)
        return (glyph.xMin, glyph.yMin, glyph.xMax, glyph.yMax)

    def _advance(self, font, char):
        return font["hmtx"][font.getBestCmap()[ord(char)]]

    def _composite(self, font, name, base, offset):
        """
        Replaces a glyph by a composite of another glyph moved by the
        offset, as the fonts with accented letters built from parts.
        """

        pen = TTGlyphPen(font.getGlyphSet())
        pen.addComponent(base, (1, 0, 0, 1, offset, 0))
        font["glyf"][name] = pen.glyph()

    def _manifest(self):
        """
        Writes a manifest of two fonts with their regular TTFs and F3S
        fonts in the temporary directory, the hashes matching the files.
        """

        paths = self._fonts(
            {"HELVETICA 4L": TEXT_GLYPHS, "ROMAN 4L": {"32": SPACE, "72": H}}
        )
        entries = []
        for stem, name, adjust in (
            ("helvetica4l", "Helvetica 4L", ADJUST),
            ("roman4l", "Roman 4L", dict()),
        ):
            self._ttf(stem)
            with open(paths[name.upper()], "rb") as file:
                sha256 = hashlib.sha256(file.read()).hexdigest()
            entries.append(dict(stem=stem, f3s=name, f3s_sha256=sha256, adjust=adjust))
        return self._write("fonts.json", json.dumps(entries))

    def _glyphs_manifest(self):
        """
        Writes a manifest of two fonts, the first one with two glyphs to
        draw (one after its F3S lines, the other with the accent of a
        character of the font) and the second one with none.
        """

        paths = self._fonts(
            {"HELVETICA 4L": DRAW_GLYPHS, "ROMAN 4L": {"32": SPACE, "72": H}}
        )
        entries = []
        for stem, name, glyphs in (
            ("helvetica4l", "Helvetica 4L", {"ũ": "ã", "ļ": "f3s"}),
            ("roman4l", "Roman 4L", None),
        ):
            self._ttf(stem)
            with open(paths[name.upper()], "rb") as file:
                sha256 = hashlib.sha256(file.read()).hexdigest()
            entry = dict(stem=stem, f3s=name, f3s_sha256=sha256, adjust=dict())
            if glyphs:
                entry["glyphs"] = glyphs
            entries.append(entry)
        return self._write("fonts.json", json.dumps(entries))

    def _contours(self, glyph):
        """
        Returns the points of a glyph contour by contour.
        """

        points = list(glyph.coordinates)
        contours, start = [], 0
        for end in glyph.endPtsOfContours:
            contours.append(points[start : end + 1])
            start = end + 1
        return contours

    def _outlines(self, font, glyph):
        """
        Returns the box of the outline of every contour of a glyph, the
        one of its curves and not of their control points.
        """

        ops = G.pathops()
        path = ops.Path()
        glyph.draw(ops.PathPen(path), font["glyf"])
        return [contour.bounds for contour in path.contours]

    def _assert_box(self, box, expected, delta=1):
        for value, other in zip(box, expected):
            self.assertAlmostEqual(value, other, delta=delta)

    def _main(self, *args):
        """
        Runs the command line with the provided arguments, returning the
        exit code (None when it returns) and the standard output and error.
        """

        stdout, stderr, code = io.StringIO(), io.StringIO(), None
        with mock.patch.object(sys, "argv", ["make_f3s_ttf.py", *args]):
            with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                try:
                    G.main()
                except SystemExit as exception:
                    code = exception.code
        return code, stdout.getvalue(), stderr.getvalue()

    def test_open_font(self):
        path = self._ttf("helvetica4l")
        modified = TTFont(path)["head"].modified

        # the head timestamp is kept on save, so saving twice (even in
        # another second) gives the same file
        font = G.open_font(path)
        first = io.BytesIO()
        font.save(first)
        with mock.patch("time.time", return_value=1893456000):
            second = io.BytesIO()
            G.open_font(path).save(second)
        self.assertEqual(first.getvalue(), second.getvalue())
        self.assertEqual(TTFont(first)["head"].modified, modified)

    def test_cap_units(self):
        font = self._open("helvetica4l")
        self.assertEqual(G.cap_units(font), 700.0)

        font["head"].unitsPerEm = 2048
        self.assertAlmostEqual(G.cap_units(font), 1433.6, delta=1e-9)

    def test_load_adjust(self):
        self.assertEqual(G.load_adjust(None), dict())
        self.assertEqual(G.load_adjust(""), dict())

        path = self._write("adjust.json", json.dumps(ADJUST))
        self.assertEqual(G.load_adjust(path), {"@": {"left": -43, "right": -18}})

    def test_decompose(self):
        font = self._open("helvetica4l")
        self.assertEqual(G.decompose(font), [])

        self._composite(font, "I", "H", 50)
        self.assertEqual(G.decompose(font), ["I"])

        glyph = font["glyf"]["I"]
        self.assertFalse(glyph.isComposite())
        self.assertEqual(glyph.numberOfContours, 1)
        self.assertEqual(self._bounds(font, "I"), (120, 0, 672, 700))

        # the decomposed glyph no longer follows its former component
        font["glyf"]["H"].coordinates.translate((100, 0))
        self.assertEqual(self._bounds(font, "I"), (120, 0, 672, 700))

    def test_drop_hinting(self):
        font = self._open("helvetica4l")
        self.assertIn("fpgm", font)

        G.drop_hinting(font)
        for tag in ("fpgm", "prep", "cvt "):
            self.assertNotIn(tag, font)
        self.assertIn("gasp", font)

        # the font must still be saved, with every outline left without
        # any instruction and as it was
        font = self._reload(font)
        for tag in G.HINTING_TABLES:
            self.assertNotIn(tag, font)
        glyf = font["glyf"]
        outlines = [
            name for name in font.getGlyphOrder() if glyf[name].numberOfContours
        ]
        self.assertEqual(len(outlines), 127)
        for name in outlines:
            self.assertEqual(glyf[name].program.getBytecode(), b"")
        self.assertEqual(self._bounds(font, "H"), (70, 0, 622, 700))

    def test_scale_outlines(self):
        font = self._open("helvetica4l")

        G.scale_outlines(font, 0.9)
        self.assertEqual(self._bounds(font, "H"), (63, 0, 560, 630))
        self.assertEqual(self._bounds(font, "I"), (63, 0, 131, 630))
        self.assertEqual(self._advance(font, "H"), (623, 63))
        self.assertEqual(self._advance(font, "I"), (195, 63))
        self.assertEqual(self._advance(font, " "), (450, 0))
        self.assertNotIn("fpgm", font)

        font = self._reload(font)
        self.assertEqual(self._bounds(font, "H"), (63, 0, 560, 630))
        self.assertEqual(self._advance(font, "H"), (623, 63))

    def test_auto_scale(self):
        self._fonts(dict())
        font = self._open("helvetica4l")

        scale = G.auto_scale(font, dict(glyphs={72: SMALL_H}))
        self.assertAlmostEqual(scale, 0.9, delta=1e-9)

        scale = G.auto_scale(font, dict(glyphs={72: H}))
        self.assertAlmostEqual(scale, 1.0, delta=1e-9)

    def test_auto_scale_missing(self):
        self._fonts(dict())
        font = self._open("helvetica4l")

        with self.assertRaises(RuntimeError) as context:
            G.auto_scale(font, dict(glyphs={73: I}))
        self.assertIn("--scale FACTOR", str(context.exception))

        for table in font["cmap"].tables:
            table.cmap.pop(72, None)
        with self.assertRaises(RuntimeError):
            G.auto_scale(font, dict(glyphs={72: H}))

    def test_set_vertical(self):
        font = self._open("roman4l")
        self.assertEqual(G.set_vertical(font), (891, -191, 700))
        self.assertEqual((font["hhea"].ascent, font["hhea"].descent), (891, -191))
        os2 = font["OS/2"]
        self.assertEqual((os2.sTypoAscender, os2.sTypoDescender), (891, -191))

        # ascent + descent is odd against an even cap, so the sum loses
        # one unit to keep ascent - descent equal to the cap
        font = self._open("helvetica4l")
        self.assertEqual(G.set_vertical(font), (934, -234, 700))
        self.assertEqual(font["OS/2"].fsSelection, 0xC0)
        self.assertEqual(font["OS/2"].version, 4)

    def test_set_vertical_typo(self):
        font = self._open("helvetica4l")
        os2 = font["OS/2"]
        os2.version, os2.fsSelection = 3, 0x40

        G.set_vertical(font)
        self.assertEqual(os2.version, 4)
        self.assertEqual(os2.fsSelection, 0xC0)

        os2.version, os2.fsSelection = 5, 0x40
        G.set_vertical(font)
        self.assertEqual(os2.version, 5)
        self.assertEqual(os2.fsSelection, 0xC0)

    def test_tune_text(self):
        self._fonts({"HELVETICA 4L": TEXT_GLYPHS})
        font = self._open("helvetica4l")
        font["OS/2"].xAvgCharWidth = 0

        # the regular fonts lost their signature when their missing
        # letters were drawn, a font that still has one loses it here
        font["DSIG"] = newTable("DSIG")

        result = G.tune_text(font, M.load_f3s("Helvetica 4L"), adjust=ADJUST)
        self.assertEqual(
            result,
            dict(changed=4, decomposed=[], scale=None, vertical=(934, -234, 700)),
        )

        # the advance is (-m[2] + m[6]) * 0.7 * 1000 / m[0] and the ink
        # centre lands on (-m[2] + m[9] / 2) * 0.7 * 1000 / m[0]
        self.assertEqual(self._advance(font, "H"), (731, 89))
        self.assertEqual(self._bounds(font, "H"), (89, 0, 641, 700))
        self.assertEqual(self._advance(font, "I"), (273, 53))
        self.assertEqual(self._bounds(font, "I"), (53, 0, 129, 700))
        self.assertEqual(self._advance(font, " "), (601, 0))

        # the @ is scaled by its own m[0] and corrected 43 units to the
        # left with 18 units less after it
        self.assertEqual(self._advance(font, "@"), (577, -13))
        self.assertEqual(self._bounds(font, "@"), (-13, -5, 564, 594))

        # the glyphs the F3S lacks keep their spacing and outline
        self.assertEqual(self._advance(font, "A"), (756, 70))
        self.assertEqual(self._bounds(font, "A"), (70, 0, 685, 700))

        # the average width is the one of every glyph with an advance
        widths = [width for width, _lsb in font["hmtx"].metrics.values() if width]
        self.assertEqual(len(widths), 130)
        self.assertAlmostEqual(sum(widths) / float(len(widths)), 575.4077, delta=1e-4)
        self.assertEqual(font["OS/2"].xAvgCharWidth, 575)
        self.assertNotIn("DSIG", font)

        # without scaling the outlines keep their hinting
        self.assertIn("fpgm", font)

    def test_tune_text_adjust(self):
        self._fonts({"HELVETICA 4L": TEXT_GLYPHS})

        font = self._open("helvetica4l")
        G.tune_text(font, M.load_f3s("Helvetica 4L"))
        self.assertEqual(self._advance(font, "@"), (638, 30))
        self.assertEqual(self._bounds(font, "@"), (30, -5, 607, 594))

        # left moves the ink and adds to the advance, right only adds
        font = self._open("helvetica4l")
        adjust = {"@": {"right": 10}, "H": {"left": 5}}
        G.tune_text(font, M.load_f3s("Helvetica 4L"), adjust=adjust)
        self.assertEqual(self._advance(font, "@"), (648, 30))
        self.assertEqual(self._advance(font, "H"), (736, 94))

    def test_tune_text_composite(self):
        self._fonts({"HELVETICA 4L": TEXT_GLYPHS})
        font = self._open("helvetica4l")
        self._composite(font, "I", "H", 50)

        result = G.tune_text(font, M.load_f3s("Helvetica 4L"))
        self.assertEqual(result["decomposed"], ["I"])

        # the I lands on its own ink centre (91) whatever H moves by
        self.assertEqual(self._bounds(font, "H"), (89, 0, 641, 700))
        self.assertEqual(self._bounds(font, "I"), (-185, 0, 367, 700))
        self.assertEqual(self._advance(font, "I"), (273, -185))

    def test_tune_text_scale(self):
        self._fonts({"SMALL 4L": {"32": SPACE, "72": SMALL_H}})

        font = self._open("helvetica4l")
        result = G.tune_text(font, M.load_f3s("Small 4L"), scale="auto")
        self.assertAlmostEqual(result["scale"], 0.9, delta=1e-9)
        self.assertEqual(result["vertical"], (900, -270, 630))
        self.assertEqual(self._bounds(font, "H"), (117, 0, 614, 630))
        self.assertEqual(self._advance(font, "H"), (731, 117))

        # the glyphs the F3S lacks are scaled with the rest of the font
        self.assertEqual(self._advance(font, "A"), (680, 63))
        self.assertEqual(self._bounds(font, "A"), (63, 0, 616, 630))

        # the instructions no longer fit the outlines, so they are gone
        font = self._reload(font)
        self.assertNotIn("fpgm", font)
        self.assertEqual(self._bounds(font, "H"), (117, 0, 614, 630))

        font = self._open("helvetica4l")
        result = G.tune_text(font, M.load_f3s("Small 4L"), scale="1")
        self.assertEqual(result["scale"], "1")
        self.assertEqual(self._bounds(font, "H"), (89, 0, 641, 700))
        self.assertIn("fpgm", font)

    def test_tune_text_shared(self):
        nbsp = dict(metrics=[5000, 0, 0, 0, 0, 0, 1000, 0, 0, 0, 0], strokes=[])
        self._fonts({"HELVETICA 4L": {"32": SPACE, "72": H, "160": nbsp}})
        font = self._open("helvetica4l")
        for table in font["cmap"].tables:
            table.cmap[0xA0] = "space"

        # a glyph shared by two characters is spaced once, after the
        # first of them
        result = G.tune_text(font, M.load_f3s("Helvetica 4L"))
        self.assertEqual(result["changed"], 2)
        self.assertEqual(font["hmtx"]["space"], (601, 0))

    def test_entry_f3s(self):
        manifest = M.load_manifest(self._manifest())
        self.assertEqual(G.entry_f3s(manifest[0]), M.find_f3s("Helvetica 4L"))

        with self.assertRaises(RuntimeError) as context:
            G.entry_f3s(dict(manifest[0], f3s_sha256="0" * 64))
        self.assertIn("measure it again", str(context.exception))

    def test_build_font(self):
        manifest = M.load_manifest(self._manifest())
        regular = TTFont(os.path.join(STATIC_FONTS_DIR, "helvetica4l.ttf"))

        data = G.build_font(manifest[0])
        font = TTFont(io.BytesIO(data))
        self.assertEqual(self._advance(font, "H"), (731, 89))
        self.assertEqual(self._advance(font, "@"), (577, -13))
        self.assertEqual(self._advance(font, " "), (601, 0))
        self.assertEqual(font["hhea"].ascent, 934)
        self.assertEqual(font["head"].modified, regular["head"].modified)
        self.assertNotIn("DSIG", font)

        # a second build is the same file byte for byte
        self.assertEqual(G.build_font(manifest[0]), data)

        font = TTFont(io.BytesIO(G.build_font(manifest[1])))
        self.assertEqual(self._advance(font, "H"), (731, 82))
        self.assertEqual(self._bounds(font, "H"), (82, 0, 649, 700))

    def test_build_font_changed(self):
        manifest = M.load_manifest(self._manifest())
        path = M.find_f3s("Helvetica 4L")
        self._fonts({"HELVETICA 4L": dict(TEXT_GLYPHS, **{"73": H})})
        with open(path, "rb") as file:
            sha256 = hashlib.sha256(file.read()).hexdigest()

        # the corrections were measured with the old F3S, so the build
        # stops instead of applying them to another font
        with self.assertRaises(RuntimeError) as context:
            G.build_font(manifest[0])
        message = str(context.exception)
        self.assertIn(path, message)
        self.assertIn("sha256 %s" % sha256, message)
        self.assertIn("manifest %s" % manifest[0]["f3s_sha256"], message)
        self.assertIn("measure it again", message)

    def test_build_font_scale(self):
        paths = self._fonts({"SMALL 4L": {"32": SPACE, "72": SMALL_H}})
        self._ttf("helvetica4l")
        with open(paths["SMALL 4L"], "rb") as file:
            sha256 = hashlib.sha256(file.read()).hexdigest()
        entry = dict(
            stem="helvetica4l", f3s="Small 4L", f3s_sha256=sha256, adjust=dict()
        )

        # the capitals of the F3S are 0.9 of its size, so the outlines a
        # text --scale auto measured are only built again with the scale
        # the manifest records
        font = TTFont(io.BytesIO(G.build_font(entry)))
        self.assertEqual(self._bounds(font, "H"), (89, 0, 641, 700))
        self.assertIn("fpgm", font)

        for scale in ("auto", 0.9, "0.9"):
            data = G.build_font(dict(entry, scale=scale))
            font = TTFont(io.BytesIO(data))
            self.assertEqual(self._bounds(font, "H"), (117, 0, 614, 630))
            self.assertEqual(self._advance(font, "H"), (731, 117))
            self.assertNotIn("fpgm", font)
            self.assertEqual(G.build_font(dict(entry, scale=scale)), data)

    def test_build_font_manifest(self):
        native = os.path.join(M.GRAVO_NATIVE, "f3s_parser.py")
        pilot = os.path.join(M.GRAVO_PILOT, "src", "gravo_pilot")
        if not os.path.exists(native) or not os.path.exists(pilot):
            self.skipTest("Skipping test: gravo-native or gravo-pilot unavailable")

        # the committed fonts are read (never written) to prove they are
        # the build of the manifest
        G.FONTS_DIR = self._fonts_dir
        for entry in M.load_manifest():
            path = os.path.join(self._fonts_dir, "%s-f3s.ttf" % entry["stem"])
            with open(path, "rb") as file:
                self.assertEqual(G.build_font(entry), file.read())

    def test_pathops(self):
        pathops = G._PATHOPS
        try:
            G._PATHOPS = None
            ops = G.pathops()
            self.assertTrue(hasattr(ops, "Path"))
            self.assertIs(G.pathops(), ops)

            # the glyphs cannot be drawn without the path operations
            G._PATHOPS = None
            with mock.patch.dict(sys.modules, {"pathops": None}):
                with self.assertRaises(RuntimeError) as context:
                    G.pathops()
            self.assertIn("skia-pathops not found", str(context.exception))
        finally:
            G._PATHOPS = pathops

    def test_base_char(self):
        self.assertEqual(G.base_char("ç"), "c")
        self.assertEqual(G.base_char("Ñ"), "N")
        self.assertEqual(G.base_char("Õ"), "O")
        self.assertEqual(G.base_char("ļ"), "l")
        self.assertEqual(G.base_char("a"), "a")
        self.assertEqual(G.base_char("@"), "@")

    def test_glyph_path(self):
        font = self._open("helvetica4l")
        path = G.glyph_path(font, "H")
        self.assertEqual(path.bounds, (70.0, 0.0, 622.0, 700.0))
        self.assertEqual(len(list(path.contours)), 1)

        # the outline is the rendered one, moved to the left side bearing
        # of the glyph when its left edge is somewhere else
        font["hmtx"]["H"] = (692, 100)
        self.assertEqual(G.glyph_path(font, "H").bounds, (100.0, 0.0, 652.0, 700.0))

    def test_contour_width(self):
        ops = G.pathops()
        path = ops.Path()
        path.moveTo(0, 0)
        path.lineTo(100, 0)
        path.lineTo(100, 100)
        path.lineTo(0, 100)
        path.close()
        self.assertAlmostEqual(G.contour_width(path), 50.0, delta=1e-6)

        path = ops.Path()
        path.moveTo(0, 0)
        path.lineTo(100, 0)
        path.lineTo(100, 4)
        path.lineTo(0, 4)
        path.close()
        self.assertAlmostEqual(G.contour_width(path), 800 / 208.0, delta=1e-6)

        self.assertEqual(G.contour_width(ops.Path()), 0.0)

    def test_curves_path(self):
        # a line is drawn with the width, its ends being round
        path = G.curves_path([[(None, (0, 0)), (None, (100, 0))]], 10, 0.5)
        self._assert_box(path.bounds, (-5, -5, 105, 5), delta=0.01)
        self.assertEqual(len(list(path.contours)), 1)
        self.assertAlmostEqual(path.area, 1000 + 78.54, delta=1)

        # a curve keeps its shape, the ink reaching half the width past it
        curve = [(None, (0, 0)), ((50, 100), (100, 0))]
        path = G.curves_path([curve], 10, 0.5)
        self._assert_box(path.bounds, (-5, -5, 105, 55), delta=0.6)
        self.assertEqual(len(list(path.contours)), 1)

        # a curve that ends where it starts is a loop, filled
        loop = [
            (None, (0, 0)),
            (None, (100, 0)),
            (None, (100, 100)),
            (None, (0, 100)),
            (None, (0, 0)),
        ]
        path = G.curves_path([loop], 10, 0.5)
        self._assert_box(path.bounds, (-5, -5, 105, 105), delta=0.01)
        self.assertEqual(len(list(path.contours)), 1)
        self.assertAlmostEqual(path.area, 110 * 110 - 21.46, delta=1)

        # the same curve left open by more than the gap keeps its hole,
        # which is wider than the line
        path = G.curves_path([loop[:-1] + [(None, (0, 6))]], 10, 0.5)
        self.assertEqual(
            [contour.clockwise for contour in path.contours], [True, False]
        )

        # the hole left between two lines closer than the width is
        # filled, like the fonts fill the lines of a stroke, the two round
        # ends leaving a notch of under two units between them
        thin = [
            (None, (0, 0)),
            (None, (100, 0)),
            (None, (100, 16)),
            (None, (0, 16)),
            (None, (0, 6)),
        ]
        path = G.curves_path([thin], 10, 0.5)
        self.assertEqual([contour.clockwise for contour in path.contours], [True])
        self._assert_box(path.bounds, (-5, -5, 105, 21), delta=0.01)
        self.assertAlmostEqual(path.area, 110 * 26 - 21.46, delta=3)

        # the curves that overlap are a single piece of ink and the ones
        # apart one each
        cross = [
            [(None, (0, 0)), (None, (100, 0))],
            [(None, (50, -50)), (None, (50, 50))],
        ]
        path = G.curves_path(cross, 10, 0.5)
        self.assertEqual(len(list(path.contours)), 1)
        self._assert_box(path.bounds, (-5, -55, 105, 55), delta=0.01)
        apart = [
            [(None, (0, 0)), (None, (100, 0))],
            [(None, (0, 40)), (None, (100, 40))],
        ]
        self.assertEqual(len(list(G.curves_path(apart, 10, 0.5).contours)), 2)

        # a curve of no length is a dot as wide as the line, two points
        # not being a loop to fill, and no curve is no ink
        path = G.curves_path([[(None, (20, 30)), (None, (20, 30))]], 10, 0.5)
        self._assert_box(path.bounds, (15, 25, 25, 35), delta=0.01)
        self.assertAlmostEqual(path.area, 78.54, delta=1)
        self.assertEqual(len(list(G.curves_path([], 10, 0.5).contours)), 0)

    def test_join_curve(self):
        ops = G.pathops()
        outline = ops.Path()
        outline.moveTo(0, 0)
        outline.lineTo(100, 0)
        outline.lineTo(100, 50)
        outline.lineTo(0, 50)
        outline.close()

        # an end joined to the letter that is short of its outline is
        # extended along the curve until it gets into it
        curve = [(None, (50, -10)), (None, (50, -60))]
        joined = G.join_curve(outline, curve, (True, False), 10)
        self.assertEqual(joined[1:], curve)
        self.assertEqual(joined[0][0], None)
        self.assertEqual(joined[0][1][0], 50)
        self.assertLessEqual(abs(joined[0][1][1] - 0.5), 0.5)
        self.assertEqual(curve, [(None, (50, -10)), (None, (50, -60))])

        joined = G.join_curve(outline, curve[::-1], (False, True), 10)
        self.assertEqual(joined[:2], curve[::-1])
        self.assertEqual(joined[2][0], None)
        self.assertEqual(joined[2][1][0], 50)
        self.assertLessEqual(abs(joined[2][1][1] - 0.5), 0.5)

        # the direction is the one the curve ends with, its control point
        curve = [(None, (50, -10)), ((50, -30), (20, -60))]
        joined = G.join_curve(outline, curve, (True, False), 10)
        self.assertEqual(joined[0][1][0], 50)
        self.assertLessEqual(abs(joined[0][1][1] - 0.5), 0.5)
        curve = [(None, (20, -60)), ((50, -30), (50, -10))]
        joined = G.join_curve(outline, curve, (False, True), 10)
        self.assertEqual(joined[:2], curve)
        self.assertEqual(joined[2][1][0], 50)
        self.assertLessEqual(abs(joined[2][1][1] - 0.5), 0.5)

        # a curve between two points of the letter is extended at both
        # ends, each along its own direction
        curve = [(None, (20, -10)), (None, (50, -40)), (None, (80, -10))]
        joined = G.join_curve(outline, curve, (True, True), 10)
        self.assertEqual(joined[1:4], curve)
        self.assertEqual(len(joined), 5)
        for point, x in ((joined[0][1], 10), (joined[4][1], 90)):
            self.assertAlmostEqual(point[0], x, delta=1)
            self.assertLessEqual(abs(point[1] - 0.5), 0.5)

        # the ends that are not joined, already in the outline or too far
        # from it (three line widths) are left as they are
        curve = [(None, (50, -10)), (None, (50, -60))]
        self.assertEqual(G.join_curve(outline, curve, (False, False), 10), curve)
        self.assertEqual(G.join_curve(outline, curve, (False, True), 10), curve)
        curve = [(None, (50, 10)), (None, (50, -60))]
        self.assertEqual(G.join_curve(outline, curve, (True, False), 10), curve)
        curve = [(None, (50, -40)), (None, (50, -90))]
        self.assertEqual(G.join_curve(outline, curve, (True, False), 10), curve)
        self.assertEqual(len(G.join_curve(outline, curve, (True, False), 15)), 3)

    def test_accent_path(self):
        font = self._open("helvetica4l")
        accent = G.accent_path(font, "ã")
        self.assertEqual(accent.bounds, (144.0, 628.0, 435.0, 700.0))
        self.assertEqual(len(list(accent.contours)), 1)

        for char in ("a", "ũ", "@"):
            with self.assertRaises(RuntimeError) as context:
                G.accent_path(font, char)
            self.assertIn("not an accented letter", str(context.exception))

        # a character drawn in one piece has no accent to take
        font["glyf"]["atilde"] = font["glyf"]["a"]
        with self.assertRaises(RuntimeError) as context:
            G.accent_path(font, "ã")
        self.assertIn("no accent apart from its letter", str(context.exception))

    def test_draw_glyph(self):
        self._fonts({"HELVETICA 4L": DRAW_GLYPHS})
        font = self._open("helvetica4l")
        letter = font["glyf"]["u"]

        glyph, advance = G.draw_glyph(font, M.load_f3s("Helvetica 4L"), "ũ")
        self.assertEqual(advance, 560)
        self.assertEqual(glyph.numberOfContours, 2)

        # the accent stands apart from the letter, which is the u of the
        # font point for point
        contours = self._contours(glyph)
        self.assertEqual(contours[0], list(letter.coordinates))
        self.assertEqual(list(glyph.flags)[: len(contours[0])], list(letter.flags))

        # the accent is the F3S curve drawn 15 units wide: the outline of
        # the u is centred on 280 and its F3S ink on 252, so the curve
        # from 322 to 602 units of the pen runs from 350 to 630
        boxes = self._outlines(font, glyph)
        self.assertEqual(boxes[0], G.glyph_path(font, "u").bounds)
        self.assertEqual((boxes[0][0], boxes[0][2]), (70.0, 490.0))
        self._assert_box(boxes[1], (342.5, 832.5, 637.5, 917.5))
        self.assertLess(len(contours[1]), 40)

        # nothing is written to the font
        self.assertNotIn(ord("ũ"), font.getBestCmap())

        # a letter that the font renders away from its points, at its
        # left side bearing, takes the accent where it is rendered
        font["hmtx"]["u"] = (560, 100)
        glyph, advance = G.draw_glyph(font, M.load_f3s("Helvetica 4L"), "ũ")
        boxes = self._outlines(font, glyph)
        self.assertEqual((boxes[0][0], boxes[0][2]), (100.0, 520.0))
        self._assert_box(boxes[1], (372.5, 832.5, 667.5, 917.5))

    def test_draw_glyph_source(self):
        self._fonts({"HELVETICA 4L": DRAW_GLYPHS})
        font = self._open("helvetica4l")
        tilde = G.accent_path(font, "ã").bounds
        self.assertEqual(tilde, (144.0, 628.0, 435.0, 700.0))

        glyph, advance = G.draw_glyph(font, M.load_f3s("Helvetica 4L"), "ũ", source="ã")
        self.assertEqual(advance, 560)
        self.assertEqual(glyph.numberOfContours, 2)
        contours = self._contours(glyph)
        self.assertEqual(contours[0], list(font["glyf"]["u"].coordinates))

        # the accent is the tilde of the ã, as large as it is there and
        # moved to the middle of the F3S accent (490, 875), far from the
        # place it has over the a (289.5, 664)
        box = self._outlines(font, glyph)[1]
        self._assert_box(box, (344.5, 839, 635.5, 911))
        self.assertAlmostEqual(box[2] - box[0], tilde[2] - tilde[0], delta=1)
        self.assertAlmostEqual(box[3] - box[1], tilde[3] - tilde[1], delta=1)

    def test_draw_glyph_joined(self):
        self._fonts({"HELVETICA 4L": DRAW_GLYPHS})
        font = self._open("helvetica4l")
        stem = list(font["glyf"]["l"].coordinates)
        self.assertEqual(stem, [(70, 700), (138, 700), (138, 0), (70, 0)])

        # the accent starts on the F3S stem, at the bottom of the outline
        # (104, 0), and runs to (34, -140), being merged with the letter
        glyph, advance = G.draw_glyph(font, M.load_f3s("Helvetica 4L"), "ļ")
        self.assertEqual(advance, 208)
        self.assertEqual(glyph.numberOfContours, 1)
        self._assert_box(self._outlines(font, glyph)[0], (26.5, -147.5, 138, 700))
        points = list(glyph.coordinates)
        for point in stem:
            self.assertIn(point, points)

    def test_draw_glyph_refused(self):
        self._fonts({"HELVETICA 4L": dict(DRAW_GLYPHS, **{"227": U, "241": U})})
        font = self._open("helvetica4l")
        f3s = M.load_f3s("Helvetica 4L")

        # a letter without an accent, a character or a letter that the
        # F3S font does not have
        for char in ("u", "ç", "ń"):
            with self.assertRaises(RuntimeError) as context:
                G.draw_glyph(font, f3s, char)
            self.assertIn("no F3S glyph or no F3S letter", str(context.exception))

        # an F3S glyph that draws nothing but its letter
        with self.assertRaises(RuntimeError) as context:
            G.draw_glyph(font, dict(glyphs={361: U, 117: U}), "ũ")
        self.assertIn("draws no accent", str(context.exception))

        # an F3S glyph whose letter is not the one of its plain glyph,
        # that would be drawn whole as an accent over the letter
        other = dict(U, metrics=[5000, 0, -4300, 0, 0, 0, 3600, 0, 0, 3000, 3500])
        with self.assertRaises(RuntimeError) as context:
            G.draw_glyph(font, dict(glyphs={361: U_TILDE, 117: other}), "ũ")
        self.assertIn("is not drawn on its 'u'", str(context.exception))

        # a letter that the font does not have
        del font["cmap"].tables[0].cmap[ord("u")]
        for table in font["cmap"].tables:
            table.cmap.pop(ord("u"), None)
        with self.assertRaises(RuntimeError) as context:
            G.draw_glyph(font, f3s, "ũ")
        self.assertIn("the font has no 'u'", str(context.exception))

    def test_set_glyph(self):
        self._fonts({"HELVETICA 4L": DRAW_GLYPHS})
        font = self._open("helvetica4l")
        order = font.getGlyphOrder()
        glyph, advance = G.draw_glyph(font, M.load_f3s("Helvetica 4L"), "ũ")

        self.assertEqual(G.set_glyph(font, "ũ", glyph, advance), "utilde")
        self.assertEqual(font.getGlyphOrder(), order + ["utilde"])
        self.assertEqual(font["hmtx"]["utilde"], (560, 70))
        for table in font["cmap"].tables:
            self.assertEqual(
                table.cmap.get(ord("ũ")), "utilde" if table.isUnicode() else None
            )

        # a character of the Mac Roman encoding is also mapped there and
        # one without a name in the glyph list is named after its code
        self.assertEqual(G.set_glyph(font, "ü", glyph, advance), "udieresis")
        self.assertEqual(G.set_glyph(font, "ļ", glyph, advance), "uni013C")
        for table in font["cmap"].tables:
            self.assertEqual(
                table.cmap[0xFC if table.isUnicode() else 0x9F], "udieresis"
            )
            self.assertEqual(
                table.cmap.get(ord("ļ")), "uni013C" if table.isUnicode() else None
            )
        self.assertEqual(
            font.getGlyphOrder(), order + ["utilde", "udieresis", "uni013C"]
        )

        # a character map of another encoding is left as it is
        tables = font["cmap"].tables
        legacy = CmapSubtable.newSubtable(6)
        legacy.platformID, legacy.platEncID, legacy.language = 1, 1, 0
        legacy.cmap = {0x41: "A"}
        tables.append(legacy)
        self.assertEqual(G.set_glyph(font, "ũ", glyph, advance), "utilde")
        self.assertEqual(legacy.cmap, {0x41: "A"})
        tables.remove(legacy)

        # the glyph of a character of the font is replaced under its name
        self.assertEqual(G.set_glyph(font, "H", glyph, 700), "H")
        self.assertEqual(font["hmtx"]["H"], (700, 70))
        self.assertEqual(len(font.getGlyphOrder()), len(order) + 3)

        # and so is a glyph that the font holds under the name of the
        # character without mapping it, instead of being added twice
        for table in font["cmap"].tables:
            table.cmap.pop(ord("Ç"), None)
            table.cmap.pop(0x82, None)
        self.assertEqual(G.set_glyph(font, "Ç", glyph, advance), "Ccedilla")
        self.assertEqual(font.getGlyphOrder().count("Ccedilla"), 1)
        self.assertEqual(len(font.getGlyphOrder()), len(order) + 3)
        for table in font["cmap"].tables:
            self.assertEqual(
                table.cmap[0xC7 if table.isUnicode() else 0x82], "Ccedilla"
            )

        # the font is saved and read back with its new glyphs
        font = self._reload(font)
        self.assertEqual(font["maxp"].numGlyphs, len(order) + 3)
        self.assertEqual(font.getGlyphOrder()[-3:], ["utilde", "udieresis", "uni013C"])
        for char in "ũüļHÇ":
            self._assert_box(self._bounds(font, char), (70, -11, 637.5, 917.5))
        self.assertEqual(self._advance(font, "ũ"), (560, 70))
        self.assertEqual(self._bounds(font, "u"), (70, -11, 490, 474))

    def test_glyphs_font(self):
        manifest = M.load_manifest(self._glyphs_manifest())
        path = os.path.join(G.FONTS_DIR, "helvetica4l.ttf")
        with open(path, "rb") as file:
            data = file.read()
        regular = TTFont(path)

        font = self._reload(G.glyphs_font(manifest[0]))
        self.assertEqual(
            font.getGlyphOrder(), regular.getGlyphOrder() + ["uni013C", "utilde"]
        )
        self.assertNotIn("DSIG", font)
        self.assertEqual(font["head"].modified, regular["head"].modified)

        # one glyph has the tilde of the ã and the other its F3S accent
        self._assert_box(self._bounds(font, "ũ"), (70, -11, 635.5, 911))
        self._assert_box(self._bounds(font, "ļ"), (26.5, -147.5, 138, 700))
        self.assertEqual(self._advance(font, "ũ"), (560, 70))
        self.assertEqual(self._advance(font, "ļ"), (208, self._bounds(font, "ļ")[0]))

        # every other glyph is the one of the regular font, which is
        # not written
        for name in regular.getGlyphOrder():
            self.assertEqual(font["glyf"][name], regular["glyf"][name])
            self.assertEqual(font["hmtx"][name], regular["hmtx"][name])
        with open(path, "rb") as file:
            self.assertEqual(file.read(), data)

        # an entry with no glyphs gives its regular font back
        font = self._reload(G.glyphs_font(manifest[1]))
        regular = TTFont(os.path.join(G.FONTS_DIR, "roman4l.ttf"))
        self.assertEqual(font.getGlyphOrder(), regular.getGlyphOrder())
        self.assertNotIn("DSIG", font)

        # a font that carries a signature, as the regular fonts did
        # before their letters were drawn, loses it with the edit
        signed = G.open_font(path)
        signed["DSIG"] = newTable("DSIG")
        with mock.patch.object(G, "open_font", return_value=signed) as open_font:
            font = G.glyphs_font(manifest[0])
        self.assertIs(font, signed)
        self.assertEqual(open_font.call_args_list, [mock.call(path)])
        self.assertNotIn("DSIG", font)
        self.assertIn(ord("ũ"), font.getBestCmap())

    def test_glyphs_font_again(self):
        manifest = M.load_manifest(self._glyphs_manifest())
        path = os.path.join(G.FONTS_DIR, "helvetica4l.ttf")
        G.glyphs_font(manifest[0]).save(path)
        with open(path, "rb") as file:
            data = file.read()

        # drawing the glyphs of a font that has them already gives the
        # same font, so a font can be drawn again and compared
        font = G.glyphs_font(manifest[0])
        self.assertEqual(G.different_glyphs(font, TTFont(path), "ļũ"), [])
        buffer = io.BytesIO()
        font.save(buffer)
        self.assertEqual(buffer.getvalue(), data)

    def test_glyphs_font_changed(self):
        manifest = M.load_manifest(self._glyphs_manifest())
        with self.assertRaises(RuntimeError) as context:
            G.glyphs_font(dict(manifest[0], f3s_sha256="0" * 64))
        self.assertIn("measure it again", str(context.exception))

    def test_different_glyphs(self):
        manifest = M.load_manifest(self._glyphs_manifest())
        font = self._reload(G.glyphs_font(manifest[0]))
        other = self._reload(G.glyphs_font(manifest[0]))
        regular = TTFont(os.path.join(G.FONTS_DIR, "helvetica4l.ttf"))
        self.assertEqual(G.different_glyphs(font, other, "ļũH"), [])
        self.assertEqual(G.different_glyphs(font, other, ""), [])

        # a glyph with no outline, like the space, has only its advance
        self.assertEqual(G.different_glyphs(font, other, " "), [])
        other["hmtx"]["space"] = (other["hmtx"]["space"][0] + 1, 0)
        self.assertEqual(G.different_glyphs(font, other, " ļ"), [" "])

        # a character that one of the fonts lacks is different
        self.assertEqual(G.different_glyphs(font, regular, "ļũH"), ["ļ", "ũ"])
        self.assertEqual(G.different_glyphs(regular, font, "ũ"), ["ũ"])

        # a coordinate may differ by a unit, the outlines coming from
        # floating point operations, and no more than that
        coordinates = other["glyf"]["utilde"].coordinates
        x, y = coordinates[0]
        coordinates[0] = (x + 1, y - 1)
        self.assertEqual(G.different_glyphs(font, other, "ļũ"), [])
        self.assertEqual(G.different_glyphs(font, other, "ļũ", tolerance=0), ["ũ"])
        coordinates[0] = (x + 2, y)
        self.assertEqual(G.different_glyphs(font, other, "ļũ"), ["ũ"])
        coordinates[0] = (x, y)

        # the advance and the contours must be the same
        other["hmtx"]["utilde"] = (561, 70)
        self.assertEqual(G.different_glyphs(font, other, "ļũ"), ["ũ"])
        other["hmtx"]["utilde"] = (560, 70)
        other["glyf"]["uni013C"] = other["glyf"]["l"]
        self.assertEqual(G.different_glyphs(font, other, "ļũ"), ["ļ"])
        other["glyf"]["uni013C"] = other["glyf"]["utilde"]
        self.assertEqual(G.different_glyphs(font, other, "ļũ"), ["ļ"])

        # a glyph built from another one is compared by what it draws,
        # where it puts the other glyph and which glyph that is
        self._composite(font, "I", "H", 50)
        self._composite(other, "I", "H", 50)
        self.assertEqual(G.different_glyphs(font, other, "I"), [])
        self._composite(other, "I", "H", 51)
        self.assertEqual(G.different_glyphs(font, other, "I"), [])
        self._composite(other, "I", "H", 60)
        self.assertEqual(G.different_glyphs(font, other, "I"), ["I"])
        self._composite(other, "I", "A", 50)
        self.assertEqual(G.different_glyphs(font, other, "I"), ["I"])

    def test_emoji_targets(self):
        self._fonts(dict())
        font = self._open("coolemojis")

        # the marker point of the family emoji is left out of its box
        target = G.emoji_targets(font, FAMILY)
        self.assertEqual(target["left"], 0.0)
        self.assertEqual(target["bottom"], 0.0)
        self.assertAlmostEqual(target["width"], 424.0735, delta=1e-4)
        self.assertAlmostEqual(target["height"], 616.7463, delta=1e-4)
        self.assertAlmostEqual(target["advance"], 424.0735, delta=1e-4)

        target = G.emoji_targets(font, INFINITY)
        self.assertAlmostEqual(target["left"], 28.0, delta=1e-9)
        self.assertAlmostEqual(target["bottom"], 70.0, delta=1e-9)
        self.assertAlmostEqual(target["width"], 1120.0, delta=1e-9)
        self.assertAlmostEqual(target["height"], 560.0, delta=1e-9)
        self.assertAlmostEqual(target["advance"], 1204.0, delta=1e-9)

    def test_tune_emoji(self):
        _path, mapping = self._emoji_fonts()
        font = self._open("coolemojis")
        font["hmtx"]["space"] = (500, 0)
        font["DSIG"] = newTable("DSIG")

        result = G.tune_emoji(font, mapping)
        self.assertEqual(result, dict(changed=["C", "E"], decomposed=[]))

        # scaled from its bottom left to the F3S ink height, put on the
        # F3S ink bottom and centred on the F3S ink centre (588)
        self.assertEqual(self._bounds(font, "C"), (-23, 70, 1199, 630))
        self.assertEqual(self._advance(font, "C"), (1204, -23))
        self.assertEqual(self._bounds(font, "E"), (113, 0, 1014, 560))
        self.assertEqual(self._advance(font, "E"), (1126, 113))

        # the family emoji is within the tolerance and stays untouched
        self.assertEqual(self._bounds(font, "!"), (0, 0, 424, 617))
        self.assertEqual(self._advance(font, "!"), (424, 0))

        # the space advances like the Helvetica 4L one
        self.assertEqual(self._advance(font, " "), (601, 0))
        self.assertNotIn("DSIG", font)

    def test_tune_emoji_chars(self):
        _path, mapping = self._emoji_fonts()
        font = self._open("coolemojis")

        # only the provided characters, even the ones within tolerance
        result = G.tune_emoji(font, mapping, chars="!E")
        self.assertEqual(result["changed"], ["!", "E"])
        self.assertEqual(self._bounds(font, "!"), (0, 0, 424, 617))
        self.assertEqual(self._bounds(font, "E"), (113, 0, 1014, 560))
        self.assertEqual(self._bounds(font, "C"), (0, 0, 1528, 700))
        self.assertEqual(self._advance(font, "C"), (1528, 0))

        # a tolerance wider than every deviation refits nothing
        font = self._open("coolemojis")
        result = G.tune_emoji(font, mapping, tolerance=1.0)
        self.assertEqual(result["changed"], [])

    def test_tune_emoji_skipped(self):
        _path, mapping = self._emoji_fonts()
        font = self._open("coolemojis")
        font["glyf"]["exclam"] = TTGlyphPen(None).glyph()

        # the W has no F3S glyph, the ç no TTF glyph and the ! no outline
        result = G.tune_emoji(font, mapping, chars="!Wç")
        self.assertEqual(result["changed"], [])
        self.assertEqual(self._bounds(font, "W"), (0, 0, 970, 700))
        self.assertEqual(self._advance(font, "W"), (970, 0))
        self.assertEqual(self._advance(font, "!"), (424, 0))

    def test_check(self):
        self._fonts({"HELVETICA 4L": TEXT_GLYPHS})
        f3s = M.load_f3s("Helvetica 4L")
        font = self._open("helvetica4l")
        G.tune_text(font, f3s, adjust=ADJUST)

        report = G.check(font, f3s=f3s, adjust=ADJUST)
        self.assertEqual(report["passed"], True)
        self.assertEqual(report["glyphs"], 4)
        self.assertEqual(report["tolerance"], 0.015)
        self.assertEqual(report["units_per_size"], 700.0)
        self.assertEqual(
            report["worst"],
            dict(
                advance_dev=0.0007,
                centre_dev=0.0006,
                height_dev=0.0737,
                bottom_dev=0.1309,
            ),
        )
        self.assertEqual(report["spacing_off"], [])
        self.assertEqual(report["missing_in_ttf"], ["Ł"])
        self.assertEqual(
            report["vertical"],
            dict(
                ascent=934,
                descent=-234,
                cap=700,
                centred=True,
                use_typo=True,
                hhea_matches=True,
            ),
        )
        self.assertEqual(report["has_dsig"], False)

        # the outline of the @ is thicker and lower than its F3S centre
        # lines, which only informs for a text font
        self.assertEqual(report["size_off"], ["@"])

        # every printable TTF character but the three of the F3S
        missing = report["missing_in_f3s"]
        self.assertEqual(len(missing), 124)
        self.assertIn("A", missing)
        for char in ("@", "H", "I", " ", "\r"):
            self.assertNotIn(char, missing)

        rows = dict((row["char"], row) for row in report["rows"])
        self.assertEqual(
            rows["@"],
            dict(
                char="@",
                glyph="at",
                advance=577,
                advance_model=576.5,
                advance_dev=0.5,
                centre_dev=-0.3,
                height_dev=51.6,
                bottom_dev=91.6,
                spacing_ok=True,
                size_ok=False,
            ),
        )
        self.assertEqual(
            rows[" "],
            dict(
                char=" ",
                glyph="space",
                advance=601,
                advance_model=600.6,
                advance_dev=0.4,
                spacing_ok=True,
                size_ok=True,
            ),
        )

    def test_check_off(self):
        self._fonts({"HELVETICA 4L": TEXT_GLYPHS})
        f3s = M.load_f3s("Helvetica 4L")
        font = self._open("helvetica4l")
        font["DSIG"] = newTable("DSIG")

        report = G.check(font, f3s=f3s)
        self.assertEqual(report["passed"], False)
        self.assertEqual(report["spacing_off"], [" ", "@", "H", "I"])
        self.assertEqual(report["has_dsig"], True)
        self.assertEqual(report["vertical"]["centred"], False)
        rows = dict((row["char"], row) for row in report["rows"])
        self.assertEqual(rows["H"]["advance_dev"], -38.8)
        self.assertEqual(rows["H"]["centre_dev"], -19.4)

        # the line box is not centred on the capitals, so even a loose
        # tolerance does not pass the regular font
        report = G.check(font, f3s=f3s, tolerance=1.0)
        self.assertEqual(report["spacing_off"], [])
        self.assertEqual(report["passed"], False)

    def test_check_tolerance(self):
        self._fonts({"HELVETICA 4L": TEXT_GLYPHS})
        f3s = M.load_f3s("Helvetica 4L")
        font = self._open("helvetica4l")
        G.tune_text(font, f3s, adjust=ADJUST)
        font["hmtx"]["H"] = (739, 89)

        # 8.2 units off, within 1.5% (10.5 units) but not within 1%
        report = G.check(font, f3s=f3s, adjust=ADJUST)
        self.assertEqual(report["passed"], True)
        report = G.check(font, f3s=f3s, adjust=ADJUST, tolerance=0.01)
        self.assertEqual(report["passed"], False)
        self.assertEqual(report["spacing_off"], ["H"])
        self.assertEqual(report["worst"]["advance_dev"], 0.0117)

    def test_check_adjust(self):
        self._fonts({"HELVETICA 4L": TEXT_GLYPHS})
        f3s = M.load_f3s("Helvetica 4L")
        font = self._open("helvetica4l")
        G.tune_text(font, f3s, adjust=ADJUST)

        # the corrected @ is off the bare model by the correction
        report = G.check(font, f3s=f3s)
        self.assertEqual(report["passed"], False)
        self.assertEqual(report["spacing_off"], ["@"])
        rows = dict((row["char"], row) for row in report["rows"])
        self.assertEqual(rows["@"]["advance_dev"], -60.5)
        self.assertEqual(rows["@"]["centre_dev"], -43.3)

    def test_check_emoji(self):
        _path, mapping = self._emoji_fonts()
        font = self._open("coolemojis")

        report = G.check(font, mapping=mapping)
        self.assertEqual(report["passed"], False)
        self.assertEqual(report["glyphs"], 4)
        self.assertEqual(report["vertical"], None)
        self.assertEqual(report["spacing_off"], ["C"])
        self.assertEqual(report["missing_in_ttf"], ["ç"])
        self.assertEqual(report["missing_in_f3s"], ["W"])

        # the size decides for the emojis, the E is spaced right but
        # drawn taller than its F3S glyph
        self.assertEqual(report["size_off"], ["C", "E"])
        rows = dict((row["char"], row) for row in report["rows"])
        self.assertEqual(rows["E"]["advance_dev"], 0.0)
        self.assertEqual(rows["E"]["height_dev"], 140.0)
        self.assertEqual(rows["C"]["advance_dev"], 324.0)
        self.assertEqual(rows["C"]["centre_dev"], 176.0)
        self.assertEqual(rows["!"]["height_dev"], 0.3)

        G.tune_emoji(font, mapping)
        report = G.check(font, mapping=mapping)
        self.assertEqual(report["passed"], True)
        self.assertEqual(report["spacing_off"], [])
        self.assertEqual(report["size_off"], [])

    def test_print_check(self):
        self._fonts({"HELVETICA 4L": TEXT_GLYPHS})
        f3s = M.load_f3s("Helvetica 4L")
        font = self._open("helvetica4l")
        G.tune_text(font, f3s, adjust=ADJUST)
        report = G.check(font, f3s=f3s, adjust=ADJUST)

        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            G.print_check("tuned.ttf", report)
        lines = stdout.getvalue().splitlines()
        self.assertEqual(lines[0], "tuned.ttf: PASS")
        self.assertEqual(
            lines[1],
            "  4 glyphs, worst deviation in % of the font size: advance 0.07, centre 0.06, height 7.37, bottom 13.09",
        )
        self.assertEqual(
            lines[2],
            "  1 glyphs differ in ink height or bottom by more than 10.5 units (outline thickness and drawing differences, informational for text fonts)",
        )
        self.assertEqual(
            lines[3],
            "  in the F3S but missing in the TTF (previewed with a fallback font): Ł",
        )
        self.assertTrue(
            lines[4].startswith("  in the TTF but missing in the F3S (not engraved): !")
        )
        self.assertEqual(
            lines[5],
            "  vertical metrics: {'ascent': 934, 'descent': -234, 'cap': 700, 'centred': True, 'use_typo': True, 'hhea_matches': True}",
        )
        self.assertEqual(len(lines), 6)

    def test_print_check_off(self):
        self._fonts({"HELVETICA 4L": TEXT_GLYPHS})
        f3s = M.load_f3s("Helvetica 4L")
        font = self._open("helvetica4l")
        font["DSIG"] = newTable("DSIG")
        report = G.check(font, f3s=f3s)

        # the glyphs off are listed worst first, up to the limit
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            G.print_check("regular.ttf", report, limit=2)
        lines = stdout.getvalue().splitlines()
        self.assertEqual(lines[0], "regular.ttf: FAIL")
        self.assertEqual(
            lines[1],
            "  4 glyphs, worst deviation in % of the font size: advance 14.37, centre 5.39, height 7.37, bottom 13.09",
        )
        self.assertEqual(lines[2], "  4 glyphs off in spacing (over 10.5 units):")
        self.assertEqual(lines[3], "    ' ' space          advance_dev -100.6")
        self.assertEqual(
            lines[4], "    '@' at             advance_dev +77.5 centre_dev +37.7"
        )
        self.assertTrue(lines[5].startswith("  1 glyphs differ in ink height"))
        self.assertEqual(
            lines[-1], "  DSIG table present (invalid once the font is edited)"
        )

    def test_print_check_emoji(self):
        _path, mapping = self._emoji_fonts()
        report = G.check(self._open("coolemojis"), mapping=mapping)

        # the size deviations of the emojis are listed like the spacing
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            G.print_check("coolemojis.ttf", report)
        lines = stdout.getvalue().splitlines()
        self.assertEqual(
            lines,
            [
                "coolemojis.ttf: FAIL",
                "  4 glyphs, worst deviation in % of the font size: advance 46.29, centre 25.14, height 20.00, bottom 10.00",
                "  1 glyphs off in spacing (over 10.5 units):",
                "    'C' C              advance_dev +324.0 centre_dev +176.0",
                "  2 glyphs off in size (over 10.5 units):",
                "    'C' C              height_dev +140.0 bottom_dev -70.0",
                "    'E' E              height_dev +140.0 bottom_dev +0.0",
                "  in the F3S but missing in the TTF (previewed with a fallback font): ç",
                "  in the TTF but missing in the F3S (not engraved): W",
            ],
        )

    def test_run_build(self):
        manifest = self._manifest()
        helvetica = os.path.join(G.FONTS_DIR, "helvetica4l-f3s.ttf")
        roman = os.path.join(G.FONTS_DIR, "roman4l-f3s.ttf")

        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            G.run_build(
                argparse.Namespace(manifest=manifest, output=None, verify=False)
            )
        with open(helvetica, "rb") as file:
            data = file.read()
        self.assertEqual(data, G.build_font(M.load_manifest(manifest)[0]))
        self.assertEqual(
            stdout.getvalue().splitlines(),
            [
                "%s: %d bytes" % (helvetica, len(data)),
                "%s: %d bytes" % (roman, os.path.getsize(roman)),
            ],
        )

        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            G.run_build(argparse.Namespace(manifest=manifest, output=None, verify=True))
        self.assertEqual(
            stdout.getvalue().splitlines(),
            ["%s: identical" % helvetica, "%s: identical" % roman],
        )

        # a font that is not the build is reported and fails the run,
        # the other fonts still being compared
        with open(helvetica, "wb") as file:
            file.write(data[:-1])
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            with self.assertRaises(SystemExit) as context:
                G.run_build(
                    argparse.Namespace(manifest=manifest, output=None, verify=True)
                )
        self.assertEqual(context.exception.code, 1)
        self.assertEqual(
            stdout.getvalue().splitlines(),
            ["%s: DIFFERENT" % helvetica, "%s: identical" % roman],
        )

    def test_run_build_missing(self):
        manifest = self._manifest()
        output = os.path.join(self.temp_dir, "output")
        os.makedirs(output)

        # a font of the manifest that was never built is a difference
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            with self.assertRaises(SystemExit) as context:
                G.run_build(
                    argparse.Namespace(manifest=manifest, output=output, verify=True)
                )
        self.assertEqual(context.exception.code, 1)
        self.assertEqual(
            stdout.getvalue().splitlines(),
            [
                "%s: DIFFERENT" % os.path.join(output, "helvetica4l-f3s.ttf"),
                "%s: DIFFERENT" % os.path.join(output, "roman4l-f3s.ttf"),
            ],
        )
        self.assertEqual(os.listdir(output), [])

    def test_run_glyphs(self):
        manifest = self._glyphs_manifest()
        path = os.path.join(G.FONTS_DIR, "helvetica4l.ttf")
        roman = os.path.join(G.FONTS_DIR, "roman4l.ttf")
        with open(roman, "rb") as file:
            data = file.read()

        # only the fonts with glyphs to draw are written
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            G.run_glyphs(
                argparse.Namespace(manifest=manifest, output=None, verify=False)
            )
        self.assertEqual(stdout.getvalue().splitlines(), ["%s: drew ļũ" % path])
        font = TTFont(path)
        self.assertEqual(font.getGlyphOrder()[-2:], ["uni013C", "utilde"])
        with open(roman, "rb") as file:
            self.assertEqual(file.read(), data)

        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            G.run_glyphs(
                argparse.Namespace(manifest=manifest, output=None, verify=True)
            )
        self.assertEqual(stdout.getvalue().splitlines(), ["%s: the same ļũ" % path])

        # a glyph that is not the drawn one is reported and fails the run
        font["glyf"]["utilde"] = font["glyf"]["u"]
        font.save(path)
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            with self.assertRaises(SystemExit) as context:
                G.run_glyphs(
                    argparse.Namespace(manifest=manifest, output=None, verify=True)
                )
        self.assertEqual(context.exception.code, 1)
        self.assertEqual(stdout.getvalue().splitlines(), ["%s: DIFFERENT ũ" % path])

    def test_run_glyphs_missing(self):
        manifest = self._glyphs_manifest()
        output = os.path.join(self.temp_dir, "output")
        os.makedirs(output)

        # a font of the manifest that was never drawn is a difference
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            with self.assertRaises(SystemExit) as context:
                G.run_glyphs(
                    argparse.Namespace(manifest=manifest, output=output, verify=True)
                )
        self.assertEqual(context.exception.code, 1)
        self.assertEqual(
            stdout.getvalue().splitlines(),
            ["%s: DIFFERENT ļũ" % os.path.join(output, "helvetica4l.ttf")],
        )
        self.assertEqual(os.listdir(output), [])

    def test_main_build(self):
        M.MANIFEST_PATH = self._manifest()
        output = os.path.join(self.temp_dir, "output")
        os.makedirs(output)

        code, stdout, _stderr = self._main("build", "--output", output)
        self.assertEqual(code, None)
        self.assertEqual(
            sorted(os.listdir(output)), ["helvetica4l-f3s.ttf", "roman4l-f3s.ttf"]
        )
        self.assertEqual(stdout.count(" bytes\n"), 2)
        self.assertEqual(
            sorted(os.listdir(G.FONTS_DIR)), ["helvetica4l.ttf", "roman4l.ttf"]
        )

        code, stdout, _stderr = self._main("build", "--output", output, "--verify")
        self.assertEqual(code, None)
        self.assertEqual(stdout.count(": identical"), 2)

        # the fonts of another manifest are not the build of this one
        manifest = self._write(
            "other.json",
            json.dumps([dict(M.load_manifest()[0], adjust=dict())]),
        )
        code, stdout, _stderr = self._main(
            "build", "--manifest", manifest, "--output", output, "--verify"
        )
        self.assertEqual(code, 1)
        self.assertEqual(
            stdout, "%s: DIFFERENT\n" % os.path.join(output, "helvetica4l-f3s.ttf")
        )

    def test_main_text(self):
        self._fonts({"HELVETICA 4L": TEXT_GLYPHS})
        ttf = self._ttf("helvetica4l")
        adjust = self._write("adjust.json", json.dumps(ADJUST))
        output = os.path.join(self.temp_dir, "tuned.ttf")

        args = ("--ttf", ttf, "--f3s", "Helvetica 4L", "--output", output)
        code, stdout, _stderr = self._main("text", *args, "--adjust", adjust)
        self.assertEqual(code, None)
        self.assertEqual(
            stdout,
            "%s: 4 glyphs respaced, scale 1, ascent/descent/cap (934, -234, 700), decomposed 0\n"
            % output,
        )
        font = TTFont(output)
        self.assertEqual(self._advance(font, "@"), (577, -13))
        self.assertEqual(self._advance(font, "H"), (731, 89))

        # the regular TTF is left as it was
        self.assertEqual(self._advance(TTFont(ttf), "H"), (692, 70))

    def test_main_text_scale(self):
        self._fonts({"SMALL 4L": {"32": SPACE, "72": SMALL_H}})
        ttf = self._ttf("helvetica4l")
        output = os.path.join(self.temp_dir, "tuned.ttf")

        args = ("--ttf", ttf, "--f3s", "Small 4L", "--output", output)
        code, stdout, _stderr = self._main("text", *args, "--scale", "auto")
        self.assertEqual(code, None)
        self.assertEqual(
            stdout,
            "%s: 2 glyphs respaced, scale 0.9, ascent/descent/cap (900, -270, 630), decomposed 0\n"
            % output,
        )
        font = TTFont(output)
        self.assertEqual(self._bounds(font, "H"), (117, 0, 614, 630))
        self.assertNotIn("fpgm", font)

        code, stdout, _stderr = self._main("text", *args, "--scale", "0.5")
        self.assertEqual(code, None)
        self.assertIn("scale 0.5,", stdout)
        self.assertEqual(self._bounds(TTFont(output), "H")[3], 350)

    def test_main_emoji(self):
        mapping, _mapping = self._emoji_fonts()
        ttf = self._ttf("coolemojis")
        output = os.path.join(self.temp_dir, "coolemojis.ttf")

        args = ("--ttf", ttf, "--mapping", mapping, "--output", output)
        code, stdout, _stderr = self._main("emoji", *args)
        self.assertEqual(code, None)
        self.assertEqual(stdout, "%s: refitted CE\n" % output)
        self.assertEqual(self._bounds(TTFont(output), "C"), (-23, 70, 1199, 630))

        code, stdout, _stderr = self._main("emoji", *args, "--chars", "W")
        self.assertEqual(code, None)
        self.assertEqual(stdout, "%s: refitted nothing\n" % output)
        self.assertEqual(self._bounds(TTFont(output), "C"), (0, 0, 1528, 700))

    def test_main_check(self):
        self._fonts({"HELVETICA 4L": TEXT_GLYPHS})
        font = self._open("helvetica4l")
        G.tune_text(font, M.load_f3s("Helvetica 4L"), adjust=ADJUST)
        tuned = os.path.join(self.temp_dir, "tuned.ttf")
        font.save(tuned)
        adjust = self._write("adjust.json", json.dumps(ADJUST))
        report = os.path.join(self.temp_dir, "report.json")

        args = ("--ttf", tuned, "--f3s", "Helvetica 4L")
        code, stdout, _stderr = self._main(
            "check", *args, "--adjust", adjust, "--json", report
        )
        self.assertEqual(code, 0)
        self.assertEqual(stdout.splitlines()[0], "%s: PASS" % tuned)
        with open(report, encoding="utf-8") as file:
            data = json.load(file)
        self.assertEqual(data["passed"], True)
        self.assertEqual(data["ttf"], tuned)
        self.assertEqual(data["f3s"], M.find_f3s("Helvetica 4L"))
        self.assertEqual(data["adjust"], ADJUST)
        self.assertEqual(data["missing_in_ttf"], ["Ł"])
        self.assertEqual(len(data["rows"]), 4)

        # without the corrections the @ is off and the check fails
        code, stdout, _stderr = self._main("check", *args)
        self.assertEqual(code, 1)
        self.assertEqual(stdout.splitlines()[0], "%s: FAIL" % tuned)
        self.assertIn("    '@' at ", stdout)

        code, stdout, _stderr = self._main(
            "check", *args, "--adjust", adjust, "--tolerance", "0.0001"
        )
        self.assertEqual(code, 1)
        self.assertEqual(stdout.splitlines()[0], "%s: FAIL" % tuned)

    def test_main_check_emoji(self):
        mapping, _mapping = self._emoji_fonts()
        ttf = self._ttf("coolemojis")
        report = os.path.join(self.temp_dir, "report.json")

        code, stdout, _stderr = self._main(
            "check", "--ttf", ttf, "--emoji", "--mapping", mapping, "--json", report
        )
        self.assertEqual(code, 1)
        self.assertEqual(stdout.splitlines()[0], "%s: FAIL" % ttf)
        with open(report, encoding="utf-8") as file:
            data = json.load(file)
        self.assertEqual(data["f3s"], "Cool Emojis mapping")
        self.assertEqual(data["size_off"], ["C", "E"])
        self.assertEqual(data["missing_in_ttf"], ["ç"])

    def test_main_check_missing(self):
        ttf = self._ttf("helvetica4l")

        code, stdout, stderr = self._main("check", "--ttf", ttf)
        self.assertEqual(code, 2)
        self.assertEqual(stdout, "")
        self.assertIn("check needs --f3s or --emoji", stderr)

        # a mode is required
        code, _stdout, stderr = self._main()
        self.assertEqual(code, 2)
        self.assertIn("required: mode", stderr)

    def test_main_glyphs(self):
        M.MANIFEST_PATH = self._glyphs_manifest()
        output = os.path.join(self.temp_dir, "output")
        os.makedirs(output)
        path = os.path.join(output, "helvetica4l.ttf")

        code, stdout, _stderr = self._main("glyphs", "--output", output)
        self.assertEqual(code, None)
        self.assertEqual(stdout, "%s: drew ļũ\n" % path)
        self.assertEqual(os.listdir(output), ["helvetica4l.ttf"])
        self.assertNotIn(
            ord("ũ"),
            TTFont(os.path.join(G.FONTS_DIR, "helvetica4l.ttf")).getBestCmap(),
        )

        code, stdout, _stderr = self._main("glyphs", "--output", output, "--verify")
        self.assertEqual(code, None)
        self.assertEqual(stdout, "%s: the same ļũ\n" % path)

        # the regular fonts were not drawn, so they are not the manifest
        code, stdout, _stderr = self._main(
            "glyphs", "--manifest", M.MANIFEST_PATH, "--verify"
        )
        self.assertEqual(code, 1)
        self.assertEqual(
            stdout,
            "%s: DIFFERENT ļũ\n" % os.path.join(G.FONTS_DIR, "helvetica4l.ttf"),
        )
