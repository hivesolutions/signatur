---
name: match-f3s-fonts
description: Tune and verify the Signatur TTF fonts so the viewport preview matches, in size and spacing, what Gravostyle engraves with their F3S counterparts, proving it with the Signatur viewport against gravo-pilot dry run screenshots. Use when adding or changing a text font or a Cool Emojis glyph, when the preview and the engraving disagree, or when asked for evidence of the matching.
argument-hint: <font name, TTF path or "emojis">
allowed-tools: Bash, Read, Edit, Write, Grep, Glob
---

# Match F3S Fonts

The Signatur viewport renders TrueType fonts in the browser while the engraving machine draws the F3S font of the same name through Gravostyle, driven by gravo-pilot on a Colony Print node. This skill measures both, tunes TTF fonts until they lay out like the F3S fonts (advances, ink centres, size and line height) and exports a report with the proof.

## Dry run only (mandatory)

The node drives a real Gravograph laser. Every job sent while using this skill MUST be a dry run, with no exception and no matter who asks for "just one" real job.

- A job without `dry_run: true` engraves the material; `check_path: true` fires the laser light. Never send either.
- Signatur's Engrave confirm modal leaves the Dry run checkbox **unchecked** by default. Never click Engrave (by hand or automation) without ticking it first.
- Only submit through the guarded tools: `scripts/capture.js --submit` ticks Dry run, asserts it is checked and check path is not, and a network guard aborts any print request whose decoded payload lacks `dry_run === true` or sets `check_path`; `scripts/gravo_job.py` refuses any payload without a literal `dry_run: true`, forces `check_path` and `record` off and re-checks the serialized body before sending.
- `capture.js --submit` also refuses a case whose viewport font size differs from the case or whose text is trimmed, and `gravo_job.py submit` a case that `cases.py` predicts to overflow the area: the engraving would then differ from the case.
- If a guard ever blocks or throws, stop and investigate. Never weaken a guard to get a job through.
- Ask the user before writing any font into `static/fonts/` (tune into a scratch directory first).

## The proof rule

The matching is proven only by comparing **the visible Signatur viewport** with **the `composition.png` screenshot gravo-pilot takes of Gravostyle in the dry run** of the same composition, submitted through the viewport's own Engrave button so both sides share the exact payload (text, font size, plate, margins). The offline `check` and the model only predict the result; they are never the evidence.

## Instructions

1. **Scope** `$ARGUMENTS`: which font(s) or emojis, which F3S file (bundled in gravo-pilot or uploaded to Signatur), which characters matter. Ask when unclear.
2. **Self test** with `selftest.py`: the committed `-f3s.ttf` fonts must be the build of `fonts.json`, pass the check, and the guards must hold. Fix any failure before measuring.
3. **Set up** Colony Print access and the local Signatur servers (see Setup).
4. **Pre-flight** the current TTF with `make_f3s_ttf.py check` to see the spacing, size and coverage gaps.
5. **Tune** into a scratch directory: `make_f3s_ttf.py text` for a text font (or `emoji` for Cool Emojis glyphs), then `check` the output (it must PASS).
6. **Serve** the candidate: copy the repo to a scratch root with the candidate fonts and run it on a second port next to the shipped one.
7. **Write cases** with `cases.py generate` (or by hand, see Cases), validate them with `cases.py check`, then run `capture.js --submit` against one server (dry run jobs) plus `capture.js` without `--submit` against the others.
8. **Fetch** the Gravostyle screenshots with `gravo_job.py fetch` (the node reports the whole batch at the end, about 45 s per job).
9. **Measure and report** with `measure.py`, passing every viewport run and the check JSONs. Open `report.html`, review every FAIL against Reading failures, and iterate: retune, capture the viewport again (no `--submit`) and measure against the same screenshots; new dry run jobs are only needed for new cases.
10. **Report** to the user with the numbers and the report, then, once approved, record the font in `fonts.json` (with any measured correction), write it with `make_f3s_ttf.py build`, wire it (Wiring a new font), update `CHANGELOG.md` and run `selftest.py`, `npm run build`, `npm run lint` and `npm test`.

## Setup

### Colony Print

