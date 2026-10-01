#!/usr/bin/env python3

import io
import os
import sys
import json
import shutil
import argparse
import tempfile
import unittest

from unittest import mock

ROOT_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "..")
)
SCRIPTS_DIR = os.path.join(ROOT_DIR, ".agents", "skills", "match-f3s-fonts", "scripts")
sys.path.insert(0, SCRIPTS_DIR)

import f3s_model as M
import cases as C

# a capital advancing 4.3 mm with 4 mm of ink 0.1 mm after the pen at 5 mm
CAP = dict(
    metrics=[5000, 0, -100, 0, 0, 0, 4200, 0, 0, 4000, 5000],
    strokes=[[["on", 0, 0], ["end", 4000, 5000]]],
)

# a capital advancing 5 mm with 4.8 mm of ink at 5 mm
WIDE = dict(
    metrics=[5000, 0, 0, 0, 0, 0, 5000, 0, 0, 4800, 5000],
    strokes=[[["on", 0, 0], ["end", 4800, 5000]]],
)

# a letter whose ink runs 1.5 mm below the baseline at 5 mm
DESCENDER = dict(
    metrics=[5000, 0, -100, 0, 1500, 0, 1800, 0, 0, 1600, 6500],
    strokes=[[["on", 0, 0], ["end", 1600, 6500]]],
)

# a glyph of 20000 units per font size (like the Roman 4L Ł), 5 mm
# wide and rising 1.25 mm above the capitals at 5 mm
TALL = dict(
    metrics=[20000, 0, 0, 0, 0, 0, 20000, 0, 0, 20000, 25000],
    strokes=[[["on", 0, 0], ["end", 20000, 25000]]],
)

SPACE = dict(metrics=[5000, 0, -428, 0, 0, 0, 3862, 0, 0, 3419, 0], strokes=[])

# an emoji 6 mm wide and high advancing 6.5 mm at 6 mm
EMOJI = dict(
    metrics=[6000, 0, 0, 0, 0, 0, 6500, 0, 0, 6000, 6000],
    strokes=[[["on", 0, 0], ["end", 6000, 6000]]],
)

# an emoji 45 mm wide at 6 mm, too wide to share a 60 mm line
EMOJI_WIDE = dict(
    metrics=[6000, 0, 0, 0, 0, 0, 45500, 0, 0, 45000, 6000],
    strokes=[[["on", 0, 0], ["end", 45000, 6000]]],
)

MAPPING = {
    "A": "1101.coracao",
    "B": {"name": "1102.estrela", "category": "symbols", "order": 20},
    "C": "1103.infinito",
    "W": "1406.camara",
    "|": "2105.special",
}

