#!/usr/bin/env python3

import os
import sys
import json
import shutil
import tempfile
import unittest

ROOT_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "..")
)
SCRIPTS_DIR = os.path.join(ROOT_DIR, ".agents", "skills", "match-f3s-fonts", "scripts")
sys.path.insert(0, SCRIPTS_DIR)

import f3s_model as M

SPACE = dict(metrics=[5000, 0, -428, 0, 0, 0, 3862, 0, 0, 3419, 0], strokes=[])

H = dict(
    metrics=[5000, 0, -650, 0, 0, 0, 4570, 0, 0, 3920, 5000],
    strokes=[
        [["on", 0, 0], ["end", 0, 5000]],
        [["on", 3920, 0], ["end", 3920, 5000]],
        [["on", 0, 2500], ["end", 3920, 2500]],
    ],
)

FAMILY = dict(
    metrics=[9417, 0, 0, 0, 0, 0, 5705, 0, 0, 5705, 9417],
    strokes=[
        [["on", 0, 0], ["on", 5705, 0], ["end", 2852, 8297]],
        [["on", 2852, 9417], ["end", 2852, 9417]],
    ],
)

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

# a stem and the same stem with an accent below, that starts on it
STEM = dict(
    metrics=[5000, 0, -650, 0, 0, 0, 1300, 0, 0, 0, 5000],
    strokes=[[["on", 0, 0], ["end", 0, 5000]]],
)

STEM_CEDILLA = dict(
    metrics=[5000, 0, -150, 0, 1000, 0, 1300, 0, 0, 500, 6000],
    strokes=[
        [["on", 500, 1000], ["end", 500, 6000]],
        [["on", 500, 1000], ["end", 0, 0]],
    ],
)

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


