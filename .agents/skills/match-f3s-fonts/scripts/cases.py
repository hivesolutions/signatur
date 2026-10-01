#!/usr/bin/env python3

"""
Generates and validates the cases of the skill (the compositions sent as
dry runs and captured in the viewport), using the F3S model to predict
how Gravostyle lays them out.

A case is valid when every glyph has an F3S counterpart (else it is not
engraved), every glyph is in the TTF that renders it in the viewport
(else the browser draws a fallback font) and the predicted ink of the
text stays inside the margin box, each line centred on its ink and the
block centred from the first cap top to the last baseline like
Gravostyle does (text past the box is resized by Gravostyle to fit).

Usage:
    python cases.py generate --font "Roman 4L" --size 5 > cases.json
    python cases.py generate --font "Cool Emojis" --size 6 --prefix emojis
    python cases.py check cases.json

Requirements:
    pip install fonttools numpy pillow scipy
"""

import sys
import json
import argparse

from fontTools.ttLib import TTFont

import f3s_model as M

# the share of the margin box that a generated line may fill and the
# safety distance (mm) kept from the margin box by the validation, as
# the model predicts the Gravostyle extents within about 0.1 mm
FILL = 0.9
SAFETY = 0.3

_CMAPS = dict()


def cmap(path):
    if not path in _CMAPS:
        _CMAPS[path] = TTFont(path).getBestCmap()
    return _CMAPS[path]


def line_extents(line, font, size, mapping=None):
    """
    Returns the predicted ink extents of a line in mm relative to the pen
    at its start: (left, right, top, bottom) with top above the baseline
    and bottom below it, None when the line has no ink.
    """

    pen = 0.0
    left, right, top, bottom = None, None, 0.0, 0.0
    for element_font, char in M.elements(line, font):
        glyph = M.resolve(element_font, char, mapping)
        if glyph == None:
            continue
        unit = size / M.size_units(glyph)
        box = M.main_ink(glyph)
        if box != None and not char.isspace():
            left = (
                pen + box[0] * unit if left == None else min(left, pen + box[0] * unit)
            )
            right = (
                pen + box[2] * unit
                if right == None
                else max(right, pen + box[2] * unit)
            )
            top = max(top, box[3] * unit)
            bottom = max(bottom, -box[1] * unit)
        pen += M.advance(glyph) * unit
    if left == None:
        return None
    return left, right, top, bottom


def validate(case, root=None):
    """
    Returns the list of problems of a case, empty for a valid case.
    """

    problems = []
    for key in ("name", "font", "font_size", "lines", "width", "height", "margins"):
        if not key in case:
            problems.append("%s: missing %s" % (case.get("name", "?"), key))
    if problems:
        return problems
    name, font, size = case["name"], case["font"], case["font_size"]
    mapping = M.load_mapping()

    for line in case["lines"]:
        for element_font, char in M.elements(line, font):
            if char == "|":
                problems.append(
                    "%s: '|' cannot travel in the viewport URL, put it in typed lines"
                    % name
                )
            if char.isspace() and element_font != M.EMOJI_FONT:
                continue
            if M.resolve(element_font, char, mapping) == None:
                problems.append(
                    "%s: %r has no F3S glyph in %s" % (name, char, element_font)
                )
            path = M.ttf_for(element_font, f3s=case.get("f3s", False), root=root)
            if not ord(char) in cmap(path):
                problems.append("%s: %r is not in %s" % (name, char, path))

    # predicts the ink of the block placed like Gravostyle places it
    left, right, top, bottom = case["margins"]
    area_width = case["width"] - left - right
    area_height = case["height"] - top - bottom
    extents = [line_extents(line, font, size, mapping) for line in case["lines"]]
    for index, extent in enumerate(extents):
        if extent and extent[1] - extent[0] > area_width - 2 * SAFETY:
            problems.append(
                "%s: line %s is %.2f mm wide for a %.2f mm area"
                % (name, index + 1, extent[1] - extent[0], area_width)
            )
    pitch = M.LINE_PITCH * size
    span = (len(case["lines"]) - 1) * pitch + size
    cap_top = (area_height - span) / 2.0
    ink_top = cap_top - max(0.0, (extents[0] or (0, 0, size, 0))[2] - size)
    ink_bottom = cap_top + span + (extents[-1] or (0, 0, 0, 0))[3]
    if ink_top < SAFETY or ink_bottom > area_height - SAFETY:
        problems.append(
            "%s: the block runs from %.2f to %.2f mm of a %.2f mm area"
            % (name, ink_top, ink_bottom, area_height)
        )
    return problems


