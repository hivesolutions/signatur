#!/usr/bin/env python3

"""
Compares the visible Signatur viewport with the Gravostyle composition
screenshot gravo-pilot took for the same dry run job, glyph by glyph in
plate millimetres, and exports the evidence as an HTML report.

- the Gravostyle glyphs are located on composition.png by template
  matching their exact F3S strokes (scaled by m[0] units per font size)
  line by line, the screenshot being calibrated in mm from the white
  plate rectangle whose size is the payload width and height
- the viewport glyphs come from the character boxes capture.js recorded
  plus the outline bounds of the TTF that rendered each character, which
  must be the very file the browser loaded (same SHA-256)

For every case and viewport capture it reports the spacing error (glyph
centre error after removing the mean offset of the line), the line width
error (first to last glyph centre distance), the baseline error of every
line, the absolute centre error (which also holds the line centring) and
the template match score of the F3S strokes on the engraving.

Usage:
    python measure.py --viewport after=RUN_DIR --out REPORT_DIR
    python measure.py --viewport before=OLD_DIR --viewport after=RUN_DIR
        --gravo RUN_DIR --check check-roman4l.json --out REPORT_DIR

Requirements:
    pip install fonttools numpy pillow scipy
"""

import io
import os
import sys
import json
import html
import base64
import argparse
import datetime
import subprocess

import numpy
from PIL import Image, ImageDraw
from scipy import ndimage
from fontTools.ttLib import TTFont

import f3s_model as M

# the css pixels per mm of the viewport at zoom 1 (VIEWPORT_SCALE)
VIEWPORT_SCALE = 3.0

THRESHOLDS = dict(
    spacing_mean=0.10, spacing_max=0.30, width=0.35, baseline=0.30, match=0.60
)

# the match score under which a located glyph is not trusted, its F3S
# strokes not being found where expected on the engraving
GLYPH_MATCH = 0.5

# the step difference (mm) between consecutive glyphs worth listing
STEP_NOTE = 0.15

_TTF = dict()


def ttf(path):
    if not path in _TTF:
        _TTF[path] = TTFont(path)
    return _TTF[path]


class Screenshot(object):
    """
    Gravostyle composition screenshot calibrated in mm through the white
    plate rectangle, whose size in mm is the payload width and height.
    """

    def __init__(self, path, width_mm, height_mm):
        self.path = path
        self.image = Image.open(path).convert("RGB")
        self.pixels = numpy.asarray(self.image).astype(int)
        self.width_mm = width_mm
        self.height_mm = height_mm
        white = (self.pixels > 250).all(axis=2)
        columns = white.sum(axis=0)
        rows = white.sum(axis=1)
        xs = numpy.where(columns > columns.max() * 0.5)[0]
        ys = numpy.where(rows > rows.max() * 0.5)[0]
        # the white interior sits inside a one pixel border, the plate
        # edge being at the middle of that border pixel
        self.x0, self.x1 = xs.min() - 0.5, xs.max() + 1.5
        self.y0, self.y1 = ys.min() - 0.5, ys.max() + 1.5
        self.px_mm_x = (self.x1 - self.x0) / width_mm
        self.px_mm_y = (self.y1 - self.y0) / height_mm

    def to_mm(self, x, y):
        return (x - self.x0) / self.px_mm_x, (y - self.y0) / self.px_mm_y

    def to_px(self, x_mm, y_mm):
        return self.x0 + x_mm * self.px_mm_x, self.y0 + y_mm * self.px_mm_y

    def ink(self, margins, guard_px=3):
        """
        Returns the ink mask inside the margin box, without the dashed
        margin lines themselves.
        """

        left, right, top, bottom = margins
        dark = (self.pixels < 140).all(axis=2)
        mask = numpy.zeros_like(dark)
        x_a, y_a = self.to_px(left, top)
        x_b, y_b = self.to_px(self.width_mm - right, self.height_mm - bottom)
        x_a, y_a = int(round(x_a)) + guard_px, int(round(y_a)) + guard_px
        x_b, y_b = int(round(x_b)) - guard_px, int(round(y_b)) - guard_px
        mask[max(0, y_a) : y_b + 1, max(0, x_a) : x_b + 1] = True
        return dark & mask

    def bands(self, ink, size, gap_px=2):
        """
        Splits the ink in horizontal line bands, folding the bands too
        short to be a line (the marker dots of the family emojis drawn
        above the figure) into the band right below them.
        """

        rows = ink.any(axis=1)
        bands, start = [], None
        for index, value in enumerate(rows):
            if value and start == None:
                start = index
            elif not value and not start == None:
                bands.append([start, index - 1])
                start = None
        if not start == None:
            bands.append([start, len(rows) - 1])
        merged = []
        for band in bands:
            if merged and band[0] - merged[-1][1] <= gap_px:
                merged[-1][1] = band[1]
            else:
                merged.append(band)
        folded, pending = [], None
        for band in merged:
            if band[1] - band[0] < 0.2 * size * self.px_mm_y:
                pending = band if pending == None else [pending[0], band[1]]
                continue
            if pending != None:
                band = [pending[0], band[1]]
                pending = None
            folded.append(band)
        return folded