class F3SModelTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self._gravo_native = M.GRAVO_NATIVE
        self._gravo_pilot = M.GRAVO_PILOT
        self._parser = M._PARSER

    def tearDown(self):
        M.GRAVO_NATIVE = self._gravo_native
        M.GRAVO_PILOT = self._gravo_pilot
        M._PARSER = self._parser
        shutil.rmtree(self.temp_dir)

    def test_parser(self):
        if not os.path.exists(os.path.join(M.GRAVO_NATIVE, "f3s_parser.py")):
            self.skipTest("Skipping test: gravo-native unavailable")

        M._PARSER = None
        parser = M.parser()
        self.assertEqual(parser.__name__, "f3s_parser")
        self.assertEqual(M.parser(), parser)

    def test_parser_missing(self):
        M._PARSER = None
        M.GRAVO_NATIVE = self.temp_dir

        with self.assertRaises(RuntimeError) as context:
            M.parser()
        self.assertIn(self.temp_dir, str(context.exception))

    def test_f3s_dirs(self):
        M.GRAVO_PILOT = self.temp_dir

        directories = M.f3s_dirs()
        self.assertEqual(
            directories,
            [
                os.path.join(M.ROOT_DIR, "static", "fonts", "f3s"),
                os.path.join(self.temp_dir, "src", "gravo_pilot", "res", "fonts"),
            ],
        )

    def test_find_f3s(self):
        M.GRAVO_PILOT = self.temp_dir
        path = self._write(
            os.path.join(
                "src", "gravo_pilot", "res", "fonts", "emojis", "1101.Coracao.F3S"
            ),
            "",
        )

        self.assertEqual(M.find_f3s("1101.coracao"), path)
        self.assertEqual(M.find_f3s("1101.CORACAO"), path)
        self.assertEqual(M.find_f3s(path), path)

    def test_find_f3s_missing(self):
        M.GRAVO_PILOT = self.temp_dir

        with self.assertRaises(RuntimeError) as context:
            M.find_f3s("Unknown 4L")
        self.assertIn("Unknown 4L", str(context.exception))

    def test_load_f3s(self):
        self._fonts({"HELVETICA 4L": {"72": H}})

        font = M.load_f3s("Helvetica 4L")
        self.assertEqual(font["glyphs"], {72: H})

        # the parsed font is cached by path, so the same font is returned
        # for any spelling of the name of its file
        self.assertIs(M.load_f3s("HELVETICA 4L"), font)

    def test_load_mapping(self):
        path = self._write(
            "mapping.json",
            json.dumps({"!": "3007.filho-familia", "#": {"name": "3011.gato-familia"}}),
        )

        mapping = M.load_mapping(path)
        self.assertEqual(mapping, {"!": "3007.filho-familia", "#": "3011.gato-familia"})

        self._write("mapping.json", json.dumps({}))
        self.assertEqual(M.load_mapping(path), mapping)

        mapping = M.load_mapping()
        self.assertEqual(mapping["!"], "3007.filho-familia")

    def test_load_manifest(self):
        path = self._write(
            "fonts.json",
            json.dumps([{"stem": "helvetica4l", "f3s": "Helvetica 4L"}]),
        )

        manifest = M.load_manifest(path)
        self.assertEqual(manifest, [{"stem": "helvetica4l", "f3s": "Helvetica 4L"}])

        manifest = M.load_manifest()
        self.assertEqual(len(manifest), 6)
        for entry in manifest:
            self.assertEqual(len(entry["f3s_sha256"]), 64)

    def test_file_sha256(self):
        path = self._write("empty.f3s", "")
        self.assertEqual(
            M.file_sha256(path),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        )

        path = self._write("abc.f3s", "abc")
        self.assertEqual(
            M.file_sha256(path),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
        )

    def test_resolve(self):
        self._fonts(
            {
                "HELVETICA 4L": {"32": SPACE, "72": H},
                "3007.filho-familia": {"97": FAMILY},
            }
        )

        self.assertEqual(M.resolve("Helvetica 4L", "H"), H)
        self.assertEqual(M.resolve("Helvetica 4L", "I"), None)

        # the emojis are engraved with the glyph a of their own font and
        # their space with the Helvetica 4L one
        self.assertEqual(M.resolve(M.EMOJI_FONT, " "), SPACE)
        self.assertEqual(M.resolve(M.EMOJI_FONT, "!"), FAMILY)
        self.assertEqual(
            M.resolve(M.EMOJI_FONT, "!", {"!": "3007.filho-familia"}), FAMILY
        )

        # an explicit mapping is used as it is, even when empty
        self.assertEqual(M.resolve(M.EMOJI_FONT, "!", {}), None)
        self.assertEqual(
            M.resolve(M.EMOJI_FONT, "!", {"#": "3007.filho-familia"}), None
        )

    def test_advance(self):
        self.assertEqual(M.advance(H), 5220)
        self.assertEqual(M.advance(SPACE), 4290)

        glyph = dict(metrics=[5000, 0, 120, 0, 0, 0, 3000, 0, 0, 2500, 5000])
        self.assertEqual(M.advance(glyph), 2880)

    def test_ink_centre(self):
        self.assertEqual(M.ink_centre(H), 2610.0)
        self.assertEqual(M.ink_centre(FAMILY), 2852.5)

        glyph = dict(metrics=[5000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
        self.assertEqual(M.ink_centre(glyph), 0.0)

    def test_size_units(self):
        self.assertEqual(M.size_units(H), 5000.0)
        self.assertEqual(M.size_units(FAMILY), 9417.0)
        self.assertEqual(type(M.size_units(H)), float)

    def test_polylines(self):
        self._fonts(dict())

        lines = M.polylines(H)
        self.assertEqual(
            lines,
            [[(0, 0), (0, 5000)], [(3920, 0), (3920, 5000)], [(0, 2500), (3920, 2500)]],
        )

        lines = M.polylines(SPACE)
        self.assertEqual(lines, [])

    def test_main_ink(self):
        self._fonts(dict())

        self.assertEqual(M.main_ink(H), (650, 0, 4570, 5000))

        # a blank glyph has no ink, the stored box of the space keeps a
        # width that is not drawn
        glyph = dict(metrics=[5000, 0, -428, 0, 0, 0, 3862, 0, 0, 0, 0], strokes=[])
        self.assertEqual(M.main_ink(glyph), None)
        self.assertEqual(M.main_ink(SPACE), (428, 0, 3847, 0))

        # the family emojis carry a marker point at their full height,
        # that is left out of the box of the figure
        self.assertEqual(M.main_ink(FAMILY), (0, 0, 5705, 8297))

        # a glyph made only of points keeps its stored box
        glyph = dict(
            metrics=[5000, 0, -10, 0, -20, 0, 120, 0, 0, 100, 100],
            strokes=[[["on", 10, 10], ["end", 10, 10]]],
        )
        self.assertEqual(M.main_ink(glyph), (10, 20, 110, 120))

        # the box follows the strokes left once the points are dropped
        glyph = dict(
            metrics=[5000, 0, -10, 0, -20, 0, 120, 0, 0, 100, 100],
            strokes=[
                [["on", 20, 0], ["end", 60, 40]],
                [["on", 100, 100], ["end", 100, 100]],
            ],
        )
        self.assertEqual(M.main_ink(glyph), (30, 20, 70, 60))

    def test_pen_curves(self):
        # straight steps relative to the pen on the baseline, in units of
        # the font size, the first one carrying no control point either
        self.assertEqual(
            self._rounded(M.pen_curves(H)),
            [
                [[None, [0.13, 0.0]], [None, [0.13, 1.0]]],
                [[None, [0.914, 0.0]], [None, [0.914, 1.0]]],
                [[None, [0.13, 0.5]], [None, [0.914, 0.5]]],
            ],
        )
        self.assertEqual(M.pen_curves(SPACE), [])

        # a control point takes the point after it as the end of its curve
        self.assertEqual(
            self._rounded(M.pen_curves(U_TILDE)[1]),
            [[None, [0.46, 1.2]], [[0.66, 1.4], [0.86, 1.2]]],
        )

        # the stored box of a glyph with an accent below starts under the
        # baseline, which the vertical offset brings back
        self.assertEqual(
            self._rounded(M.pen_curves(STEM_CEDILLA)),
            [
                [[None, [0.13, 0.0]], [None, [0.13, 1.0]]],
                [[None, [0.13, 0.0]], [None, [0.03, -0.2]]],
            ],
        )

        # a point of an unknown kind ends the curve it is in, what is
        # left of a single point being no curve
        glyph = dict(
            metrics=[1000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            strokes=[
                [
                    ["on", 0, 0],
                    ["on", 100, 0],
                    ["op7", 5, 5],
                    ["on", 200, 0],
                    ["op7", 5, 5],
                    ["on", 300, 0],
                    ["end", 400, 0],
                ],
                [],
            ],
        )
        self.assertEqual(
            self._rounded(M.pen_curves(glyph)),
            [
                [[None, [0.0, 0.0]], [None, [0.1, 0.0]]],
                [[None, [0.3, 0.0]], [None, [0.4, 0.0]]],
            ],
        )

        # a control point with no point before or after it is a point
        glyph = dict(
            metrics=[1000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            strokes=[[["ctrl", 0, 0], ["on", 100, 0], ["ctrl", 200, 100]]],
        )
        self.assertEqual(
            self._rounded(M.pen_curves(glyph)),
            [[[None, [0.0, 0.0]], [None, [0.1, 0.0]], [None, [0.2, 0.1]]]],
        )

    def test_flatten(self):
        curve = [(None, (0.0, 0.0)), ((0.5, 1.0), (1.0, 0.0))]
        self.assertEqual(
            M.flatten(curve, steps=2), [(0.0, 0.0), (0.5, 0.5), (1.0, 0.0)]
        )

        points = M.flatten(curve)
        self.assertEqual(len(points), 9)
        self.assertEqual(points[0], (0.0, 0.0))
        self.assertEqual(points[4], (0.5, 0.5))
        self.assertEqual(points[-1], (1.0, 0.0))

        # the straight steps are kept as they are
        curve = [(None, (0, 0)), (None, (1, 1)), (None, (3, 1))]
        self.assertEqual(M.flatten(curve), [(0, 0), (1, 1), (3, 1)])
        self.assertEqual(M.flatten([]), [])

        # a curve has no point before its first one to bend from, so
        # a control point there is left out
        curve = [((5, 5), (0, 0)), (None, (1, 0))]
        self.assertEqual(M.flatten(curve), [(0, 0), (1, 0)])

    def test_points_box(self):
        self.assertEqual(M.points_box([(1, 5), (-2, 3), (4, -1)]), (-2, -1, 4, 5))
        self.assertEqual(M.points_box([(3, 3)]), (3, 3, 3, 3))
        self.assertEqual(
            M.points_box(point for point in [(0, 0), (2, 1)]), (0, 0, 2, 1)
        )

    def test_lines_distance(self):
        line = [(-1, 0), (1, 0)]
        self.assertEqual(M.lines_distance((0, 1), [line]), 1.0)
        self.assertEqual(M.lines_distance((0.5, 0), [line]), 0.0)

        # past the end of a line the distance is the one to its end
        self.assertEqual(M.lines_distance((3, 0), [line]), 2.0)
        self.assertEqual(M.lines_distance((-4, 4), [line]), 5.0)

        # the nearest of the lines counts, a line of no length being a point
        self.assertEqual(M.lines_distance((0, 3), [line, [(0, 5), (0, 4)]]), 1.0)
        self.assertEqual(M.lines_distance((2, 5), [[(2, 2), (2, 2)]]), 3.0)

        self.assertEqual(M.lines_distance((0, 0), []), float("inf"))
        self.assertEqual(M.lines_distance((0, 0), [[(1, 1)]]), float("inf"))

    def test_accent_curves(self):
        # an accent that stands apart from the letter, joined at no end
        accents, letter = M.accent_curves(U_TILDE, U)
        self.assertEqual(len(accents), 1)
        curve, joined = accents[0]
        self.assertEqual(
            self._rounded(curve), [[None, [0.46, 1.2]], [[0.66, 1.4], [0.86, 1.2]]]
        )
        self.assertEqual(joined, (False, False))
        self.assertEqual(
            self._rounded(letter), [[0.06, 0.7], [0.06, 0.0], [0.66, 0.0], [0.66, 0.7]]
        )

        # an accent that starts on the letter is joined at its start, the
        # point on the letter being both the join and a point of the letter
        accents, letter = M.accent_curves(STEM_CEDILLA, STEM)
        self.assertEqual(len(accents), 1)
        curve, joined = accents[0]
        self.assertEqual(
            self._rounded(curve), [[None, [0.13, 0.0]], [None, [0.03, -0.2]]]
        )
        self.assertEqual(joined, (True, False))
        self.assertEqual(self._rounded(letter), [[0.13, 0.0], [0.13, 1.0], [0.13, 0.0]])

    def test_accent_curves_stroke(self):
        # an accent that continues a stroke of the letter is taken from
        # the last point of the stroke that is on the letter
        glyph = dict(
            metrics=[5000, 0, -150, 0, 1000, 0, 1300, 0, 0, 500, 6000],
            strokes=[
                [
                    ["on", 500, 6000],
                    ["on", 500, 1000],
                    ["ctrl", 0, 1000],
                    ["on", 0, 500],
                    ["end", 250, 0],
                ]
            ],
        )
        accents, letter = M.accent_curves(glyph, STEM)
        self.assertEqual(len(accents), 1)
        curve, joined = accents[0]
        self.assertEqual(
            self._rounded(curve),
            [
                [None, [0.13, 0.0]],
                [[0.03, 0.0], [0.03, -0.1]],
                [None, [0.08, -0.2]],
            ],
        )
        self.assertEqual(joined, (True, False))
        self.assertEqual(self._rounded(letter[:2]), [[0.13, 1.0], [0.13, 0.0]])

        # a run between two points of the letter is joined at both ends,
        # its first step never carrying the control point of the slice
        glyph = dict(
            metrics=[5000, 0, -650, 0, 0, 0, 1300, 0, 0, 1000, 5000],
            strokes=[
                [
                    ["on", 0, 5000],
                    ["ctrl", 0, 4000],
                    ["on", 0, 3000],
                    ["on", 1000, 2500],
                    ["end", 0, 2000],
                ]
            ],
        )
        accents, letter = M.accent_curves(glyph, STEM)
        self.assertEqual(len(accents), 1)
        curve, joined = accents[0]
        self.assertEqual(
            self._rounded(curve),
            [[None, [0.13, 0.6]], [None, [0.33, 0.5]], [None, [0.13, 0.4]]],
        )
        self.assertEqual(joined, (True, True))

    def test_accent_curves_distance(self):
        # the points within the distance of the letter belong to it, so
        # a wide enough distance leaves no accent
        accents, letter = M.accent_curves(U_TILDE, U, distance=2.0)
        self.assertEqual(accents, [])
        self.assertEqual(len(letter), 13)

        # a letter drawn 2% of the size apart is still the letter, a
        # tighter distance taking the parts that leave it as accents
        glyph = dict(U, metrics=[5000, 0, -400, 0, 0, 0, 3600, 0, 0, 3000, 3500])
        accents, letter = M.accent_curves(glyph, U)
        self.assertEqual(accents, [])
        self.assertEqual(len(letter), 4)
        accents, letter = M.accent_curves(glyph, U, distance=0.01)
        self.assertEqual(
            [(len(curve), joined) for curve, joined in accents],
            [(2, (False, True)), (3, (True, False))],
        )

        # with no letter to compare with every curve is an accent
        accents, letter = M.accent_curves(U_TILDE, SPACE)
        self.assertEqual([len(curve) for curve, _joined in accents], [4, 2])
        self.assertEqual(letter, [])

    def test_font_files(self):
        self._write(os.path.join("static", "css", "layout.css"), LAYOUT_CSS)

        files = M.font_files(self.temp_dir)
        self.assertEqual(
            files,
            {
                "Helvetica 4L": os.path.join(
                    self.temp_dir, "static", "fonts", "helvetica4l.ttf"
                ),
                "Roman 4L": os.path.join(
                    self.temp_dir, "static", "fonts", "roman4l.ttf"
                ),
            },
        )

        files = M.font_files()
        self.assertEqual(
            files["Helvetica 4L"],
            os.path.join(M.ROOT_DIR, "static", "fonts", "helvetica4l.ttf"),
        )

    def test_ttf_for(self):
        self._write(os.path.join("static", "css", "layout.css"), LAYOUT_CSS)
        regular = self._write(os.path.join("static", "fonts", "helvetica4l.ttf"), "")
        tuned = self._write(os.path.join("static", "fonts", "helvetica4l-f3s.ttf"), "")

        self.assertEqual(M.ttf_for("Helvetica 4L", root=self.temp_dir), regular)
        self.assertEqual(M.ttf_for("Helvetica 4L", True, self.temp_dir), tuned)

        # a family without a tuned font falls back to the regular one
        path = os.path.join(self.temp_dir, "static", "fonts", "roman4l.ttf")
        self.assertEqual(M.ttf_for("Roman 4L", True, self.temp_dir), path)

    def test_ttf_for_missing(self):
        self._write(os.path.join("static", "css", "layout.css"), LAYOUT_CSS)

        with self.assertRaises(RuntimeError) as context:
            M.ttf_for("Script 4L", root=self.temp_dir)
        self.assertIn("Script 4L", str(context.exception))

    def test_case_lines(self):
        case = dict(lines=["HELLO", [["Roman 4L", "WORLD"]]])
        self.assertEqual(M.case_lines(case), ["HELLO", [["Roman 4L", "WORLD"]]])

        case = dict(lines=["HELLO"], typed=["|!", "#"])
        self.assertEqual(
            M.case_lines(case),
            ["HELLO", [[M.EMOJI_FONT, "|!"]], [[M.EMOJI_FONT, "#"]]],
        )
        self.assertEqual(case["lines"], ["HELLO"])

        case = dict(lines=[], typed=["|"])
        self.assertEqual(M.case_lines(case), [[[M.EMOJI_FONT, "|"]]])

    def test_segments(self):
        self.assertEqual(M.segments("HELLO", "Roman 4L"), [("Roman 4L", "HELLO")])
        self.assertEqual(M.segments("", "Roman 4L"), [("Roman 4L", "")])
        self.assertEqual(
            M.segments([["Roman 4L", "HI "], [M.EMOJI_FONT, "!"]], "Helvetica 4L"),
            [("Roman 4L", "HI "), (M.EMOJI_FONT, "!")],
        )
        self.assertEqual(M.segments([], "Roman 4L"), [])

    def test_elements(self):
        self.assertEqual(
            M.elements("AB", "Roman 4L"), [("Roman 4L", "A"), ("Roman 4L", "B")]
        )
        self.assertEqual(
            M.elements([["Roman 4L", "A"], [M.EMOJI_FONT, "! "]], "Helvetica 4L"),
            [("Roman 4L", "A"), (M.EMOJI_FONT, "!"), (M.EMOJI_FONT, " ")],
        )
        self.assertEqual(M.elements("", "Roman 4L"), [])

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

    def _rounded(self, value):
        """
        Rounds every number of nested lists and tuples, so the curves
        and points of the model can be compared with literals.
        """

        if isinstance(value, (list, tuple)):
            return [self._rounded(item) for item in value]
        return value if value == None else round(value, 6)