LAYOUT_CSS = """@font-face {
    font-family: "Helvetica 4L";
    src: url(/static/fonts/helvetica4l.ttf);
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


class CasesTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self._gravo_pilot = M.GRAVO_PILOT
        self._parser = M._PARSER
        self._mapping_path = M.MAPPING_PATH
        self._cmaps = C._CMAPS

    def tearDown(self):
        M.GRAVO_PILOT = self._gravo_pilot
        M._PARSER = self._parser
        M.MAPPING_PATH = self._mapping_path
        C._CMAPS = self._cmaps
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
        for name, glyphs in fonts.items():
            self._write(
                os.path.join("src", "gravo_pilot", "res", "fonts", "%s.f3s" % name),
                json.dumps(glyphs),
            )

    def _standard(self):
        """
        Writes the fonts of most tests: an Helvetica 4L with capitals of
        4.3 mm (the W of 5 mm), a descender j, a tall @ and the space, a
        Roman 4L with A and ç and the emojis of the test mapping.
        """

        helvetica = dict((ord(char), CAP) for char in "ABCDEFGHIJKLMNOPQRSTUVXYZç")
        helvetica.update({ord("W"): WIDE, ord("j"): DESCENDER, ord("@"): TALL})
        helvetica[ord(" ")] = SPACE
        self._fonts(
            {
                "HELVETICA 4L": helvetica,
                "ROMAN 4L": {ord("A"): CAP, ord("ç"): CAP},
                "1101.coracao": {ord("a"): EMOJI},
                "1102.estrela": {ord("a"): EMOJI},
                "1103.infinito": {ord("a"): EMOJI},
                "1406.camara": {ord("a"): EMOJI_WIDE},
                "2105.special": {ord("a"): EMOJI},
            }
        )
        M.MAPPING_PATH = self._write("mapping.json", json.dumps(MAPPING))

    def _alphabet(self):
        """
        Writes an Helvetica 4L with the capitals and the ç of 4.3 mm,
        the space and a snowman that the TTF does not have.
        """

        glyphs = dict((ord(char), CAP) for char in "ABCDEFGHIJKLMNOPQRSTUVWXYZç")
        glyphs.update({ord(" "): SPACE, ord("☃"): CAP})
        self._fonts({"HELVETICA 4L": glyphs})

    def _root(self):
        """
        Writes a Signatur checkout whose Helvetica 4L face is a copy of
        the Roman 4L TTF, that has no ç.
        """

        self._write(os.path.join("root", "static", "css", "layout.css"), LAYOUT_CSS)
        path = os.path.join(self.temp_dir, "root", "static", "fonts", "helvetica4l.ttf")
        os.makedirs(os.path.dirname(path))
        shutil.copy(os.path.join(ROOT_DIR, "static", "fonts", "roman4l.ttf"), path)
        return os.path.join(self.temp_dir, "root")

    def _case(self, **kwargs):
        case = dict(
            name="test",
            font="Helvetica 4L",
            font_size=5,
            lines=["AB"],
            width=70,
            height=70,
            margins=[5, 5, 5, 5],
            f3s=True,
        )
        case.update(kwargs)
        return case

    def _args(self, **kwargs):
        args = dict(
            font="Helvetica 4L",
            size=5.0,
            plate="70x70",
            margins=5.0,
            profile="plate",
            chars=None,
            lines=3,
            prefix="cov",
        )
        args.update(kwargs)
        return argparse.Namespace(**args)

    def _main(self, argv):
        with mock.patch.object(sys, "argv", argv):
            with mock.patch.object(sys, "stdout", io.StringIO()) as stdout:
                try:
                    C.main()
                except SystemExit as exception:
                    return exception.code, stdout.getvalue()
        return None, stdout.getvalue()

    def test_cmap(self):
        C._CMAPS = dict()
        path = M.ttf_for("Helvetica 4L", f3s=True)

        cmap = C.cmap(path)
        self.assertIn(ord("A"), cmap)
        self.assertEqual(cmap.get(ord("|")), None)

        # the cmap of a font is read once and cached by path
        self.assertIs(C.cmap(path), cmap)
        self.assertEqual(list(C._CMAPS), [path])

    def test_line_extents(self):
        self._standard()

        extents = C.line_extents("AB", "Helvetica 4L", 5)
        self.assertEqual(len(extents), 4)
        self.assertAlmostEqual(extents[0], 0.1, delta=1e-9)
        self.assertAlmostEqual(extents[1], 8.4, delta=1e-9)
        self.assertAlmostEqual(extents[2], 5.0, delta=1e-9)
        self.assertAlmostEqual(extents[3], 0.0, delta=1e-9)

        # the extents scale with the size
        extents = C.line_extents("AB", "Helvetica 4L", 10)
        self.assertAlmostEqual(extents[0], 0.2, delta=1e-9)
        self.assertAlmostEqual(extents[1], 16.8, delta=1e-9)
        self.assertAlmostEqual(extents[2], 10.0, delta=1e-9)

        # a space advances the pen without adding ink, even leading
        extents = C.line_extents(" A ", "Helvetica 4L", 5)
        self.assertAlmostEqual(extents[0], 4.39, delta=1e-9)
        self.assertAlmostEqual(extents[1], 8.39, delta=1e-9)

        # a glyph missing in the F3S font neither inks nor advances
        self.assertEqual(
            C.line_extents("AÃB", "Helvetica 4L", 5),
            C.line_extents("AB", "Helvetica 4L", 5),
        )

    def test_line_extents_vertical(self):
        self._standard()

        # the descender is the bottom below the baseline
        extents = C.line_extents("Aj", "Helvetica 4L", 5)
        self.assertAlmostEqual(extents[1], 6.0, delta=1e-9)
        self.assertAlmostEqual(extents[2], 5.0, delta=1e-9)
        self.assertAlmostEqual(extents[3], 1.5, delta=1e-9)

        # every glyph is scaled by its own units per font size
        extents = C.line_extents("@A", "Helvetica 4L", 5)
        self.assertAlmostEqual(extents[0], 0.0, delta=1e-9)
        self.assertAlmostEqual(extents[1], 9.1, delta=1e-9)
        self.assertAlmostEqual(extents[2], 6.25, delta=1e-9)
        self.assertAlmostEqual(extents[3], 0.0, delta=1e-9)

    def test_line_extents_segments(self):
        self._standard()

        # the emojis of a mixed line are engraved at the font size and
        # their space with the Helvetica 4L one
        line = [["Roman 4L", "A"], [M.EMOJI_FONT, " B"]]
        extents = C.line_extents(line, "Helvetica 4L", 5)
        self.assertAlmostEqual(extents[0], 0.1, delta=1e-9)
        self.assertAlmostEqual(extents[1], 4.3 + 4.29 + 5.0, delta=1e-9)
        self.assertAlmostEqual(extents[2], 5.0, delta=1e-9)

        # an explicit mapping is used instead of the default one
        line = [[M.EMOJI_FONT, "Z"]]
        self.assertEqual(C.line_extents(line, M.EMOJI_FONT, 6), None)
        extents = C.line_extents(line, M.EMOJI_FONT, 6, {"Z": "1103.infinito"})
        self.assertAlmostEqual(extents[1], 6.0, delta=1e-9)

    def test_line_extents_blank(self):
        self._standard()

        self.assertEqual(C.line_extents("", "Helvetica 4L", 5), None)
        self.assertEqual(C.line_extents("   ", "Helvetica 4L", 5), None)
        self.assertEqual(C.line_extents("ÃÕ", "Helvetica 4L", 5), None)

    def test_validate(self):
        self._standard()

        self.assertEqual(C.validate(self._case()), [])

        line = [["Helvetica 4L", "A "], [M.EMOJI_FONT, "A B"], ["Roman 4L", " A"]]
        case = self._case(lines=["AB", line], f3s=False)
        self.assertEqual(C.validate(case), [])

        case = self._case(
            font=M.EMOJI_FONT, font_size=6, lines=[[[M.EMOJI_FONT, "A B"]]]
        )
        self.assertEqual(C.validate(case), [])

    def test_validate_missing(self):
        self._standard()

        # the missing keys are the only problems reported
        case = dict(name="test", font="Helvetica 4L", lines=["|Ã"])
        self.assertEqual(
            C.validate(case),
            [
                "test: missing font_size",
                "test: missing width",
                "test: missing height",
                "test: missing margins",
            ],
        )

        problems = C.validate(dict())
        self.assertEqual(len(problems), 7)
        self.assertEqual(problems[0], "?: missing name")

    def test_validate_lines(self):
        self._standard()

        self.assertEqual(C.validate(self._case(lines=[])), ["test: no lines"])

        # a case may hold only typed lines
        case = self._case(lines=[], typed=["A B"])
        self.assertEqual(C.validate(case), [])

    def test_validate_pipe(self):
        self._standard()

        case = self._case(
            font=M.EMOJI_FONT, font_size=6, lines=[[[M.EMOJI_FONT, "A |"]]]
        )
        self.assertEqual(
            C.validate(case),
            ["test: '|' cannot travel in the viewport URL, put it in typed lines"],
        )

        # the typed lines are typed through the keyboard, not the URL
        case = self._case(
            font=M.EMOJI_FONT, font_size=6, lines=[[[M.EMOJI_FONT, "A"]]], typed=["|"]
        )
        self.assertEqual(C.validate(case), [])

        # a pipe of a text font cannot travel either
        path = M.ttf_for("Helvetica 4L", f3s=True)
        self.assertEqual(
            C.validate(self._case(lines=["A|B"])),
            [
                "test: '|' cannot travel in the viewport URL, put it in typed lines",
                "test: '|' has no F3S glyph in Helvetica 4L",
                "test: '|' is not in %s" % path,
            ],
        )

    def test_validate_glyphs(self):
        self._standard()

        self.assertEqual(
            C.validate(self._case(lines=["AÃ"])),
            ["test: 'Ã' has no F3S glyph in Helvetica 4L"],
        )

        # Roman 4L has no ç in its TTF, the regular as the tuned one
        path = M.ttf_for("Roman 4L", f3s=True)
        self.assertEqual(
            path, os.path.join(ROOT_DIR, "static", "fonts", "roman4l-f3s.ttf")
        )
        case = self._case(font="Roman 4L", lines=["Aç"])
        self.assertEqual(C.validate(case), ["test: 'ç' is not in %s" % path])
        path = os.path.join(ROOT_DIR, "static", "fonts", "roman4l.ttf")
        case = self._case(font="Roman 4L", lines=["Aç"], f3s=False)
        self.assertEqual(C.validate(case), ["test: 'ç' is not in %s" % path])

        # the spaces of a text font need no F3S glyph
        case = self._case(font="Roman 4L", lines=["A A"])
        self.assertEqual(C.validate(case), [])

    def test_validate_glyphs_emojis(self):
        self._standard()
        self._fonts({"HELVETICA 4L": {}})

        # the space of an emoji line is engraved with the Helvetica 4L one
        case = self._case(
            font=M.EMOJI_FONT, font_size=6, lines=[[[M.EMOJI_FONT, "A B"]]]
        )
        self.assertEqual(
            C.validate(case), ["test: ' ' has no F3S glyph in Cool Emojis"]
        )

        # an emoji out of the mapping has no F3S glyph
        case = self._case(
            font=M.EMOJI_FONT, font_size=6, lines=[[[M.EMOJI_FONT, "AZ"]]]
        )
        self.assertEqual(
            C.validate(case), ["test: 'Z' has no F3S glyph in Cool Emojis"]
        )

    def test_validate_root(self):
        self._standard()
        root = self._root()

        case = self._case(lines=["Aç"])
        self.assertEqual(C.validate(case), [])

        # the TTF is the one of the checkout serving the case
        path = os.path.join(root, "static", "fonts", "helvetica4l.ttf")
        self.assertEqual(C.validate(case, root=root), ["test: 'ç' is not in %s" % path])

    def test_validate_width(self):
        self._standard()

        # 13 capitals are 55.6 mm wide, 14 are 59.9 mm and cross the safety
        # distance kept from the 60 mm area
        self.assertEqual(C.validate(self._case(lines=["A" * 13])), [])
        self.assertEqual(
            C.validate(self._case(lines=["AB", "A" * 14])),
            ["test: line 2 is 59.90 mm wide for a 60.00 mm area"],
        )

        case = self._case(lines=["A" * 13], margins=[10, 5, 5, 5])
        self.assertEqual(
            C.validate(case), ["test: line 1 is 55.60 mm wide for a 55.00 mm area"]
        )

    def test_validate_height(self):
        self._standard()

        # 7 lines at 5 mm span 57.8 mm from the first cap top to the last
        # baseline, centred in the 60 mm area
        self.assertEqual(C.validate(self._case(lines=["A"] * 7)), [])
        self.assertEqual(
            C.validate(self._case(lines=["A"] * 8)),
            ["test: the block runs from -3.30 to 63.30 mm of a 60.00 mm area"],
        )

        # the descender of the last line and the ink of the first line
        # above the capitals count
        self.assertEqual(
            C.validate(self._case(lines=["A"] * 6 + ["j"])),
            ["test: the block runs from 1.10 to 60.40 mm of a 60.00 mm area"],
        )
        self.assertEqual(
            C.validate(self._case(lines=["@"] + ["A"] * 6)),
            ["test: the block runs from -0.15 to 58.90 mm of a 60.00 mm area"],
        )

        # a first line without ink is placed like the capitals
        self.assertEqual(C.validate(self._case(lines=[" "] + ["A"] * 6)), [])

    def test_number(self):
        self.assertEqual(C.number("5"), 5)
        self.assertEqual(type(C.number("5")), int)
        self.assertEqual(type(C.number(70.0)), int)
        self.assertEqual(C.number("2.5"), 2.5)
        self.assertEqual(C.number(0.25), 0.25)

        with self.assertRaises(ValueError):
            C.number("70mm")

    def test_generate(self):
        self._alphabet()

        cases = C.generate(self._args(lines=2))
        self.assertEqual(
            cases,
            [
                dict(
                    name="cov-helvetica4l-1",
                    font="Helvetica 4L",
                    font_size=5,
                    lines=["ABCDEFGHIJKL", "MNOPQRSTUVWX"],
                    profile="plate",
                    width=70,
                    height=70,
                    margins=[5, 5, 5, 5],
                    f3s=True,
                ),
                dict(
                    name="cov-helvetica4l-2",
                    font="Helvetica 4L",
                    font_size=5,
                    lines=["YZç"],
                    profile="plate",
                    width=70,
                    height=70,
                    margins=[5, 5, 5, 5],
                    f3s=True,
                ),
            ],
        )
        for case in cases:
            self.assertEqual(C.validate(case), [])

    def test_generate_plate(self):
        self._alphabet()

        # a 20 mm high area holds 2 lines of 5 mm
        cases = C.generate(self._args(plate="70x30", prefix="small"))
        self.assertEqual(
            [case["name"] for case in cases],
            ["small-helvetica4l-1", "small-helvetica4l-2"],
        )
        self.assertEqual([len(case["lines"]) for case in cases], [2, 1])
        self.assertEqual(cases[0]["height"], 30)
        for case in cases:
            self.assertEqual(C.validate(case), [])

        cases = C.generate(self._args(plate="62.5x70", margins=2.5, size=4.5))
        self.assertEqual(cases[0]["width"], 62.5)
        self.assertEqual(cases[0]["height"], 70)
        self.assertEqual(type(cases[0]["height"]), int)
        self.assertEqual(cases[0]["margins"], [2.5, 2.5, 2.5, 2.5])
        self.assertEqual(cases[0]["font_size"], 4.5)
        for case in cases:
            self.assertEqual(C.validate(case), [])

    def test_generate_chars(self):
        self._alphabet()

        # the provided characters are kept in their order, spaces included
        cases = C.generate(self._args(chars="BA C", profile="small-medal"))
        self.assertEqual(len(cases), 1)
        self.assertEqual(cases[0]["lines"], ["BA C"])
        self.assertEqual(cases[0]["profile"], "small-medal")

    def test_generate_emojis(self):
        self._standard()

        # two emojis per line, the pipe left out and the wide W given its
        # own line, as it does not fit next to the C
        cases = C.generate(self._args(font=M.EMOJI_FONT, size=6.0, prefix="emojis"))
        self.assertEqual(len(cases), 1)
        self.assertEqual(cases[0]["name"], "emojis-coolemojis-1")
        self.assertEqual(cases[0]["font"], M.EMOJI_FONT)
        self.assertEqual(cases[0]["font_size"], 6)
        self.assertEqual(
            cases[0]["lines"],
            [
                [[M.EMOJI_FONT, "A B"]],
                [[M.EMOJI_FONT, "C"]],
                [[M.EMOJI_FONT, "W"]],
            ],
        )
        self.assertEqual(C.validate(cases[0]), [])

    def test_generate_emojis_chars(self):
        self._standard()

        cases = C.generate(self._args(font=M.EMOJI_FONT, size=6.0, chars="|CBA"))
        self.assertEqual(
            cases[0]["lines"], [[[M.EMOJI_FONT, "C B"]], [[M.EMOJI_FONT, "A"]]]
        )

    def test_generate_emojis_unmapped(self):
        self._standard()

        # characters out of the mapping have no ink, the generated case
        # is left for the validation to refuse
        cases = C.generate(self._args(font=M.EMOJI_FONT, size=6.0, chars=".]"))
        self.assertEqual(cases[0]["lines"], [[[M.EMOJI_FONT, ". ]"]]])
        path = M.ttf_for(M.EMOJI_FONT, f3s=True)
        self.assertEqual(
            C.validate(cases[0]),
            [
                "cov-coolemojis-1: '.' has no F3S glyph in Cool Emojis",
                "cov-coolemojis-1: '.' is not in %s" % path,
                "cov-coolemojis-1: ']' has no F3S glyph in Cool Emojis",
                "cov-coolemojis-1: ']' is not in %s" % path,
            ],
        )

    def test_main_generate(self):
        self._alphabet()

        code, output = self._main(
            ["cases.py", "generate", "--font", "Helvetica 4L", "--lines", "2"]
        )
        self.assertEqual(code, None)
        self.assertEqual(json.loads(output), C.generate(self._args(lines=2)))
        self.assertIn('"YZç"', output)

    def test_main_generate_problems(self):
        self._alphabet()

        # the cases are written even when they have problems
        code, output = self._main(
            ["cases.py", "generate", "--font", "Helvetica 4L", "--chars", "AÃ"]
        )
        self.assertEqual(
            code,
            "generated cases with problems:\n  cov-helvetica4l-1: 'Ã' has no F3S glyph in Helvetica 4L",
        )
        self.assertEqual(json.loads(output)[0]["lines"], ["AÃ"])

    def test_main_check(self):
        self._standard()
        path = self._write("cases.json", json.dumps([self._case()]))

        code, output = self._main(["cases.py", "check", path])
        self.assertEqual(code, 0)
        self.assertEqual(output, "1 cases, 0 problems\n")

        cases = [self._case(), self._case(name="wide", lines=["A" * 14, "AÃ"])]
        path = self._write("cases.json", json.dumps(cases))
        code, output = self._main(["cases.py", "check", path])
        self.assertEqual(code, 1)
        self.assertEqual(
            output.splitlines(),
            [
                "wide: 'Ã' has no F3S glyph in Helvetica 4L",
                "wide: line 1 is 59.90 mm wide for a 60.00 mm area",
                "2 cases, 2 problems",
            ],
        )

    def test_main_check_root(self):
        self._standard()
        root = self._root()
        path = self._write("cases.json", json.dumps([self._case(lines=["Aç"])]))

        code, output = self._main(["cases.py", "check", path, "--root", root])
        self.assertEqual(code, 1)
        self.assertEqual(
            output,
            "test: 'ç' is not in %s\n1 cases, 1 problems\n"
            % os.path.join(root, "static", "fonts", "helvetica4l.ttf"),
        )