def glyph_template(glyph, unit_px, line_px=2):
    """
    Renders the glyph strokes into a boolean template, returning it with
    its padding, the row of the baseline and the stroke left (F3S units
    from the pen) that the template left edge stands for.
    """

    lines = M.polylines(glyph)
    if not lines:
        return None
    metrics = glyph["metrics"]
    xs = [x for line in lines for x, _y in line]
    ys = [y - metrics[4] for line in lines for _x, y in line]
    pad = 3
    width = int((max(xs) - min(xs)) * unit_px) + 2 * pad + 2
    height = int((max(ys) - min(ys)) * unit_px) + 2 * pad + 2
    image = Image.new("1", (width, height), 0)
    draw = ImageDraw.Draw(image)
    for line in lines:
        points = [
            (
                pad + (x - min(xs)) * unit_px,
                pad + (max(ys) - (y - metrics[4])) * unit_px,
            )
            for x, y in line
        ]
        if len(points) == 1:
            points = points * 2
        draw.line(points, fill=1, width=line_px)
    return (
        numpy.asarray(image, dtype=bool),
        pad,
        pad + max(ys) * unit_px,
        min(xs) - metrics[2],
    )


def match(ink, template, baseline_px, x_guess, search_px, vertical_px=3):
    """
    Slides the template around the guessed stroke left and baseline and
    returns the sub pixel stroke left with the best overlap, its score
    (the share of the template strokes found on the engraving) and the
    vertical offset (px) of the best overlap from the guessed baseline.
    """

    tpl, pad, tpl_baseline, _left = template
    tpl_dilated = ndimage.binary_dilation(tpl, iterations=1)
    ink_dilated = ndimage.binary_dilation(ink, iterations=1)
    height, width = tpl.shape
    total = float(tpl.sum())
    best, scores = None, dict()
    for dy in range(-vertical_px, vertical_px + 1):
        top = int(round(baseline_px - tpl_baseline)) + dy
        if top < 0 or top + height > ink.shape[0]:
            continue
        for dx in range(-search_px, search_px + 1):
            left = int(round(x_guess)) - pad + dx
            if left < 0 or left + width > ink.shape[1]:
                continue
            window = ink_dilated[top : top + height, left : left + width]
            hit = (tpl & window).sum() / total
            raw = ink[top : top + height, left : left + width]
            back = (raw & tpl_dilated).sum() / max(1.0, float(raw[tpl_dilated].size))
            score = hit + 0.25 * back
            scores[(dy, dx)] = score
            if best == None or score > best[0]:
                best = (score, dy, dx, hit)
    if best == None:
        return None
    score, dy, dx, hit = best
    left_score, right_score = scores.get((dy, dx - 1)), scores.get((dy, dx + 1))
    shift = 0.0
    if left_score != None and right_score != None:
        denominator = left_score - 2 * score + right_score
        if denominator < 0:
            shift = 0.5 * (left_score - right_score) / denominator
    return int(round(x_guess)) + dx + shift, hit, dy


def walk(shot, sub, line, font, mapping, size, baseline_px, vertical_px):
    """
    Walks a line from left to right locating every glyph around the
    position the F3S model predicts from the previous glyph found, the
    first one being seeded by the left edge of the band ink, returning
    the glyphs (centre in mm, plate coordinates of the main ink centre,
    plus the match score and vertical offset of each).
    """

    columns = numpy.nonzero(sub.any(axis=0))[0]
    ink_left_px, pending, previous, located = None, 0.0, None, False
    result = []
    for element_font, char in M.elements(line, font):
        glyph = M.resolve(element_font, char, mapping)
        if glyph == None:
            result.append(dict(char=char, centre=None, missing=True))
            continue
        unit_mm = size / M.size_units(glyph)
        unit_px = unit_mm * shot.px_mm_x
        if previous != None:
            previous_glyph, previous_unit = previous
            pending += (
                previous_glyph["metrics"][6] * previous_unit
                - glyph["metrics"][2] * unit_mm
            ) * shot.px_mm_x
        previous = (glyph, unit_mm)
        template = None if char.isspace() else glyph_template(glyph, unit_px)
        if template == None:
            result.append(dict(char=char, centre=None))
            continue

        # the template left edge is the stroke left, which sits that many
        # units right of the ink left (-m[2] from the pen) of the glyph
        offset_px = (template[3] + glyph["metrics"][2]) * unit_px
        guess = ink_left_px + pending + offset_px if located else columns.min() + 0.5
        search_px = int(max(4, round(0.1 * size * shot.px_mm_x)))
        found = match(
            sub, template, baseline_px, guess, search_px, vertical_px=vertical_px
        )
        if found == None:
            result.append(dict(char=char, centre=None))
            continue
        x_px, hit, dy = found
        stroke_left = shot.to_mm(x_px, 0)[0]
        box = M.main_ink(glyph)
        centre = stroke_left + ((box[0] + box[2]) / 2.0 - template[3]) * unit_mm
        result.append(dict(char=char, centre=centre, hit=float(hit), dy=dy))
        ink_left_px, pending, located = x_px - offset_px, 0.0, True
    return result


