#!/usr/bin/env python3

import io
import os
import sys
import json
import time
import base64
import shutil
import tempfile
import unittest
import itertools
import urllib.parse
import urllib.request

from unittest import mock

ROOT_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "..")
)
SCRIPTS_DIR = os.path.join(ROOT_DIR, ".agents", "skills", "match-f3s-fonts", "scripts")
sys.path.insert(0, SCRIPTS_DIR)

import f3s_model as M
import gravo_job as J

# a capital advancing 4.3 mm with 4 mm of ink at 5 mm
CAP = dict(
    metrics=[5000, 0, -100, 0, 0, 0, 4200, 0, 0, 4000, 5000],
    strokes=[[["on", 0, 0], ["end", 4000, 5000]]],
)

MAPPING = {
    "A": "1101.coracao",
    "B": {"name": "1102.estrela", "category": "symbols", "order": 20},
    "C": "1103.infinito",
    "|": "2105.special",
}

TEXT = [["Helvetica 4L", "AB"]]


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


class GravoJobTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.requests = []
        self._print_url = J.PRINT_URL
        self._engrave_node = J.ENGRAVE_NODE
        self._key_path = J.KEY_PATH
        self._request = J.request
        self._guard = J.guard
        self._urlopen = urllib.request.urlopen
        self._gravo_pilot = M.GRAVO_PILOT
        self._parser = M._PARSER
        self._mapping_path = M.MAPPING_PATH

        # keeps every test away from Colony Print and the real key, any
        # request that a test does not serve failing instead of leaving
        J.PRINT_URL = "https://print.invalid"
        J.ENGRAVE_NODE = "test-node"
        J.KEY_PATH = os.path.join(self.temp_dir, "colony-print-key")
        J.request = self._offline
        urllib.request.urlopen = self._offline

    def tearDown(self):
        J.PRINT_URL = self._print_url
        J.ENGRAVE_NODE = self._engrave_node
        J.KEY_PATH = self._key_path
        J.request = self._request
        J.guard = self._guard
        urllib.request.urlopen = self._urlopen
        M.GRAVO_PILOT = self._gravo_pilot
        M._PARSER = self._parser
        M.MAPPING_PATH = self._mapping_path
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

    def _read(self, path):
        with open(os.path.join(self.temp_dir, path), "rb") as file:
            return file.read()

    def _fonts(self, fonts):
        M._PARSER = FakeParser()
        M.GRAVO_PILOT = self.temp_dir
        for name, glyphs in fonts.items():
            self._write(
                os.path.join("src", "gravo_pilot", "res", "fonts", "%s.f3s" % name),
                json.dumps(glyphs),
            )

    def _mapping(self):
        M.MAPPING_PATH = self._write("mapping.json", json.dumps(MAPPING))

    def _json(self, value):
        return json.dumps(value).encode("utf-8")

    def _serve(self, responses):
        """
        Answers the Colony Print requests with the canned responses of
        their path (a list being answered in order), recording the path
        and the body of every request.
        """

        def request(path, data=None, timeout=60):
            self.requests.append((path, data))
            response = responses[path]
            if isinstance(response, list):
                response = response.pop(0)
            return response

        J.request = request

    def _fields(self, body):
        fields = dict(urllib.parse.parse_qsl(body.decode("utf-8")))
        fields["data"] = json.loads(fields["data"])
        return fields

    def _case(self, **kwargs):
        case = dict(
            name="probe",
            font="Helvetica 4L",
            font_size=5,
            lines=["AB"],
            profile="plate",
            width=70,
            height=70,
            margins=[5, 5, 5, 5],
            f3s=True,
        )
        case.update(kwargs)
        return case

    def _main(self, argv):
        with mock.patch.object(sys, "argv", argv):
            with mock.patch.object(sys, "stdout", io.StringIO()) as stdout:
                try:
                    J.main()
                except SystemExit as exception:
                    return exception.code, stdout.getvalue()
        return None, stdout.getvalue()

    def test_key(self):
        with mock.patch.dict(os.environ, {"PRINT_KEY": "secret"}):
            self.assertEqual(J.key(), "secret")

    def test_key_file(self):
        self._write("colony-print-key", " file-secret\n")

        # an empty environment variable is no key
        with mock.patch.dict(os.environ, {"PRINT_KEY": ""}):
            self.assertEqual(J.key(), "file-secret")

        with mock.patch.dict(os.environ):
            os.environ.pop("PRINT_KEY", None)
            self.assertEqual(J.key(), "file-secret")

    def test_key_missing(self):
        with mock.patch.dict(os.environ, {"PRINT_KEY": ""}):
            with self.assertRaises(OSError):
                J.key()

    def test_request(self):
        J.request = self._request

        with mock.patch.object(J, "key", return_value="secret"):
            with mock.patch.object(urllib.request, "urlopen") as urlopen:
                response = urlopen.return_value.__enter__.return_value
                response.read.return_value = b'{"id": "7"}'
                self.assertEqual(J.request("/jobs/7"), b'{"id": "7"}')
                self.assertEqual(
                    J.request("/nodes/test-node/print", data=b"type=gravo", timeout=5),
                    b'{"id": "7"}',
                )

        get, post = urlopen.call_args_list
        self.assertEqual(get.args[0].full_url, "https://print.invalid/jobs/7")
        self.assertEqual(get.args[0].get_method(), "GET")
        self.assertEqual(get.args[0].get_header("X-secret-key"), "secret")
        self.assertEqual(get.kwargs, dict(timeout=60))
        self.assertEqual(
            post.args[0].full_url, "https://print.invalid/nodes/test-node/print"
        )
        self.assertEqual(post.args[0].get_method(), "POST")
        self.assertEqual(post.args[0].data, b"type=gravo")
        self.assertEqual(post.args[0].get_header("X-secret-key"), "secret")
        self.assertEqual(post.kwargs, dict(timeout=5))

    def test_guard(self):
        payload = dict(text=TEXT, dry_run=True, check_path=True, record=True)

        guarded = J.guard(payload)
        self.assertEqual(
            guarded,
            dict(text=TEXT, dry_run=True, check_path=False, record=False, debug=True),
        )

        # the payload of the caller is left as it was
        self.assertEqual(payload["check_path"], True)
        self.assertEqual(payload["record"], True)

        guarded = J.guard(dict(text=TEXT, dry_run=True, debug=False))
        self.assertEqual(
            guarded,
            dict(text=TEXT, dry_run=True, check_path=False, record=False, debug=True),
        )

    def test_guard_refused(self):
        with self.assertRaises(RuntimeError) as context:
            J.guard(dict(text=TEXT))
        self.assertEqual(
            str(context.exception), "refusing a payload without dry_run=true"
        )

        # only a literal true is a dry run
        for value in (None, False, 0, 1, 1.0, "true", "True", "1", [True], {"x": 1}):
            with self.assertRaises(RuntimeError):
                J.guard(dict(text=TEXT, dry_run=value, check_path=False))

        # nor can anything but a payload object get through, a serialized
        # payload included
        for payload in ('{"dry_run": true}', [["dry_run", True]], None):
            with self.assertRaises(AttributeError):
                J.guard(payload)

    def test_build_payload(self):
        self._mapping()

        line = [["Roman 4L", "D"], [M.EMOJI_FONT, "A B"]]
        payload = J.build_payload(self._case(font_size=4.5, lines=["AB C", line]))
        self.assertEqual(
            payload,
            dict(
                text=[
                    ["Helvetica 4L", "AB C"],
                    [None, "\n"],
                    ["Roman 4L", "D"],
                    ["1101.coracao", "a"],
                    ["HELVETICA 4L", " "],
                    ["1102.estrela", "a"],
                ],
                font="Helvetica 4L",
                font_size=4.5,
                width=70,
                height=70,
                margins=[5, 5, 5, 5],
                dry_run=True,
                record=False,
                check_path=False,
                debug=True,
            ),
        )

        # the payload is already the one the guard lets through
        self.assertEqual(J.guard(payload), payload)

    def test_build_payload_emojis(self):
        self._mapping()

        # the emojis out of the mapping are dropped, like Signatur does,
        # and the typed lines follow the lines of the text
        case = self._case(
            font=M.EMOJI_FONT,
            font_size=6,
            lines=["AB", [[M.EMOJI_FONT, "C ."]]],
            typed=["|A"],
        )
        payload = J.build_payload(case)
        self.assertEqual(payload["font"], None)
        self.assertEqual(
            payload["text"],
            [
                ["1101.coracao", "a"],
                ["1102.estrela", "a"],
                [None, "\n"],
                ["1103.infinito", "a"],
                ["HELVETICA 4L", " "],
                [None, "\n"],
                ["2105.special", "a"],
                ["1101.coracao", "a"],
            ],
        )

    def test_build_payload_extra_fonts(self):
        self._mapping()
        path = os.path.join(self.temp_dir, "font.f3s")
        with open(path, "wb") as file:
            file.write(b"\x00F3S\xff")

        payload = J.build_payload(self._case(extra_fonts={"MY FONT": path}))
        self.assertEqual(
            payload["extra_fonts"],
            {"MY FONT": base64.b64encode(b"\x00F3S\xff").decode("ascii")},
        )

        payload = J.build_payload(self._case(extra_fonts={}))
        self.assertNotIn("extra_fonts", payload)

    def test_submit(self):
        ids = [self._json(dict(id="job-1")), self._json(dict(id="job-2"))]
        self._serve({"/nodes/test-node/print": ids})

        payload = dict(text=TEXT, font="Helvetica 4L", dry_run=True, check_path=True)
        self.assertEqual(J.submit(payload, name="f3s-match-probe"), "job-1")
        self.assertEqual(J.submit(payload), "job-2")

        (path, body), (_path, unnamed) = self.requests
        self.assertEqual(path, "/nodes/test-node/print")
        self.assertEqual(
            self._fields(body),
            dict(
                type="gravo",
                name="f3s-match-probe",
                data=dict(
                    text=TEXT,
                    font="Helvetica 4L",
                    dry_run=True,
                    check_path=False,
                    record=False,
                    debug=True,
                ),
            ),
        )
        self.assertEqual(sorted(self._fields(unnamed)), ["data", "type"])

    def test_submit_refused(self):
        self._serve(dict())

        for payload in (
            dict(text=TEXT),
            dict(text=TEXT, dry_run=False),
            dict(text=TEXT, dry_run="true"),
        ):
            with self.assertRaises(RuntimeError):
                J.submit(payload, name="f3s-match-probe")
        self.assertEqual(self.requests, [])

    def test_submit_serialized(self):
        self._serve(dict())

        # a guard that lets everything through is still caught by the
        # check of the serialized body
        J.guard = lambda payload: payload
        for payload in (
            dict(text=TEXT),
            dict(text=TEXT, dry_run=False),
            dict(text=TEXT, dry_run=1),
            dict(text=TEXT, dry_run="true"),
            dict(text=TEXT, dry_run=True, check_path=True),
            dict(text=TEXT, dry_run=True, check_path=1),
        ):
            with self.assertRaises(RuntimeError) as context:
                J.submit(payload)
            self.assertEqual(
                str(context.exception), "guard failure on the serialized body"
            )
        self.assertEqual(self.requests, [])

    def test_wait(self):
        statuses = [
            self._json(dict(id="7", status="queued")),
            self._json(dict(id="7", status="running")),
            self._json(dict(id="7", status="finished")),
        ]
        self._serve({"/jobs/7": statuses})

        with mock.patch.object(time, "sleep") as sleep:
            job = J.wait("7", timeout=60)
        self.assertEqual(job, dict(id="7", status="finished"))
        self.assertEqual(sleep.call_args_list, [mock.call(J.POLL_INTERVAL)] * 2)
        self.assertEqual(len(self.requests), 3)

    def test_wait_done(self):
        for status in ("finished", "failed", "error", "canceled", "cancelled"):
            self._serve({"/jobs/7": self._json(dict(status=status))})
            with mock.patch.object(time, "sleep") as sleep:
                self.assertEqual(J.wait("7"), dict(status=status))
            self.assertEqual(sleep.call_count, 0)

    def test_wait_timeout(self):
        self._serve({"/jobs/7": self._json(dict(status="running"))})

        clock = itertools.count(0, 30)
        with mock.patch.object(time, "sleep"):
            with mock.patch.object(time, "time", side_effect=clock):
                with self.assertRaises(RuntimeError) as context:
                    J.wait("7", timeout=60)
        self.assertEqual(str(context.exception), "timeout waiting for job 7")
        self.assertEqual(len(self.requests), 1)

    def test_download(self):
        files = [
            dict(name="composition.png"),
            dict(name="engraving.png"),
            dict(name="payload.json"),
            dict(name="viewport.png"),
            dict(name="../composition.png"),
        ]
        self._serve(
            {
                "/jobs/7/files": self._json(files),
                "/jobs/7/files/composition.png": b"composition",
                "/jobs/7/files/engraving.png": b"engraving",
                "/jobs/7/files/payload.json": b"{}",
            }
        )

        saved = J.download("7", self.temp_dir, "probe")
        self.assertEqual(
            saved,
            [
                os.path.join(self.temp_dir, "probe-composition.png"),
                os.path.join(self.temp_dir, "probe-engraving.png"),
                os.path.join(self.temp_dir, "probe-result.json"),
            ],
        )
        self.assertEqual(self._read("probe-composition.png"), b"composition")
        self.assertEqual(self._read("probe-engraving.png"), b"engraving")
        self.assertEqual(self._read("probe-result.json"), b"{}")

        # only the files of the job that are used are requested
        self.assertEqual(
            [path for path, _data in self.requests],
            [
                "/jobs/7/files",
                "/jobs/7/files/composition.png",
                "/jobs/7/files/engraving.png",
                "/jobs/7/files/payload.json",
            ],
        )
        self.assertEqual(
            sorted(os.listdir(self.temp_dir)),
            ["probe-composition.png", "probe-engraving.png", "probe-result.json"],
        )

    def test_download_quoted(self):
        self._serve(
            {
                "/jobs/8/files": self._json([dict(name="job result.json")]),
                "/jobs/8/files/job%20result.json": b"{}",
            }
        )

        saved = J.download("8", self.temp_dir, "probe")
        self.assertEqual(saved, [os.path.join(self.temp_dir, "probe-result.json")])

        self._serve({"/jobs/9/files": self._json([])})
        self.assertEqual(J.download("9", self.temp_dir, "probe"), [])

    def test_collect(self):
        # the files of previous jobs of both cases (a retry) and of a case
        # that is not collected
        for name in ("a", "b", "c"):
            for target in ("composition.png", "engraving.png", "result.json"):
                self._write("%s-%s" % (name, target), "stale")
        previous = dict(
            b=dict(job_id="0", status="finished", files=["b-composition.png"]),
            c=dict(job_id="3", status="finished", files=["c-composition.png"]),
        )
        self._write("jobs.json", json.dumps(previous))
        self._serve(
            {
                "/jobs/1": self._json(dict(status="finished")),
                "/jobs/1/files": self._json([dict(name="composition.png")]),
                "/jobs/1/files/composition.png": b"composition",
                "/jobs/2": self._json(dict(status="failed")),
            }
        )

        with mock.patch.object(sys, "stdout", io.StringIO()) as stdout:
            results = J.collect([("a", "1"), ("b", "2")], self.temp_dir)
        self.assertEqual(
            results,
            dict(
                a=dict(job_id="1", status="finished", files=["a-composition.png"]),
                b=dict(job_id="2", status="failed", files=[]),
            ),
        )
        self.assertEqual(
            [line.split() for line in stdout.getvalue().splitlines()],
            [["[1/2]", "finished", "a", "1"], ["[2/2]", "failed", "b", "2"]],
        )

        # the failed job leaves no screenshot of its previous job
        self.assertEqual(
            sorted(os.listdir(self.temp_dir)),
            [
                "a-composition.png",
                "c-composition.png",
                "c-engraving.png",
                "c-result.json",
                "jobs.json",
            ],
        )
        self.assertEqual(self._read("a-composition.png"), b"composition")

        with open(os.path.join(self.temp_dir, "jobs.json"), encoding="utf-8") as file:
            jobs = json.load(file)
        self.assertEqual(jobs, dict(previous, **results))

    def test_collect_timeout(self):
        for target in ("composition.png", "engraving.png", "result.json"):
            self._write("a-%s" % target, "stale")
        self._serve({"/jobs/1": self._json(dict(status="running"))})

        # a job that is not waited for leaves no screenshot of the
        # previous job of its case either
        clock = itertools.count(0, 30)
        with mock.patch.object(time, "sleep"):
            with mock.patch.object(time, "time", side_effect=clock):
                with self.assertRaises(RuntimeError):
                    J.collect([("a", "1")], self.temp_dir)
        self.assertEqual(os.listdir(self.temp_dir), [])

    def test_main_fetch(self):
        run = os.path.join(self.temp_dir, "run")
        captures = dict(
            a=dict(job=dict(id="1")),
            b=dict(),
            c=dict(job=None),
            d=dict(job=dict(id="4")),
        )
        self._write(
            os.path.join("run", "capture.json"), json.dumps(dict(cases=captures))
        )

        with mock.patch.object(J, "collect") as collect:
            code, _output = self._main(["gravo_job.py", "fetch", run])
        self.assertEqual(code, None)
        collect.assert_called_once_with([("a", "1"), ("d", "4")], run)

    def test_main_fetch_empty(self):
        run = os.path.join(self.temp_dir, "run")
        captures = dict(a=dict(), b=dict(job=None))
        self._write(
            os.path.join("run", "capture.json"), json.dumps(dict(cases=captures))
        )

        code, _output = self._main(["gravo_job.py", "fetch", run])
        self.assertEqual(
            code, "no submitted jobs in capture.json, run capture.js with --submit"
        )

    def test_main_submit(self):
        self._mapping()
        self._fonts({"HELVETICA 4L": {ord("A"): CAP, ord("B"): CAP}})
        path = os.path.join(self.temp_dir, "font.f3s")
        with open(path, "wb") as file:
            file.write(b"F3S")
        cases = [self._case(extra_fonts={"HELVETICA 4L": path})]
        cases_path = self._write("cases.json", json.dumps(cases))
        run = os.path.join(self.temp_dir, "run")
        self._serve(
            {
                "/nodes/test-node/print": self._json(dict(id="j1")),
                "/jobs/j1": self._json(dict(status="finished")),
                "/jobs/j1/files": self._json([dict(name="composition.png")]),
                "/jobs/j1/files/composition.png": b"composition",
            }
        )

        code, output = self._main(["gravo_job.py", "submit", cases_path, run])
        self.assertEqual(code, None)
        self.assertEqual(
            [line.split() for line in output.splitlines()],
            [["queued", "probe", "j1"], ["[1/1]", "finished", "probe", "j1"]],
        )

        # the job sent is a dry run with the font file inline
        path, body = self.requests[0]
        self.assertEqual(path, "/nodes/test-node/print")
        fields = self._fields(body)
        self.assertEqual(fields["type"], "gravo")
        self.assertEqual(fields["name"], "f3s-match-probe")
        self.assertEqual(fields["data"]["dry_run"], True)
        self.assertEqual(fields["data"]["check_path"], False)
        self.assertEqual(fields["data"]["record"], False)
        self.assertEqual(
            fields["data"]["extra_fonts"],
            {"HELVETICA 4L": base64.b64encode(b"F3S").decode("ascii")},
        )

        # the payload sent is kept with the font names only
        with open(os.path.join(run, "probe-sent.json"), encoding="utf-8") as file:
            sent = json.load(file)
        self.assertEqual(sent, dict(fields["data"], extra_fonts=["HELVETICA 4L"]))
        self.assertEqual(
            sorted(os.listdir(run)),
            ["jobs.json", "probe-composition.png", "probe-sent.json"],
        )

    def test_main_submit_plan(self):
        self._mapping()
        self._fonts({"HELVETICA 4L": {ord("A"): CAP, ord("B"): CAP}})
        cases_path = self._write("cases.json", json.dumps([self._case()]))
        run = os.path.join(self.temp_dir, "run")
        self._serve(dict())

        code, output = self._main(["gravo_job.py", "submit", cases_path, run, "--plan"])
        self.assertEqual(code, None)
        name, data = output.strip().split(" ", 1)
        self.assertEqual(name, "probe")
        self.assertEqual(
            json.loads(data),
            dict(J.build_payload(self._case()), extra_fonts=None),
        )

        # nothing is sent nor written
        self.assertEqual(self.requests, [])
        self.assertEqual(os.listdir(run), [])

    def test_main_submit_refused(self):
        self._mapping()
        self._fonts({"HELVETICA 4L": {ord("A"): CAP, ord("B"): CAP}})
        cases = [
            self._case(),
            self._case(name="wide", lines=["A" * 14]),
            self._case(name="missing", lines=["AÃ"]),
        ]
        cases_path = self._write("cases.json", json.dumps(cases))
        run = os.path.join(self.temp_dir, "run")
        self._serve(dict())

        # no case is sent when any of them has a problem
        with mock.patch.object(J, "submit") as submit:
            code, _output = self._main(["gravo_job.py", "submit", cases_path, run])
        self.assertEqual(
            code.splitlines(),
            [
                "refusing to submit:",
                "  wide: line 1 is 59.90 mm wide for a 60.00 mm area",
                "  missing: 'Ã' has no F3S glyph in Helvetica 4L",
            ],
        )
        self.assertEqual(submit.call_count, 0)
        self.assertEqual(self.requests, [])