def number(value):
    value = float(value)
    return int(value) if value.is_integer() else value


def generate(args):
    """
    Packs the glyphs shared by the TTF and the F3S font (or the provided
    characters) into lines that fit the area, in code point order.
    """

    width, height = (number(value) for value in args.plate.split("x"))
    margins = [number(args.margins)] * 4
    area = width - 2 * args.margins
    mapping = M.load_mapping()
    if args.font == M.EMOJI_FONT:
        # leaves out the pipe emoji, the separator of the text serialized
        # in the viewport URL, which only typed lines can hold
        chars = (args.chars or "".join(sorted(mapping))).replace("|", "")

        # pairs the emojis two per line, a wide emoji getting its own line
        # when the pair would not fit the area
        lines, current = [], ""
        for char in chars:
            candidate = "%s %s" % (current, char) if current else char
            extent = line_extents([[M.EMOJI_FONT, candidate]], args.font, args.size)
            if current and (len(current) > 1 or extent[1] - extent[0] > area * FILL):
                lines.append([[M.EMOJI_FONT, current]])
                candidate = char
            current = candidate
        if current:
            lines.append([[M.EMOJI_FONT, current]])
    else:
        path = M.ttf_for(args.font, f3s=True)
        glyphs = M.load_f3s(args.font)["glyphs"]
        chars = args.chars or "".join(
            chr(code)
            for code in sorted(cmap(path))
            if code in glyphs and code > 32 and not chr(code).isspace()
        )
        lines, current = [], ""
        for char in chars:
            extent = line_extents(current + char, args.font, args.size)
            if current and extent and extent[1] - extent[0] > area * FILL:
                lines.append(current)
                current = ""
            current += char
        if current:
            lines.append(current)

    # splits the lines in cases with as many lines as the area holds
    pitch = M.LINE_PITCH * args.size
    per_case = max(1, int((height - 2 * args.margins - args.size * 1.6) // pitch) + 1)
    per_case = min(per_case, args.lines)
    stem = args.font.lower().replace(" ", "")
    cases = []
    for index in range(0, len(lines), per_case):
        cases.append(
            dict(
                name="%s-%s-%s" % (args.prefix, stem, index // per_case + 1),
                font=args.font,
                font_size=number(args.size),
                lines=lines[index : index + per_case],
                profile=args.profile,
                width=width,
                height=height,
                margins=margins,
                f3s=True,
            )
        )
    return cases


def main():
    parser = argparse.ArgumentParser(
        description="Generate and validate the skill cases"
    )
    modes = parser.add_subparsers(dest="mode", required=True)

    generator = modes.add_parser("generate", help="write coverage cases for a font")
    generator.add_argument("--font", required=True, help="the Signatur font name")
    generator.add_argument("--size", type=float, default=5, help="font size in mm")
    generator.add_argument("--plate", default="70x70", help="plate WIDTHxHEIGHT in mm")
    generator.add_argument("--margins", type=float, default=5, help="margins in mm")
    generator.add_argument("--profile", default="plate", help="the Signatur profile")
    generator.add_argument("--chars", default=None, help="only these characters")
    generator.add_argument("--lines", type=int, default=3, help="most lines per case")
    generator.add_argument("--prefix", default="cov", help="prefix of the case names")

    checker = modes.add_parser("check", help="validate a cases file")
    checker.add_argument("cases", help="the cases JSON file")
    checker.add_argument(
        "--root", default=None, help="the Signatur checkout serving them"
    )

    args = parser.parse_args()
    if args.mode == "generate":
        cases = generate(args)
        problems = [problem for case in cases for problem in validate(case)]
        json.dump(cases, sys.stdout, indent=4, ensure_ascii=False)
        sys.stdout.write("\n")
        if problems:
            sys.exit("generated cases with problems:\n  %s" % "\n  ".join(problems))
        return

    with open(args.cases, encoding="utf-8") as file:
        cases = json.load(file)
    problems = [problem for case in cases for problem in validate(case, root=args.root)]
    for problem in problems:
        print(problem)
    print("%s cases, %s problems" % (len(cases), len(problems)))
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