def gravostyle_lines(shot, payload, lines, font, mapping):
    """
    Locates every glyph of every line on the composition, returning per
    line the glyphs and the baseline (mm, plate coordinates).

    The baseline is first estimated as the most common bottom row of the
    ink columns (where most text glyphs sit) and then refined by a wide
    vertical template search, as the bottoms of emojis and script glyphs
    are rarely flat, before the glyphs are located again around it.
    """

    size = payload["font_size"]
    ink = shot.ink(payload["margins"])
    bands = shot.bands(ink, size)
    out = []
    for band, line in zip(bands, lines):
        margin = int(0.6 * size * shot.px_mm_x)
        top_row = max(0, band[0] - margin)
        bottom_row = min(ink.shape[0], band[1] + 1 + margin)
        mask = numpy.zeros_like(ink)
        mask[band[0] : band[1] + 1] = True
        sub = (ink & mask)[top_row:bottom_row]

        columns = numpy.nonzero(sub.any(axis=0))[0]
        bottoms = [numpy.nonzero(sub[:, column])[0].max() for column in columns]
        values, counts = numpy.unique(bottoms, return_counts=True)
        baseline_px = values[counts.argmax()] + 0.5

        wide = int(max(3, round(0.3 * size * shot.px_mm_y)))
        first = walk(shot, sub, line, font, mapping, size, baseline_px, wide)
        offsets = [
            glyph["dy"] for glyph in first if glyph.get("hit", 0.0) >= GLYPH_MATCH
        ]
        if offsets:
            baseline_px += float(numpy.median(offsets))
        result = walk(shot, sub, line, font, mapping, size, baseline_px, 3)
        out.append(
            dict(glyphs=result, baseline=shot.to_mm(0, top_row + baseline_px)[1])
        )
    return out, bands


def viewport_lines(entry, width_mm, font, f3s, root):
    """
    Returns the viewport lines as per glyph centres and baselines (mm,
    plate coordinates) from the character boxes and the TTF outlines,
    plus the TTF files that rendered them.
    """

    plate = entry["plate"]
    px_mm = plate["width"] / float(width_mm)
    # the font size and the line height are css pixels before the zoom
    # transform of the viewport while the boxes are measured after it
    zoom = px_mm / VIEWPORT_SCALE
    size_px = entry["fontSize"] * zoom
    line_px = entry["lineHeight"] * zoom
    lines = [dict(glyphs=[], baseline=None)]
    fonts = set()
    for span in entry["spans"]:
        if span["char"] == "\n":
            lines.append(dict(glyphs=[], baseline=None))
            continue
        if span["display"] == "none":
            continue
        family = span.get("font") or font
        path = M.ttf_for(family, f3s=f3s, root=root)
        fonts.add(path)
        face = ttf(path)
        cmap = face.getBestCmap()
        glyf = face["glyf"]
        upm = float(face["head"].unitsPerEm)
        os2 = face["OS/2"]
        use_typo = bool(os2.fsSelection & (1 << 7))
        ascent = os2.sTypoAscender if use_typo else face["hhea"].ascent
        descent = -(os2.sTypoDescender if use_typo else face["hhea"].descent)
        name = cmap.get(ord(span["char"].replace(" ", " ")))
        centre = None
        if name != None:
            glyph = glyf[name]
            glyph.recalcBounds(glyf)
            if glyph.numberOfContours:
                centre_px = (
                    span["left"] + (glyph.xMin + glyph.xMax) / 2.0 * size_px / upm
                )
                centre = (centre_px - plate["left"]) / px_mm
        # the baseline sits half the leading below the top of the line
        # box plus the ascent, the leading being the line height minus
        # the content area (ascent plus descent) of the font
        content = (ascent + descent) * size_px / upm
        baseline_px = span["top"] + (line_px - content) / 2.0 + ascent * size_px / upm
        if lines[-1]["baseline"] == None:
            lines[-1]["baseline"] = (baseline_px - plate["top"]) / px_mm
        lines[-1]["glyphs"].append(
            dict(char=span["char"], centre=centre, missing=name == None)
        )
    return lines, sorted(fonts)


def verify_fonts(paths, served):
    """
    Checks that every TTF about to be measured is the file the browser
    loaded (by SHA-256), raising otherwise (a stale server or the wrong
    `--root`), and returns the font entries of the report.
    """

    entries = []
    for path in paths:
        sha256 = M.file_sha256(path)
        loaded = served.get("/static/fonts/%s" % os.path.basename(path))
        if loaded and loaded != sha256:
            raise RuntimeError(
                "%s is not the font the viewport loaded (sha256 %s, served %s)"
                % (path, sha256, loaded)
            )
        entries.append(dict(path=path, sha=sha256[:12], verified=loaded == sha256))
    return entries


