#!/usr/bin/env python3

import io
import os
import sys
import json
import shutil
import tempfile
import unittest
import urllib.parse
import urllib.request

from unittest import mock

from fontTools.ttLib import TTFont

ROOT_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "..")
)
SCRIPTS_DIR = os.path.join(ROOT_DIR, ".agents", "skills", "match-f3s-fonts", "scripts")
sys.path.insert(0, SCRIPTS_DIR)

import f3s_model as M
import make_f3s_ttf as G
import gravo_job as J
import cases as C
import selftest

# a glyph advancing 4.3 mm with 4 mm of ink at 5 mm
CAP = dict(
    metrics=[5000, 0, -100, 0, 0, 0, 4200, 0, 0, 4000, 5000],
    strokes=[[["on", 0, 0], ["end", 4000, 5000]]],
)

# a capital advancing 5 mm with 4.8 mm of ink at 5 mm
WIDE = dict(
    metrics=[5000, 0, 0, 0, 0, 0, 5000, 0, 0, 4800, 5000],
    strokes=[[["on", 0, 0], ["end", 4800, 5000]]],
)

TTF_PATH = os.path.join(ROOT_DIR, "static", "fonts", "helvetica4l-f3s.ttf")


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


class SelftestTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self._fonts_dir = G.FONTS_DIR
        self._request = J.request
        self._urlopen = urllib.request.urlopen
        self._gravo_pilot = M.GRAVO_PILOT
        self._parser = M._PARSER

        # the guard test of the skill replaces the requests itself, this
        # one makes sure none of them ever leaves
        urllib.request.urlopen = self._offline

    def tearDown(self):
        G.FONTS_DIR = self._fonts_dir
        J.request = self._request
        urllib.request.urlopen = self._urlopen
        M.GRAVO_PILOT = self._gravo_pilot
        M._PARSER = self._parser
        shutil.rmtree(self.temp_dir)

    def _offline(self, *args, **kwargs):
        raise AssertionError("a test reached for the network with %r" % (args,))

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

    def _manifest(self):
        """
        Writes two fonts of a manifest, their committed `-f3s.ttf` being
        copies of a public TTF, and their F3S fonts.
        """

        G.FONTS_DIR = os.path.join(self.temp_dir, "fonts")
        os.makedirs(G.FONTS_DIR)
        for stem in ("fake1l", "fake4l"):
            shutil.copy(TTF_PATH, os.path.join(G.FONTS_DIR, "%s-f3s.ttf" % stem))
        self._fonts({"FAKE 1L": {ord("A"): CAP}, "FAKE 4L": {ord("B"): CAP}})
        return [
            dict(stem="fake1l", f3s="Fake 1L", adjust={"A": {"left": -10}}),
            dict(stem="fake4l", f3s="Fake 4L"),
        ]

    def test_test_fonts(self):
        manifest = self._manifest()
        with open(TTF_PATH, "rb") as file:
            data = file.read()

        report = dict(passed=True)
        with mock.patch.object(M, "load_manifest", return_value=manifest):
            with mock.patch.object(G, "build_font", return_value=data) as build_font:
                with mock.patch.object(G, "check", return_value=report) as check:
                    self.assertEqual(selftest.test_fonts(), [])

        self.assertEqual(
            build_font.call_args_list, [mock.call(entry) for entry in manifest]
        )

        # every committed font is checked against its own F3S font and
        # the corrections of the manifest
        first, second = check.call_args_list
        self.assertEqual(type(first.args[0]), TTFont)
        self.assertEqual(first.kwargs["f3s"], M.load_f3s("Fake 1L"))
        self.assertEqual(first.kwargs["adjust"], {"A": {"left": -10}})
        self.assertEqual(second.kwargs["f3s"], M.load_f3s("Fake 4L"))
        self.assertEqual(second.kwargs["adjust"], None)

    def test_test_fonts_failures(self):
        manifest = self._manifest()
        with open(TTF_PATH, "rb") as file:
            data = file.read()

        # the second font is not the build of the manifest nor passes
        builds = [data, b"other"]
        reports = [dict(passed=True), dict(passed=False)]
        with mock.patch.object(M, "load_manifest", return_value=manifest):
            with mock.patch.object(G, "build_font", side_effect=builds):
                with mock.patch.object(G, "check", side_effect=reports):
                    failures = selftest.test_fonts()
        path = os.path.join(G.FONTS_DIR, "fake4l-f3s.ttf")
        self.assertEqual(
            failures,
            [
                "%s is not the build of fonts.json" % path,
                "%s fails the check" % path,
            ],
        )

    def test_test_fonts_committed(self):
        parser = os.path.join(M.GRAVO_NATIVE, "f3s_parser.py")
        fonts = os.path.join(M.GRAVO_PILOT, "src", "gravo_pilot", "res", "fonts")
        if not os.path.exists(parser) or not os.path.isdir(fonts):
            self.skipTest("Skipping test: gravo-native or gravo-pilot unavailable")

        self.assertEqual(selftest.test_fonts(), [])

    def test_test_guard(self):
        self.assertEqual(selftest.test_guard(), [])

        # the requests were replaced before any payload was submitted
        self.assertIsNot(J.request, self._request)

    def test_test_guard_failures(self):
        def submit(payload, name=None):
            body = urllib.parse.urlencode(
                [("type", "gravo"), ("data", json.dumps(payload))]
            ).encode("utf-8")
            return json.loads(J.request("/nodes/test/print", data=body))["id"]

        # a submission without any guard sends every payload as it is
        with mock.patch.object(J, "submit", submit):
            failures = selftest.test_guard()
        self.assertEqual(
            failures,
            [
                "a payload with dry_run None was sent",
                "a payload with dry_run False was sent",
                "a payload with dry_run 'true' was sent",
                "a payload with dry_run 1 was sent",
                "check_path or record was sent on",
            ],
        )

    def test_test_cases(self):
        helvetica = dict((ord(char), CAP) for char in "TiagoAV")
        helvetica[ord("W")] = WIDE
        roman = dict((ord(char), CAP) for char in "Conceição")
        self._fonts({"HELVETICA 4L": helvetica, "ROMAN 4L": roman})

        self.assertEqual(selftest.test_cases(), [])

    def test_test_cases_failures(self):
        with mock.patch.object(C, "validate", return_value=[]):
            failures = selftest.test_cases()
        self.assertEqual(
            failures,
            [
                "a line wider than the area was accepted",
                "a glyph missing in the TTF was accepted",
            ],
        )

        with mock.patch.object(C, "validate", return_value=["test: problem"]):
            failures = selftest.test_cases()
        self.assertEqual(failures, ["a valid case was refused: ['test: problem']"])

    def test_main(self):
        with mock.patch.object(selftest, "test_fonts", return_value=[]):
            with mock.patch.object(selftest, "test_guard", return_value=[]):
                with mock.patch.object(selftest, "test_cases", return_value=[]):
                    with mock.patch.object(sys, "stdout", io.StringIO()) as stdout:
                        with self.assertRaises(SystemExit) as context:
                            selftest.main()
        self.assertEqual(context.exception.code, 0)
        self.assertEqual(
            stdout.getvalue().splitlines(), ["fonts  ok", "guard  ok", "cases  ok"]
        )

    def test_main_failures(self):
        failures = ["first failure", "second failure"]
        with mock.patch.object(selftest, "test_fonts", return_value=[]):
            with mock.patch.object(selftest, "test_guard", return_value=failures):
                with mock.patch.object(selftest, "test_cases", return_value=["third"]):
                    with mock.patch.object(sys, "stdout", io.StringIO()) as stdout:
                        with self.assertRaises(SystemExit) as context:
                            selftest.main()
        self.assertEqual(context.exception.code, 1)
        self.assertEqual(
            stdout.getvalue().splitlines(),
            [
                "fonts  ok",
                "guard  FAILED",
                "cases  FAILED",
                "  first failure",
                "  second failure",
                "  third",
            ],
        )