- Base URL `https://print.bemisc.com` (plain http answers 303), header `X-Secret-Key` with the key from `~/.colony-print-key` (or `PRINT_KEY`).
- Node `gravo-gold-std` (Windows PC with Gravostyle Quick and gravo-pilot), printer `gravo`, job type `gravo`.
- `POST /nodes/<node>/print` (form fields `type=gravo`, `data=<json>`) returns `{"id": ...}`; `GET /jobs/<id>` has the `status`; `GET /jobs/<id>/files` lists and `GET /jobs/<id>/files/<name>` returns `composition.png`, `engraving.png` and `payload.json` (the job result with gravo-pilot logs when `debug` is on); `GET /jobs/<id>/payload` is the payload received.
- The node takes every queued job at once and only reports when the whole batch is done; do not call it stalled before about one minute per queued job.
- Payload, exactly as Signatur builds it in `static/js/plugins/modal.js`: `text` as `[font, text]` segments with `[null, "\n"]` between lines (Cool Emojis characters rewritten to `[<engraving glyph>, "a"]` through `coolemojis.mapping.json`, their spaces to `["HELVETICA 4L", " "]`), `font` (null for Cool Emojis), `font_size` in mm (the cap height, fractional part kept), `width` and `height` (machine viewport plus extra padding), `margins` `[left, right, top, bottom]`, `dry_run`, `record`, `check_path`, `debug` and `extra_fonts` (`{name: base64 F3S}` for fonts that are not bundled with gravo-pilot, resolved by Signatur from `static/fonts/f3s/`).

### How gravo-pilot captures the screens

`GravostyleAPI.write_text` (gravo-pilot `app.py`) sets the plate size and margins, selects each font in the Gravostyle dropdown, types the size (comma decimal) and the text, then `_take_screenshot_viewport("composition.png")` grabs the Gravostyle viewport region: a 2512x1009 image with the mm rulers, the white plate rectangle (calibrated in mm by `measure.py` from the payload width and height) and the dashed margin box. It then opens the engraving panel and grabs `engraving.png`. Only when `dry_run` is false does it send the job (or `check_path`). Colony Print returns the images base64 encoded as the job files.

- Bundled F3S fonts live in gravo-pilot `src/gravo_pilot/res/fonts/` (matched by name without case, emojis under `cool-emojis-f3s/`); `extra_fonts` are staged per job and copied into Gravostyle's `Polices` directory.
- Gravostyle orders its font dropdown by the name stored inside each F3S. gravo-pilot before 0.8.1 picked by file name order, so a new F3S whose internal name sorts differently selects the wrong font on such nodes (gravo-gold-std ran 0.8.0 on 2026-10-01). A low F3S match score in the report is the symptom.
- Text that runs past the margin box makes Gravostyle fit it to the box, changing the size. Keep every line inside the area.

### Signatur locally

```bash
npm run user:local    # admin/admin and user/user in config/users.json
PRINT_URL=https://print.bemisc.com PRINT_KEY="$(cat ~/.colony-print-key)" \
ENGRAVE_NODE=gravo-gold-std ENGRAVE_PRINTER=gravo PORT=3123 HOST=127.0.0.1 node app.js
```

- The browser posts the print straight to `PRINT_URL`; the `url`, `engrave_node`, `node` and `key` localStorage keys override the server values (a fresh Playwright context has none).
- Viewport query parameters used by `capture.js`: `profile`, `font`, `font_size`, `margins` (l,r,t,b), `text` (`font:char` joined by `|`, `\n` between lines), `caret=0`, `zoom` and `f3s` (`1` or `0`, always sent so older Signatur versions, where the fonts were opt-in, behave the same).
- The F3S fonts are on by default (the F3S fonts option of the viewport, `f3s=0` turns them off, store mode forces them on), rendering the families of `F3S_FONTS` in `static/js/main.js` with their `-f3s.ttf` faces.
- Candidate fonts without touching the repo: `rsync -a --exclude .git --exclude node_modules ./ $SCRATCH/candidate/`, symlink `node_modules`, copy the candidate TTFs into its `static/fonts/` and run it on port 3124; pass `--root $SCRATCH/candidate` to `capture.js` so `measure.py` reads the right TTFs.
- Playwright: `PLAYWRIGHT_PATH` (the module path, e.g. the mise install) and `CHROMIUM_PATH` (`/usr/bin/chromium`).
- The Python scripts need `fonttools numpy pillow scipy` and a checkout of gravo-native (F3S parser) and gravo-pilot (bundled F3S fonts) next to this repo, or `GRAVO_NATIVE` and `GRAVO_PILOT`.

## The model

Measured on over a hundred dry run jobs (details and numbers in [reference.md](reference.md)):