def compare(gravo, view, expected):
    shown = sum(len(line["glyphs"]) for line in view)
    if shown < expected:
        return dict(trimmed=True, shown=shown, expected=expected)
    absolute, spacing, widths, baselines, worst, steps = [], [], [], [], [], []
    for index, (line_g, line_v) in enumerate(zip(gravo, view)):
        pairs = [
            (g, v)
            for g, v in zip(line_g["glyphs"], line_v["glyphs"])
            if g.get("centre") != None
            and v.get("centre") != None
            and g["char"] == v["char"]
            and g.get("hit", 0.0) >= GLYPH_MATCH
        ]
        if not pairs:
            continue
        errors = numpy.array([v["centre"] - g["centre"] for g, v in pairs])
        aligned = errors - errors.mean()
        absolute.extend(numpy.abs(errors))
        spacing.extend(numpy.abs(aligned))
        widths.append(
            (pairs[-1][1]["centre"] - pairs[0][1]["centre"])
            - (pairs[-1][0]["centre"] - pairs[0][0]["centre"])
        )
        baselines.append(line_v["baseline"] - line_g["baseline"])
        worst.extend(
            (abs(value), g["char"], index + 1, value)
            for value, (g, _v) in zip(aligned, pairs)
        )

        # the centre to centre steps between consecutive glyphs, whose
        # differences point at the glyph to correct (the same residual
        # next to different neighbours is a property of the glyph)
        for (g_a, v_a), (g_b, v_b) in zip(pairs, pairs[1:]):
            step_g = g_b["centre"] - g_a["centre"]
            step_v = v_b["centre"] - v_a["centre"]
            steps.append(
                dict(
                    pair="%s..%s" % (g_a["char"], g_b["char"]),
                    line=index + 1,
                    gravostyle=float(step_g),
                    difference=float(step_v - step_g),
                )
            )
    hits = [g["hit"] for line in gravo for g in line["glyphs"] if g.get("hit") != None]
    missing = sorted(
        set(
            g["char"]
            for line in view
            for g in line["glyphs"]
            if g.get("missing") and not g["char"].isspace()
        )
    )
    missing_f3s = sorted(
        set(g["char"] for line in gravo for g in line["glyphs"] if g.get("missing"))
    )
    unmatched = [
        dict(char=g["char"], line=index + 1, match=g["hit"])
        for index, line in enumerate(gravo)
        for g in line["glyphs"]
        if g.get("hit") != None and g["hit"] < GLYPH_MATCH
    ]
    if not spacing:
        return dict(trimmed=False, empty=True, shown=shown, expected=expected)
    worst.sort(reverse=True)
    return dict(
        trimmed=False,
        shown=shown,
        expected=expected,
        glyphs=len(spacing),
        spacing_mean=float(numpy.mean(spacing)),
        spacing_max=float(numpy.max(spacing)),
        absolute_mean=float(numpy.mean(absolute)),
        absolute_max=float(numpy.max(absolute)),
        widths=[float(value) for value in widths],
        baselines=[float(value) for value in baselines],
        match=float(numpy.median(hits)) if hits else 0.0,
        match_min=float(numpy.min(hits)) if hits else 0.0,
        worst=[
            dict(char=char, line=line, error=float(value))
            for _abs, char, line, value in worst[:5]
        ],
        missing_in_ttf=missing,
        missing_in_f3s=missing_f3s,
        unmatched=unmatched,
        steps_off=sorted(
            (step for step in steps if abs(step["difference"]) > STEP_NOTE),
            key=lambda step: -abs(step["difference"]),
        )[:8],
    )


def signed(values):
    return "/".join("%+.2f" % value for value in values) or "-"


def verdict(result, thresholds):
    if result.get("trimmed"):
        return "FAIL", [
            "the viewport trims the text (%s of %s glyphs shown)"
            % (result["shown"], result["expected"])
        ]
    if result.get("empty"):
        return "FAIL", ["no glyph could be paired"]
    reasons = []
    if result["match"] < thresholds["match"]:
        reasons.append(
            "low F3S match on the engraving (%.2f), wrong font or size, or Gravostyle resized an overflow"
            % result["match"]
        )
    if result["spacing_mean"] > thresholds["spacing_mean"]:
        reasons.append("spacing mean %.2f mm" % result["spacing_mean"])
    if result["spacing_max"] > thresholds["spacing_max"]:
        places = ", ".join(
            "%r line %s" % (worst["char"], worst["line"])
            for worst in result["worst"][:2]
        )
        reasons.append("spacing max %.2f mm (%s)" % (result["spacing_max"], places))
    if max(abs(value) for value in result["widths"]) > thresholds["width"]:
        reasons.append("line width %s mm" % signed(result["widths"]))
    if max(abs(value) for value in result["baselines"]) > thresholds["baseline"]:
        reasons.append("baseline %s mm" % signed(result["baselines"]))
    if result["unmatched"] and len(result["unmatched"]) * 4 > result["glyphs"]:
        reasons.append(
            "too many glyphs whose F3S strokes are not found on the engraving"
        )
    if result["missing_in_ttf"]:
        reasons.append(
            "previewed with a fallback font: %s" % "".join(result["missing_in_ttf"])
        )
    return ("PASS" if not reasons else "FAIL"), reasons


