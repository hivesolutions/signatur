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
        self.assertEqual(len(outlines), 125)
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
        self.assertIn("DSIG", font)

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
        self.assertEqual(sum(widths) / float(len(widths)), 574.453125)
        self.assertEqual(font["OS/2"].xAvgCharWidth, 574)
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
        self.assertEqual(len(missing), 122)
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
        report = G.check(self._open("helvetica4l"), f3s=f3s)

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
