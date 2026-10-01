#!/usr/bin/env python3

"""
Offline self test of the skill, needing neither the engraving node nor a
browser: the committed `-f3s.ttf` fonts must be the ones `fonts.json`
builds (byte for byte) and pass the check, the dry run guard must refuse
every payload that is not a dry run and the case validation must catch
a text that overflows the area and a glyph missing in the TTF.

Usage:
    python selftest.py

Requirements:
    pip install fonttools numpy pillow scipy
"""

import os
import sys
import json
import urllib.parse

from fontTools.ttLib import TTFont

import f3s_model as M
import make_f3s_ttf as G
import gravo_job as J
import cases as C


def test_fonts():
    failures = []
    for entry in M.load_manifest():
        path = os.path.join(G.FONTS_DIR, "%s-f3s.ttf" % entry["stem"])
        with open(path, "rb") as file:
            if file.read() != G.build_font(entry):
                failures.append("%s is not the build of fonts.json" % path)
        report = G.check(
            TTFont(path), f3s=M.load_f3s(entry["f3s"]), adjust=entry.get("adjust")
        )
        if not report["passed"]:
            failures.append("%s fails the check" % path)
    return failures


def test_guard():
    sent = []

    def request(path, data=None, timeout=60):
        sent.append(data)
        return json.dumps(dict(id="test")).encode("utf-8")

    J.request = request
    base = dict(text=[["Helvetica 1L", "Ana"]], font="Helvetica 1L", font_size=5)
    failures = []
    for value in (None, False, "true", 1):
        payload = dict(base) if value == None else dict(base, dry_run=value)
        try:
            J.submit(payload)
            failures.append("a payload with dry_run %r was sent" % value)
        except RuntimeError:
            pass
    J.submit(dict(base, dry_run=True, check_path=True, record=True))
    data = json.loads(urllib.parse.parse_qs(sent[-1].decode("utf-8"))["data"][0])
    if not (
        data["dry_run"] is True and data["check_path"] is False and not data["record"]
    ):
        failures.append("check_path or record was sent on")
    return failures


def test_cases():
    case = dict(
        name="test",
        font="Helvetica 4L",
        font_size=5,
        lines=["Tiago AV"],
        width=70,
        height=70,
        margins=[5, 5, 5, 5],
        f3s=True,
    )
    failures = []
    if C.validate(case):
        failures.append("a valid case was refused: %s" % C.validate(case))
    if not C.validate(dict(case, lines=["WWWWWWWWWWWWWWWW"])):
        failures.append("a line wider than the area was accepted")
    if not C.validate(dict(case, font="Roman 4L", lines=["Conceição"])):
        failures.append("a glyph missing in the TTF was accepted")
    return failures


def main():
    failures = []
    for name, test in (
        ("fonts", test_fonts),
        ("guard", test_guard),
        ("cases", test_cases),
    ):
        result = test()
        print("%-6s %s" % (name, "ok" if not result else "FAILED"))
        failures.extend(result)
    for failure in failures:
        print("  %s" % failure)
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