def plate_crop(shot, scale):
    x0, y0 = shot.to_px(0, 0)
    x1, y1 = shot.to_px(shot.width_mm, shot.height_mm)
    box = (int(round(x0)), int(round(y0)), int(round(x1)), int(round(y1)))
    size = (int(shot.width_mm * scale), int(shot.height_mm * scale))
    return shot.image.crop(box).resize(size, Image.LANCZOS), box


def overlay(shot, margins, box, viewport_plate, size):
    """
    Overlays the Gravostyle ink (red) and the viewport ink (blue) at the
    same mm scale, the overlap in dark purple, inside a grey plate frame.
    """

    ink = shot.ink(margins)[box[1] : box[3], box[0] : box[2]]
    gravo = (
        numpy.asarray(
            Image.fromarray(ink.astype(numpy.uint8) * 255).resize(size, Image.LANCZOS)
        )
        > 90
    )
    view = numpy.asarray(viewport_plate.convert("L").resize(size, Image.LANCZOS)) < 170
    out = numpy.full(gravo.shape + (3,), 255, dtype=numpy.uint8)
    out[gravo] = (226, 46, 46)
    out[view] = (40, 96, 226)
    out[gravo & view] = (72, 22, 96)
    image = Image.fromarray(out)
    ImageDraw.Draw(image).rectangle(
        [0, 0, image.width - 1, image.height - 1], outline=(150, 150, 150), width=2
    )
    return image


class Images(object):
    """
    Writes the report images next to the report (img/) or embeds them in
    the page as data URIs, the screenshots as JPEG and the overlays (flat
    colours) as PNG.
    """

    def __init__(self, out_dir, embed=False):
        self.out_dir = out_dir
        self.embed = embed
        if not embed:
            os.makedirs(os.path.join(out_dir, "img"), exist_ok=True)

    def add(self, image, name, kind="JPEG"):
        buffer = io.BytesIO()
        if kind == "JPEG":
            image.convert("RGB").save(buffer, format="JPEG", quality=85)
        else:
            image.save(buffer, format="PNG", optimize=True)
        extension = "jpg" if kind == "JPEG" else "png"
        if self.embed:
            return "data:image/%s;base64,%s" % (
                kind.lower(),
                base64.b64encode(buffer.getvalue()).decode("ascii"),
            )
        relative = "img/%s.%s" % (name, extension)
        with open(os.path.join(self.out_dir, relative), "wb") as file:
            file.write(buffer.getvalue())
        return relative


def git_head(root):
    try:
        head = subprocess.check_output(
            ["git", "-C", root, "rev-parse", "--short", "HEAD"],
            stderr=subprocess.DEVNULL,
        )
        dirty = subprocess.check_output(
            ["git", "-C", root, "status", "--porcelain", "static/fonts"],
            stderr=subprocess.DEVNULL,
        )
        changes = " + local font changes" if dirty.strip() else ""
        return "%s%s" % (head.decode().strip(), changes)
    except Exception:
        return "no git"