- **Scale**: `m[0]` F3S units of each glyph are the font size, which is the cap height in mm. It is 5000 for most text glyphs but **not all** (Roman 4L `Ł` 20000, Helvetica 4L `@` 21740, tilde letters 5001 to 5083) and the glyph height for the emojis. Always scale per glyph.
- **Advance**: `-m[2] + m[6]` (the left bearing plus `m[6]`, which counts from the ink left). Ink drawn at `pen - m[2]`, `y = baseline - m[4]`, `m[9]` x `m[10]` the ink box.
- **TTF recipe**: advance `= (-m[2] + m[6]) * 0.7 * upm / m[0]`; shift each outline so its ink centre lands on `(-m[2] + m[9] / 2) * 0.7 * upm / m[0]`; ascent minus descent equals the cap height (keeping their sum); typo metrics on; DSIG dropped. Signatur renders `font_size * 1 / 0.7` (`FONT_SIZE_SCALE`) with `LINE_HEIGHT_SCALE = 1.232` (Gravostyle line pitch 1.76 times the size).
- **Emojis**: a Cool Emojis glyph is scaled to the F3S ink height, sits on its ink bottom, is centred on its ink centre and advances by its F3S advance; the space advances like the Helvetica 4L space (601 units). Family emojis carry a single point marker at full height that is not part of the drawing.
- **Not modelled**: Gravostyle optical kerning (neighbour dependent, not stored in the F3S, residuals up to about 0.2 mm) and line centring on the ink (Gravostyle) versus the advances (viewport), which shows only in the absolute error.
- **Measured corrections**: a few glyphs are set differently from the model by Gravostyle itself (Helvetica 4L `@` sits 0.3 mm tighter before and 0.12 mm after it). When the report shows the same step residual next to different neighbours, correct that glyph with `--adjust` (see [examples.md](examples.md)), verify again against the same screenshots and record it in the `adjust` of `fonts.json`. Never fit corrections to many glyphs at once: on 1129 measured pairs a per glyph model does not generalize (cross validated error equal to the raw one), the residuals being pair specific and near the measurement floor.
- **Not predictable**: the pair residuals (about 0.1 mm at 5 mm) do not follow the ink profiles of the glyphs either (no correlation with the gap between them), so a kerning table cannot be derived from the F3S; do not add one.

## Cases

Cases are a JSON list shared by every script ([examples.md](examples.md) has ready ones):

```json
{"name": "cov1-roman4l", "font": "Roman 4L", "font_size": 4.5, "lines": ["ABCDEFGHIJKLM", "NOPQRSTUVWXYZ"],
 "profile": "plate", "width": 70, "height": 70, "margins": [5, 5, 5, 5], "f3s": true}
```

- A line is a string in the case font or a list of `[font, text]` segments (mixed fonts and emojis).
- `width`, `height` and `margins` must be what the profile sends (plate is 70 x 70 with 5 mm margins, small-medal 20 x 20 with 2.94 mm); use profiles without extra padding.
- Cover the alphabet in both cases, digits, punctuation and the accented letters (`ãçéóú àêíôõ`), a small size (1 to 2 mm), a normal size (5 to 6 mm) and a size near the area limit **without overflowing**; emojis two per line; the glyphs whose `m[0]` is not 5000 (`check` lists odd glyphs as off).
- Zero margins (`"margins": [0, 0, 0, 0]`) make the numbers easier to read against the plate.
- The `|` emoji cannot travel in the URL (it is the separator of the serialized text): put it in `"typed"` lines.

## Determinism

