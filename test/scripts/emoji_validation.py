#!/usr/bin/env python3

import io
import os
import sys
import json
import shutil
import datetime
import tempfile
import unittest

from unittest import mock

from PIL import Image, ImageDraw, ImageFont

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SCRIPTS_DIR = os.path.join(ROOT_DIR, "scripts")
sys.path.insert(0, SCRIPTS_DIR)

import emoji_validation

# arial is only found on Windows, elsewhere the labels are drawn with a
# public TTF of the repository
LABEL_FONT = os.path.join(ROOT_DIR, "static", "fonts", "helvetica1l.ttf")

# the values of the mapping are a name or an object with the name, the
# keys of more than one character are left out
MAPPING = {
    "A": {"name": "2002.estrela", "category": "symbols", "order": 20},
    "B": "1001.coracao",
    "AB": "3001.dupla",
}


class EmojiValidationTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self._mapping_path = emoji_validation.MAPPING_PATH
        self._output_path = emoji_validation.OUTPUT_PATH
        self._glyph_size = emoji_validation.GLYPH_SIZE
        self._truetype = ImageFont.truetype
        self._text = ImageDraw.ImageDraw.text

        emoji_validation.OUTPUT_PATH = os.path.join(self.temp_dir, "validation.png")
        ImageFont.truetype = self._label_truetype

    def tearDown(self):
        emoji_validation.MAPPING_PATH = self._mapping_path
        emoji_validation.OUTPUT_PATH = self._output_path
        emoji_validation.GLYPH_SIZE = self._glyph_size
        ImageFont.truetype = self._truetype
        shutil.rmtree(self.temp_dir)

    def _label_truetype(self, font=None, size=10, *args, **kwargs):
        if font == "arial.ttf":
            font = LABEL_FONT
        return self._truetype(font, size, *args, **kwargs)

    def _mapping(self, mapping):
        path = os.path.join(self.temp_dir, "mapping.json")
        with open(path, "w", encoding="utf-8") as file:
            json.dump(mapping, file)
        emoji_validation.MAPPING_PATH = path

    def _size(self, path):
        with Image.open(path) as image:
            return image.size

    def _main(self):
        """
        Runs the script at a fixed time, returning what it printed and
        the calls that drew text.
        """

        with mock.patch.object(emoji_validation, "datetime") as clock:
            clock.datetime.now.return_value = datetime.datetime(2026, 10, 1, 12, 30)
            with mock.patch.object(
                ImageDraw.ImageDraw, "text", autospec=True, side_effect=self._text
            ) as text:
                with mock.patch.object(sys, "stdout", io.StringIO()) as stdout:
                    emoji_validation.main()
        return stdout.getvalue(), text.call_args_list

    def test_main(self):
        self._mapping(MAPPING)

        output, calls = self._main()
        path = emoji_validation.OUTPUT_PATH
        self.assertEqual(self._size(path), (2180, 600))
        self.assertEqual(
            output.splitlines(),
            ["Saved validation image: %s" % path, "Size: 2180x600, 2 glyphs"],
        )

        # the glyphs are drawn in the order of their F3S font names
        self.assertEqual(
            [call.args[2] for call in calls],
            [
                "Cool Emojis TTF - Glyph to F3S Font Mapping Validation",
                "Font: coolemojis.ttf",
                "Glyphs: 2",
                "Rendered: 2026-10-01 12:30",
                "B",
                "Key: 'B'",
                "1001.coracao",
                "A",
                "Key: 'A'",
                "2002.estrela",
            ],
        )

    def test_main_mapping(self):
        with open(emoji_validation.MAPPING_PATH, encoding="utf-8") as file:
            mapping = json.load(file)
        names = sorted(
            entry["name"] if isinstance(entry, dict) else entry
            for entry in mapping.values()
        )

        # the mapping of the repository, its values mostly objects
        output, calls = self._main()
        self.assertEqual(self._size(emoji_validation.OUTPUT_PATH), (2180, 3960))
        self.assertEqual(output.splitlines()[1], "Size: 2180x3960, 91 glyphs")
        labels = [call.args[2] for call in calls if call.kwargs["fill"] == "#cc3333"]
        self.assertEqual(labels, names)

    def test_main_scaled(self):
        self._mapping(MAPPING)
        emoji_validation.GLYPH_SIZE = 500

        # a glyph larger than its cell is drawn smaller to fit it
        _output, calls = self._main()
        fonts = [call.kwargs["font"] for call in calls if call.args[2] in ("A", "B")]
        self.assertEqual(len(fonts), 2)
        for font, char in zip(fonts, "BA"):
            self.assertLess(font.size, 500)
            box = font.getbbox(char)
            self.assertLessEqual(box[2] - box[0], emoji_validation.CELL_W - 16)
            self.assertLessEqual(box[3] - box[1], emoji_validation.CELL_H - 70)

    def test_main_unmeasured(self):
        self._mapping(MAPPING)

        # a glyph that cannot be measured is left out, its labels kept
        with mock.patch.object(ImageDraw.ImageDraw, "textbbox", side_effect=OSError):
            output, calls = self._main()
        self.assertEqual(
            [call.args[2] for call in calls][4:],
            ["Key: 'B'", "1001.coracao", "Key: 'A'", "2002.estrela"],
        )
        self.assertEqual(output.splitlines()[1], "Size: 2180x600, 2 glyphs")