def measure_case(name, captures, gravo_dir, thresholds, scale_px, images):
    # the payload and the job come from the capture that submitted the
    # dry run (the one Signatur really sent), else from the first one
    entries = [
        capture["cases"][name]
        for _label, capture, _directory in captures
        if name in capture["cases"]
    ]
    first = next((entry for entry in entries if entry.get("payload")), entries[0])
    case = first["case"]
    payload = dict(case)
    payload.update(
        dict(
            (key, value)
            for key, value in (first.get("payload") or dict()).items()
            if key in ("width", "height", "margins", "font_size")
        )
    )
    composition = os.path.join(gravo_dir, "%s-composition.png" % name)
    shot = Screenshot(composition, payload["width"], payload["height"])
    mapping = M.load_mapping()
    gravo, bands = gravostyle_lines(shot, payload, case["lines"], case["font"], mapping)
    expected = sum(len(M.elements(line, case["font"])) for line in case["lines"])
    crop, box = plate_crop(shot, scale_px)
    jobs = dict()
    if os.path.exists(os.path.join(gravo_dir, "jobs.json")):
        with open(os.path.join(gravo_dir, "jobs.json"), encoding="utf-8") as file:
            jobs = json.load(file)
    record = dict(
        name=name,
        case=case,
        payload=dict(
            (key, payload[key]) for key in ("width", "height", "margins", "font_size")
        ),
        job=(first.get("job") or dict()).get("id")
        or jobs.get(name, dict()).get("job_id"),
        lines_found=len(bands),
        lines_expected=len(case["lines"]),
        images=dict(
            gravostyle=images.add(crop, "%s-gravostyle" % name),
            composition=images.add(shot.image, "%s-composition" % name),
        ),
        views=[],
    )
    for label, capture, directory in captures:
        entry = capture["cases"].get(name)
        if entry == None:
            continue
        view_case = entry["case"]
        root = capture["meta"]["root"]
        view, fonts = viewport_lines(
            entry,
            view_case["width"],
            view_case["font"],
            view_case.get("f3s", False),
            root,
        )
        fonts = verify_fonts(fonts, capture["meta"].get("fonts", dict()))
        result = compare(gravo, view, expected)
        status, reasons = verdict(result, thresholds)
        plate_path = os.path.join(directory, "%s-plate.png" % name)
        viewport_path = os.path.join(directory, "%s-viewport.png" % name)
        plate = Image.open(plate_path).convert("RGB")
        shown = Image.open(viewport_path).convert("RGB")
        record["views"].append(
            dict(
                label=label,
                status=status,
                reasons=reasons,
                result=result,
                fonts=[
                    dict(font, path=os.path.relpath(font["path"], root))
                    for font in fonts
                ],
                font_size_px=entry["fontSize"],
                line_height_px=entry["lineHeight"],
                images=dict(
                    viewport=images.add(
                        shown.resize(crop.size, Image.LANCZOS),
                        "%s-%s-viewport" % (name, label),
                    ),
                    overlay=images.add(
                        overlay(shot, payload["margins"], box, plate, crop.size),
                        "%s-%s-overlay" % (name, label),
                        "PNG",
                    ),
                ),
            )
        )
    if len(bands) != len(case["lines"]):
        for view in record["views"]:
            view["status"] = "FAIL"
            view["reasons"].insert(
                0,
                "found %s text lines on the composition for %s case lines"
                % (len(bands), len(case["lines"])),
            )
    return record


def fmt(value, digits=2):
    return "-" if value == None else "%.*f" % (digits, value)