- `fonts.json` lists every generated font: the regular TTF stem, the F3S font, the SHA-256 of the F3S file and the measured corrections. `make_f3s_ttf.py build` regenerates all the `-f3s.ttf` fonts from it byte for byte (the head timestamp of the regular TTF is kept) and refuses an F3S file whose hash changed, as the corrections were measured with the old one; `build --verify` proves the committed fonts are its output.
- `capture.js` records the SHA-256 of every TTF the page loads and `measure.py` refuses to measure a TTF that is not the one the browser rendered (a stale server or the wrong `--root`).
- `cases.py generate` packs the glyphs shared by the TTF and the F3S in code point order, so the same font always gives the same cases, and `cases.py check` predicts every overflow and fallback glyph before a job is sent (it flags exactly the 14 failing cases of the PR #79 evidence).
- The measurement floor: on a 70 mm plate one screenshot pixel is about 0.08 mm and the same pair measured twice differs by about 0.06 mm (median), so differences below 0.1 mm are noise; text that fills the area gives the best relative precision.

## Scripts

All under `scripts/`, run from that directory (Python with the requirements above, Node with Playwright).

| Script | Use |
| --- | --- |
| `selftest.py` | offline self test: committed fonts against `fonts.json`, the check, the dry run guard and the case validation |
| `make_f3s_ttf.py build [--verify] [--output DIR]` | regenerate the `-f3s.ttf` fonts of `fonts.json` into `static/fonts` (or compare with them) |
| `make_f3s_ttf.py text --ttf IN --f3s NAME --output OUT [--scale auto] [--adjust JSON]` | respace a text font after its F3S font (decomposes composites, `--scale` resizes outlines whose cap is not 0.7 em, `--adjust` applies measured per glyph corrections) |
| `make_f3s_ttf.py emoji --ttf coolemojis.ttf [--chars ...] --output OUT` | refit Cool Emojis glyphs (default: the ones off by more than the tolerance) |
| `make_f3s_ttf.py check --ttf TTF (--f3s NAME or --emoji) [--adjust JSON] [--json OUT]` | offline pre-flight, exits 1 when a glyph spacing is off by more than 1.5% of the size |
| `cases.py generate --font NAME --size MM [--plate 70x70] [--margins 5] [--lines 3] [--chars ...]` | coverage cases that fit the area, emojis two per line |
| `cases.py check cases.json [--root DIR]` | validate cases: F3S glyphs, TTF glyphs and the predicted overflow |
| `capture.js cases.json RUN [--base URL] [--label L] [--root DIR] [--submit]` | capture the visible viewport; with `--submit` send the same composition as a guarded dry run |
| `gravo_job.py fetch RUN` | wait for the jobs of a run and download `composition.png` / `engraving.png` |
| `gravo_job.py submit cases.json DIR [--plan]` | direct dry run payloads, only to probe the F3S model (never the proof) |
| `measure.py --viewport L=RUN [...] [--check JSON ...] --out DIR [--embed]` | compare viewport and Gravostyle, write `report.html` (images in `img/`) and `report.json` |
| `f3s_model.py` | the shared model (F3S lookup, per glyph scale, ink box, TTF resolution) |

## Pass criteria

Per case and viewport, measured in plate mm: spacing mean <= 0.10, spacing max <= 0.30, line width error <= 0.35, baseline error <= 0.30, median F3S match >= 0.60, nothing trimmed, no fallback glyph, no line past the margin box. A case whose engraving lost, doubled or swapped a character gets `RETRY` instead: its other lines are measured, the dry run must be submitted again before it counts. The tuned PR #79 fonts reach about 0.01 to 0.09 mm spacing mean (from 0.12 to 4.18 mm before).

## Reading failures

| Symptom | Meaning |
| --- | --- |
| RETRY, a character dropped, doubled or engraved as another | gravo-pilot typed the text wrong (it pastes every character from the clipboard; 4 of about 800 characters on 2026-10-01): submit the dry run again, never tune a font on such a line |
| the engraving runs past the margin box | the text is wider than the area at that size (Gravostyle draws past it or resizes it), pick a smaller size |
| viewport trims the text | the composition does not fit the viewport at that size, pick a smaller size |
| previewed with a fallback font | the TTF lacks the glyph (Roman 4L and the script TTFs have no `ç`), the browser draws another font |
| low F3S match | Gravostyle engraved another font or size: overflow resize, wrong dropdown pick (internal F3S name order), or text that differs from the case (the pipe emoji that cannot travel in the URL) |
| one glyph not found on the engraving | its F3S strokes differ from what Gravostyle drew (left out of the numbers, listed); check the parser on that glyph |
| spacing max on one glyph | a glyph whose TTF advance or centre is off (run `check`), or a fallback glyph earlier in the line |
| steps off around one glyph | the same centre to centre residual next to different neighbours: a glyph Gravostyle sets differently from the model, correct it with `--adjust`; a residual on one pair only is optical kerning, leave it |
| baseline off on every line | `FONT_SIZE_SCALE`, `LINE_HEIGHT_SCALE` or the ascent/descent split |
| found N text lines for M | a line overflowed, wrapped or was empty on the engraving |

## Wiring a new font

- Regular TTF in `static/fonts/<stem>.ttf` with its `@font-face` in `static/css/layout.css`, the F3S in gravo-pilot (bundled) or uploaded through Settings > Fonts (`static/fonts/f3s/fonts/<stem>.f3s`, sent as `extra_fonts`).
- An entry in `fonts.json` (stem, F3S name, F3S SHA-256, measured corrections), the tuned TTF written by `make_f3s_ttf.py build` as `static/fonts/<stem>-f3s.ttf` and the family in `F3S_FONTS` of `static/js/main.js` (family to stem), then `npm run build`.
- `FontFace` families stay unquoted (Chromium takes quotes literally).
- Deployments that persist `static/fonts` in a volume need the font seed sync to pick up new files (otherwise they 404).

## Gotchas

- Never derive spacing from dot or repeat pattern jobs: they include Gravostyle optical kerning; use the model and verify with real words.
- Never measure overflowing compositions; Gravostyle resizes them and Signatur trims them.
- The engraving is not always the text that was sent: check `RETRY` verdicts before reading any number, and look at the engraving image of a line that fails strangely (a lost `E`, an `F` engraved as `E`).
- Accents of capitals and the markers of the family emojis stand apart from their line; `measure.py` merges them back into the expected number of lines, so a case must list every line it engraves.
- The repo keeps CRLF in `.py`, `.js`, CSS and EJS (mixed per file, check first); `npm run lint` is the arbiter, never run standalone prettier on existing files.
- `report.html` with `--embed` is a single file but large (about 1 MB per case); the default writes `img/`.

## Reference

See [reference.md](reference.md) for the F3S format, the layout model and the measured numbers, and [examples.md](examples.md) for case files, commands and real results.
