#!/usr/bin/env python3

import io
import os
import sys
import shutil
import tempfile
import unittest

from unittest import mock

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SCRIPTS_DIR = os.path.join(ROOT_DIR, "scripts")
sys.path.insert(0, SCRIPTS_DIR)

import font_metrics

# the fill colors of the overshoot and of the left side bearing zones
OVERSHOOT = (255, 204, 204)
BEARING = (255, 243, 176)


class FontMetricsTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self._default_output = font_metrics.DEFAULT_OUTPUT
        self._text = ImageDraw.ImageDraw.text

    def tearDown(self):
        font_metrics.DEFAULT_OUTPUT = self._default_output
        shutil.rmtree(self.temp_dir)

    def _polygon(self, points):
        pen = TTGlyphPen(None)
        pen.moveTo(points[0])
        for point in points[1:]:
            pen.lineTo(point)
        pen.closePath()
        return pen.glyph()

    def _font(self):
        """
        Builds a TTF of 1000 units per em with a space, an A that draws
        past its advance from a negative bearing, a B with a positive
        bearing and an Á composed of the A and an acute accent.
        """

        glyphs = {
            ".notdef": self._polygon([(50, 0), (50, 700), (450, 700), (450, 0)]),
            "space": TTGlyphPen(None).glyph(),
            "A": self._polygon([(-30, 0), (300, 700), (630, 0)]),
            "B": self._polygon([(40, 0), (40, 700), (500, 700), (500, 0)]),
            "acute": self._polygon([(200, 750), (300, 900), (350, 750)]),
        }
        pen = TTGlyphPen(glyphs)
        pen.addComponent("A", (1, 0, 0, 1, 0, 0))
        pen.addComponent("acute", (1, 0, 0, 1, 100, 0))
        glyphs["Aacute"] = pen.glyph()

        builder = FontBuilder(1000, isTTF=True)
        builder.setupGlyphOrder(list(glyphs))
        builder.setupCharacterMap({32: "space", 65: "A", 66: "B", 193: "Aacute"})
        builder.setupGlyf(glyphs)
        builder.setupHorizontalMetrics(
            {
                ".notdef": (500, 50),
                "space": (250, 0),
                "A": (600, -30),
                "B": (560, 40),
                "acute": (300, 200),
                "Aacute": (600, -30),
            }
        )
        builder.setupHorizontalHeader(ascent=800, descent=-200)
        builder.setupNameTable(dict(familyName="Metrics", styleName="Regular"))
        builder.setupOS2()
        builder.setupPost()
        path = os.path.join(self.temp_dir, "metrics.ttf")
        builder.save(path)
        return path

    def _size(self, path):
        with Image.open(path) as image:
            return image.size

    def _colors(self, path):
        # leaves out the legend at the bottom, that shows every color
        with Image.open(path) as image:
            image = image.convert("RGB")
        image = image.crop((0, 0, image.width, image.height - 35))
        return set(
            color for _count, color in image.getcolors(image.width * image.height)
        )

    def _texts(self, text):
        return [call.args[2] for call in text.call_args_list]

    def test_get_glyph_metrics(self):
        ttfont = TTFont(self._font())

        self.assertEqual(
            font_metrics.get_glyph_metrics(ttfont, "A"),
            dict(char="A", aw=600, lsb=-30, xmin=-30, xmax=630, ymin=0, ymax=700),
        )
        self.assertEqual(
            font_metrics.get_glyph_metrics(ttfont, "B"),
            dict(char="B", aw=560, lsb=40, xmin=40, xmax=500, ymin=0, ymax=700),
        )

    def test_get_glyph_metrics_blank(self):
        ttfont = TTFont(self._font())

        # a glyph without outline spans its advance and the em
        self.assertEqual(
            font_metrics.get_glyph_metrics(ttfont, " "),
            dict(char=" ", aw=250, lsb=0, xmin=0, xmax=250, ymin=0, ymax=1000),
        )

    def test_get_glyph_metrics_composite(self):
        ttfont = TTFont(self._font())

        # a composite glyph has the box of its components
        self.assertEqual(
            font_metrics.get_glyph_metrics(ttfont, "Á"),
            dict(char="Á", aw=600, lsb=-30, xmin=-30, xmax=630, ymin=0, ymax=900),
        )

    def test_get_glyph_metrics_missing(self):
        ttfont = TTFont(self._font())

        # a character out of the font is drawn with the .notdef glyph
        self.assertEqual(
            font_metrics.get_glyph_metrics(ttfont, "€"),
            dict(char="€", aw=500, lsb=50, xmin=50, xmax=450, ymin=0, ymax=700),
        )

    def test_render_metrics(self):
        font = self._font()
        output = os.path.join(self.temp_dir, "metrics.png")

        with mock.patch.object(
            ImageDraw.ImageDraw, "text", autospec=True, side_effect=self._text
        ) as text:
            with mock.patch.object(sys, "stdout", io.StringIO()) as stdout:
                font_metrics.render_metrics(font, "AB Á", 100, output)

        # 2010 units of advance at 0.1 px per unit plus the margins
        self.assertEqual(self._size(output), (281, 300))
        self.assertEqual(
            stdout.getvalue().splitlines(),
            ["Saved metrics image: %s" % output, "Size: 281x300, 4 glyphs"],
        )
        self.assertEqual(
            self._texts(text),
            [
                "A aw=600 lsb=-30",
                "B aw=560 lsb=40",
                "  aw=250 lsb=0",
                "Á aw=600 lsb=-30",
                "AB Á",
                "LSB (left margin)",
                "Advance width",
                "Glyph bbox",
                "Overshoot",
            ],
        )

    def test_render_metrics_overlays(self):
        font = self._font()
        output = os.path.join(self.temp_dir, "metrics.png")

        # the A draws past its advance from a negative bearing
        with mock.patch.object(sys, "stdout", io.StringIO()):
            font_metrics.render_metrics(font, "A", 400, output)
        colors = self._colors(output)
        self.assertIn(OVERSHOOT, colors)
        self.assertNotIn(BEARING, colors)

        # the B has a left side bearing and stays inside its advance
        with mock.patch.object(sys, "stdout", io.StringIO()):
            font_metrics.render_metrics(font, "B", 400, output)
        colors = self._colors(output)
        self.assertNotIn(OVERSHOOT, colors)
        self.assertIn(BEARING, colors)

    def test_main(self):
        font = self._font()
        output = os.path.join(self.temp_dir, "metrics.png")
        argv = [
            "font_metrics.py",
            "--font",
            font,
            "--text",
            "BA",
            "--size",
            "50",
            "--output",
            output,
        ]

        with mock.patch.object(sys, "argv", argv):
            with mock.patch.object(sys, "stdout", io.StringIO()) as stdout:
                font_metrics.main()
        self.assertEqual(self._size(output), (138, 190))
        self.assertEqual(
            stdout.getvalue().splitlines(),
            ["Saved metrics image: %s" % output, "Size: 138x190, 2 glyphs"],
        )

    def test_main_defaults(self):
        font_metrics.DEFAULT_OUTPUT = os.path.join(self.temp_dir, "default.png")

        # the default text and size with the default Script 4L font
        with mock.patch.object(sys, "argv", ["font_metrics.py"]):
            with mock.patch.object(sys, "stdout", io.StringIO()) as stdout:
                font_metrics.main()
        ttfont = TTFont(font_metrics.DEFAULT_FONT)
        cmap = ttfont.getBestCmap()
        advance = sum(ttfont["hmtx"][cmap[ord(char)]][0] for char in "Tiago")
        width = int(advance * (120 / ttfont["head"].unitsPerEm)) + 80
        self.assertEqual(self._size(font_metrics.DEFAULT_OUTPUT), (width, 344))
        self.assertEqual(
            stdout.getvalue().splitlines()[1], "Size: %dx344, 5 glyphs" % width
        )