def render(records, captures, checks, thresholds, title):
    template_path = os.path.join(M.SCRIPT_DIR, "report.html")
    with open(template_path, encoding="utf-8") as file:
        template = file.read()
    labels = [label for label, _capture, _directory in captures]
    counts = dict((label, [0, 0]) for label in labels)
    rows = []
    for record in records:
        cells = []
        for label in labels:
            view = next(
                (view for view in record["views"] if view["label"] == label), None
            )
            if view == None:
                cells.append("<td>-</td>" * 4)
                continue
            counts[label][0 if view["status"] == "PASS" else 1] += 1
            result = view["result"]
            widths = result.get("widths")
            cells.append(
                "<td class='num'>%s</td><td class='num'>%s</td><td class='num'>%s</td><td><span class='badge %s'>%s</span></td>"
                % (
                    fmt(result.get("spacing_mean")),
                    fmt(result.get("spacing_max")),
                    fmt(max(abs(value) for value in widths) if widths else None),
                    view["status"].lower(),
                    view["status"],
                )
            )
        case = record["case"]
        rows.append(
            "<tr><td><a href='#%s'>%s</a></td><td>%s</td><td class='num'>%s</td>%s</tr>"
            % (
                html.escape(record["name"]),
                html.escape(record["name"]),
                html.escape(case["font"]),
                fmt(record["payload"]["font_size"], 2).rstrip("0").rstrip("."),
                "".join(cells),
            )
        )
    header = "".join("<th colspan='4'>%s</th>" % html.escape(label) for label in labels)
    subheader = "".join(
        "<th>spacing mean</th><th>spacing max</th><th>line width</th><th>verdict</th>"
        for _label in labels
    )
    summary = (
        "<table class='summary'><thead><tr><th rowspan='2'>case</th><th rowspan='2'>font</th><th rowspan='2'>size mm</th>%s</tr><tr>%s</tr></thead><tbody>%s</tbody></table>"
        % (header, subheader, "".join(rows))
    )

    tallies = "".join(
        "<div class='tally'><span class='tally-label'>%s</span><span class='tally-value'>%s / %s</span><span class='tally-note'>cases pass</span></div>"
        % (html.escape(label), passed, passed + failed)
        for label, (passed, failed) in counts.items()
    )

    cards = []
    for record in records:
        case = record["case"]
        text = " / ".join(
            "".join(text for _font, text in M.segments(line, case["font"]))
            for line in case["lines"]
        )
        views = []
        for view in record["views"]:
            result = view["result"]
            if not result.get("trimmed") and not result.get("empty"):
                details = (
                    "spacing mean %s mm, max %s mm &middot; line width %s mm &middot; baseline %s mm &middot; absolute mean %s mm &middot; F3S match %s (min %s)"
                    % (
                        fmt(result.get("spacing_mean")),
                        fmt(result.get("spacing_max")),
                        signed(result.get("widths", [])),
                        signed(result.get("baselines", [])),
                        fmt(result.get("absolute_mean")),
                        fmt(result.get("match")),
                        fmt(result.get("match_min")),
                    )
                )
            else:
                details = html.escape("; ".join(view["reasons"]))
            reasons = "".join(
                "<li>%s</li>" % html.escape(reason) for reason in view["reasons"]
            )
            steps_off = result.get("steps_off") or []
            if steps_off:
                details = "%s &middot; steps off (viewport minus Gravostyle): %s" % (
                    details,
                    html.escape(
                        ", ".join(
                            "%s %+.2f" % (step["pair"], step["difference"])
                            for step in steps_off
                        )
                    ),
                )
            unmatched = result.get("unmatched") or []
            if unmatched:
                details = "%s &middot; not found on the engraving (left out): %s" % (
                    details,
                    html.escape(
                        ", ".join(
                            "%r line %d (%.2f)"
                            % (item["char"], item["line"], item["match"])
                            for item in unmatched
                        )
                    ),
                )
            fonts = ", ".join(
                "%s <code>%s</code>%s"
                % (
                    html.escape(font["path"]),
                    font["sha"],
                    " (the file the browser loaded)" if font.get("verified") else "",
                )
                for font in view["fonts"]
            )
            views.append(
                "<div class='view'><div class='view-head'><span class='badge %s'>%s</span><strong>%s</strong><span class='muted'>font-size %.2fpx, line-height %.2fpx</span></div><p class='metrics'>%s</p>%s<p class='muted small'>TTF rendered: %s</p><div class='figures triple'><figure><img src='%s' alt='Gravostyle composition plate'><figcaption>Gravostyle, gravo-pilot dry run screenshot</figcaption></figure><figure><img src='%s' alt='Signatur viewport %s'><figcaption>Signatur viewport, %s</figcaption></figure><figure><img src='%s' alt='overlay %s'><figcaption>Overlay: <span class='red'>Gravostyle</span> / <span class='blue'>viewport</span> / <span class='purple'>both</span></figcaption></figure></div></div>"
                % (
                    view["status"].lower(),
                    view["status"],
                    html.escape(view["label"]),
                    view["font_size_px"],
                    view["line_height_px"],
                    details,
                    "<ul class='reasons'>%s</ul>" % reasons if reasons else "",
                    fonts,
                    record["images"]["gravostyle"],
                    view["images"]["viewport"],
                    html.escape(view["label"]),
                    html.escape(view["label"]),
                    view["images"]["overlay"],
                    html.escape(view["label"]),
                )
            )
        payload = record["payload"]
        cards.append(
            "<section class='case' id='%s'><header><h3>%s</h3><p class='muted'>%s &middot; %s mm &middot; plate %s x %s mm, margins %s mm &middot; dry run job <code>%s</code> &middot; %s of %s lines found</p><p class='sample'>%s</p></header><details><summary>Full composition.png as captured by gravo-pilot</summary><img class='full' src='%s' alt='full composition screenshot'></details>%s</section>"
            % (
                html.escape(record["name"]),
                html.escape(record["name"]),
                html.escape(case["font"]),
                fmt(payload["font_size"]),
                payload["width"],
                payload["height"],
                "/".join(str(value) for value in payload["margins"]),
                html.escape(str(record["job"] or "-")),
                record["lines_found"],
                record["lines_expected"],
                html.escape(text),
                record["images"]["composition"],
                "".join(views),
            )
        )

    check_html = ""
    if checks:
        rows = []
        for check in checks:
            worst = check["worst"]
            rows.append(
                "<tr><td>%s</td><td class='num'>%s</td><td class='num'>%.2f</td><td class='num'>%.2f</td><td class='num'>%.2f</td><td>%s</td><td><span class='badge %s'>%s</span></td></tr>"
                % (
                    html.escape(os.path.basename(check["ttf"])),
                    check["glyphs"],
                    worst["advance_dev"] * 100,
                    worst["centre_dev"] * 100,
                    worst["height_dev"] * 100,
                    html.escape("".join(check["spacing_off"]) or "-"),
                    "pass" if check["passed"] else "fail",
                    "PASS" if check["passed"] else "FAIL",
                )
            )
        check_html = (
            "<section><h2>Pre-flight metric check</h2><p class='muted'>Offline comparison of each TTF with the F3S model (make_f3s_ttf.py check). It only predicts the result, the proof is the viewport against the dry run screenshots above. Worst deviations in %% of the font size, tolerance %.1f%%.</p><div class='scroll'><table class='summary'><thead><tr><th>TTF</th><th>glyphs</th><th>advance</th><th>centre</th><th>height</th><th>spacing off</th><th>verdict</th></tr></thead><tbody>%s</tbody></table></div></section>"
            % (checks[0]["tolerance"] * 100, "".join(rows))
        )

    provenance = "".join(
        "<li><strong>%s</strong>: %s, Signatur at <code>%s</code> (%s), captured %s</li>"
        % (
            html.escape(label),
            html.escape(capture["meta"]["base_url"]),
            html.escape(capture["meta"]["root"]),
            html.escape(git_head(capture["meta"]["root"])),
            html.escape(capture["meta"]["date"]),
        )
        for label, capture, _directory in captures
    )
    replacements = {
        "{{title}}": html.escape(title),
        "{{date}}": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
        "{{tallies}}": tallies,
        "{{thresholds}}": html.escape(
            "spacing mean <= %.2f mm, spacing max <= %.2f mm, line width <= %.2f mm, baseline <= %.2f mm, F3S match >= %.2f, nothing trimmed"
            % (
                thresholds["spacing_mean"],
                thresholds["spacing_max"],
                thresholds["width"],
                thresholds["baseline"],
                thresholds["match"],
            )
        ),
        "{{provenance}}": provenance,
        "{{summary}}": summary,
        "{{checks}}": check_html,
        "{{cases}}": "".join(cards),
    }
    for key, value in replacements.items():
        template = template.replace(key, value)
    return template


def main():
    parser = argparse.ArgumentParser(
        description="Compare the Signatur viewport with the gravo-pilot dry run screenshots"
    )
    parser.add_argument(
        "--viewport",
        action="append",
        required=True,
        help="LABEL=DIR of a capture.js run, repeatable",
    )
    parser.add_argument(
        "--gravo",
        default=None,
        help="the directory with the compositions, default the first run with them",
    )
    parser.add_argument("--out", required=True, help="the report directory")
    parser.add_argument(
        "--check",
        action="append",
        default=[],
        help="a make_f3s_ttf.py check --json report, repeatable",
    )
    parser.add_argument("--title", default="TTF vs F3S matching report")
    parser.add_argument(
        "--cases", default=None, help="only these comma separated case names"
    )
    parser.add_argument(
        "--embed",
        action="store_true",
        help="embed the images in report.html (one file)",
    )
    for key, value in THRESHOLDS.items():
        parser.add_argument("--%s" % key.replace("_", "-"), type=float, default=value)
    args = parser.parse_args()
    thresholds = dict((key, getattr(args, key)) for key in THRESHOLDS)

    captures = []
    for item in args.viewport:
        label, directory = item.split("=", 1)
        with open(os.path.join(directory, "capture.json"), encoding="utf-8") as file:
            captures.append((label, json.load(file), directory))
    gravo_dir = args.gravo or next(
        (
            directory
            for _label, capture, directory in captures
            if any(
                os.path.exists(os.path.join(directory, "%s-composition.png" % name))
                for name in capture["cases"]
            )
        ),
        captures[0][2],
    )
    names = [
        name
        for name in captures[0][1]["cases"]
        if os.path.exists(os.path.join(gravo_dir, "%s-composition.png" % name))
        and (not args.cases or name in args.cases.split(","))
    ]
    if not names:
        sys.exit(
            "no case has a composition in %s, run gravo_job.py fetch first" % gravo_dir
        )

    os.makedirs(args.out, exist_ok=True)
    images = Images(args.out, embed=args.embed)
    records = []
    for name in names:
        width = captures[0][1]["cases"][name]["case"]["width"]
        record = measure_case(
            name, captures, gravo_dir, thresholds, 8 if width > 40 else 24, images
        )
        records.append(record)
        for view in record["views"]:
            result = view["result"]
            print(
                "%-24s %-7s %-4s spacing %s/%s mm, width %s mm, baseline %s mm, match %s%s"
                % (
                    name,
                    view["label"],
                    view["status"],
                    fmt(result.get("spacing_mean")),
                    fmt(result.get("spacing_max")),
                    signed(result.get("widths", [])),
                    signed(result.get("baselines", [])),
                    fmt(result.get("match")),
                    (" | %s" % "; ".join(view["reasons"])) if view["reasons"] else "",
                ),
                flush=True,
            )
    checks = []
    for path in args.check:
        with open(path, encoding="utf-8") as file:
            checks.append(json.load(file))

    page = render(records, captures, checks, thresholds, args.title)
    with open(os.path.join(args.out, "report.html"), "w", encoding="utf-8") as file:
        file.write(page)
    summary = [
        dict(
            name=record["name"],
            case=record["case"],
            payload=record["payload"],
            job=record["job"],
            views=[
                dict(
                    label=view["label"],
                    status=view["status"],
                    reasons=view["reasons"],
                    result=view["result"],
                    fonts=view["fonts"],
                )
                for view in record["views"]
            ],
        )
        for record in records
    ]
    with open(os.path.join(args.out, "report.json"), "w", encoding="utf-8") as file:
        json.dump(
            dict(thresholds=thresholds, cases=summary),
            file,
            indent=1,
            ensure_ascii=False,
        )
    print("report: %s" % os.path.join(args.out, "report.html"))


if __name__ == "__main__":
    main()
