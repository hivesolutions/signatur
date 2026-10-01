# Match F3S Fonts - Reference

What is known about the F3S format, how Gravostyle lays it out and how the Signatur viewport has to render a TTF to match it. Everything here was measured on dry run compositions of the gravo-gold-std node (2026-10-01) unless marked otherwise.

## F3S format

Parser: `f3s_parser.py` of gravo-native (`docs/F3S_FORMAT.md` and `docs/RE_F3S_FONT.md` there have the full reverse engineering notes).

- The whole file is XOR obfuscated with a single byte key, the byte stored at `0x20` (that reserved region decodes to zero).
- Little endian header: the font name in the first 32 bytes (UTF-16LE, NUL padded, this is the name Gravostyle sorts its font dropdown by), the index size at `0x26` (uint32), the index from `0x3C` with 6 byte entries (uint16 char code, uint32 glyph offset).
- Header `0x2A` holds the size of a section after the index: a list of 1110 character pairs whose values are all zero. It is not kerning; Gravostyle's neighbour dependent spacing is computed, not stored.
- Big endian glyph blocks: 30 int16 metrics at block + 32, then the vector commands from block + 92. Opcodes 1, 2 and 3 are on curve points (2 and 3 are 22 byte records), 4 a quadratic control point, 5 ends a stroke.
- Strokes are normalized to the glyph's own bounding box (x from 0 to `m[9]`, y from 0 to `m[10]`).

### Metrics

| Index | Meaning |
| --- | --- |
| `m[0]` | units per font size of the glyph: 5000 for most text glyphs, but 20000 (Roman 4L `Ł ą Ę Ń Ś Ź Ż`), 21740 (Helvetica 4L `@`), 15000 (Helvetica 4L `Ő Ű Ż`) and 5001 to 5198 (tilde and other accented letters) exist; for an emoji glyph it is its full height |
| `-m[2]` | left bearing: the ink left sits at `pen - m[2]` |
| `-m[4]` | vertical offset: the stroke y 0 sits at `baseline - m[4]` |
| `m[6]` | advance counted from the ink left, so the pen advance is `-m[2] + m[6]` |
| `m[9]`, `m[10]` | ink width and height |

The Gravostyle composition of a Helvetica 4L `a@b.pt` shows an `@` about 4 mm wide at 5 mm, which only `m[0] = 21740` explains (with 5000 it would be 18.6 mm wide); scale every glyph by its own `m[0]`. For the glyphs whose `m[0]` is within 2% of 5000 (the tilde letters) the screenshots cannot tell the two scales apart (67 measured steps: 0.085 mm against 0.084 mm mean error, both under the measurement floor), so the per glyph scale is kept for all.

## Gravostyle layout

- **Size**: the font size is the cap height in mm; a glyph is drawn at `font_size / m[0]` mm per unit.
- **Advance**: the base pen advance is `-m[2] + m[6]`. Real words match it within 0.1 to 0.6% of the line width, and the Gravostyle text cursor lands on the model pen end.
- **Optical kerning**: Gravostyle adds a neighbour dependent correction (`o` next to `.` about 210 units tighter, `HoHo` about 60). It is not in the file and is not modelled; it is the main residual (up to about 0.1 to 0.2 mm). Spacing measured on repeated dots or patterns includes it, so never fit advances to such jobs.
- **Pair residuals** (1129 adjacent pairs of the six fonts, 524 distinct, measured against the base model): about 0.12 mm standard deviation at 5 mm (95% under 0.24 mm). The same pair measured twice differs by about 0.06 mm (median), different pairs by about 0.09 mm, so part of it is pair specific. Neither a per glyph left and right correction (fitted by least squares, cross validated by case: 0.109 mm before and after for Helvetica 1L, the same for the other fonts) nor the gap between the ink profiles of the two glyphs (correlation under 0.15) predicts it, so it cannot be derived from the F3S. Only glyphs that are off next to different neighbours (the Helvetica 4L `@`) deserve a correction.
- **Lines**: the line pitch is about 1.76 times the size for every font. The block is centred vertically from the first cap top to the last baseline inside the margin box, and every line is centred horizontally on its **ink** extents, not its advances (script swash capitals shift a line by up to about 2.4 mm at 5 mm against advance centring).
- **Overflow**: text that runs past the margin box is fitted to the box, changing the size, or drawn past it. Never measure such compositions.
- **Typing**: gravo-pilot types every character into Gravostyle by copying it to the clipboard and pasting it (Ctrl+V, 50 ms apart). In 41 dry runs of about 950 characters (2026-10-01) 6 came out wrong: 3 lost (`E`, `Q`, `S`) and 3 replaced by the previous character (`F` as `E`, `L` as `K`, `)` as `(`, a stale paste). The engraving can therefore differ from the text sent, in the dry run as in a real job.
- **Emojis**: each Cool Emojis character is engraved from its own F3S (the `a` glyph of `<number>.<name>.f3s`) at `m[0]` = its height = the font size; Signatur sends their spaces as Helvetica 4L spaces (0.858 times the size). Family emojis carry a single point stroke at the full family height, a marker that sets `m[0]` and `m[10]` without being part of the figure (it is engraved as a dot).

## Signatur viewport

- `static/js/main.js`: `VIEWPORT_SCALE = 3` css px per mm, `FONT_SIZE_SCALE = 1 / 0.7` (0.7 of the em renders at the font size), `LINE_HEIGHT_SCALE = 1.232` (1.76 times 0.7), no pixel rounding.
- Every character is a span with the advance of its glyph; a line is centred on the advances (the text-align of the editor).
- The baseline in a line box sits at `top + (line_height - (ascent + descent)) / 2 + ascent`, ascent and descent from the typo metrics when `USE_TYPO_METRICS` is set (all Signatur fonts), so `ascent - descent = cap` centres the line box on the capitals like Gravostyle centres on cap tops and baselines.
- The F3S fonts (on by default, `f3s=0` or the viewport option turns them off, store mode forces them on) add `FontFace(family, url(/static/fonts/<stem>-f3s.ttf))` for every family of `F3S_FONTS`, which take precedence over the CSS faces; `static/css/layout.css` declares the regular faces.

## TTF recipe

For each glyph shared by the TTF and the F3S, with `u = 0.7 * unitsPerEm / m[0]` TTF units per F3S unit:

| Field | Value |
| --- | --- |
| advance | `round((-m[2] + m[6]) * u)` |
| outline | shifted horizontally so `(xMin + xMax) / 2 = (-m[2] + m[9] / 2) * u` (kept otherwise) |
| lsb | the new `xMin` |
| ascent / descent | `ascent - descent = H yMax`, `ascent + descent` unchanged, hhea and typo, `USE_TYPO_METRICS` on |
| DSIG | dropped (the edits invalidate the signature) |

For an emoji glyph the outline is also scaled to the main ink height `(box height) * u` from its bottom left, placed on the ink bottom `box y_min * u` and centred on the ink centre, the box leaving out the single point markers. When a whole TTF draws its capitals at another height than 0.7 em, `--scale auto` first scales all outlines so the `H` matches the F3S `H` (dropping the hinting).

Text font outlines have a thickness around the F3S centre lines and their own accent and punctuation drawings, so their ink heights differ from the F3S ones; only the spacing is tuned for them. `measure.py` still compares the median ink height of the viewport glyphs with the engraved ones: -4% to +10% for the six fonts (Script 4L has the thickest strokes), against -10% to -12% for the preview of the regular TTFs with the old factors.

## Measured results

### PR #79 fonts (75 jobs re-measured by measure.py)

| Viewport | Cases passing | Spacing mean | Line width |
| --- | --- | --- | --- |
| regular TTFs, old size factor | 0 of 75 | 0.12 to 4.18 mm | up to 18.8 mm |
| `-f3s.ttf`, 1/0.7 and 1.232 | 57 of 75 | 0.01 to 0.09 mm | within 0.35 mm |

The 18 failing after are all explained: 6 old size limits that no longer fit the viewport (trimmed), 1 job whose `|` emoji did not travel in the URL, 1 case written before `typed` lines were counted that lists its typed `|` line twice, 8 lines with `ç`, which Roman 4L and the script TTFs lack (fallback glyph), and 2 glyphs whose F3S strokes were not found on the engraving (the Roman 4L `7` at 2.5 mm and a Helvetica 4L `õ`), so not measured.

### Pre-flight check of the fonts (2026-10-01)

| TTF | Worst spacing deviation | Glyphs off |
| --- | --- | --- |
| regular six | 27 to 79% of the size | most |
| `helvetica4l-f3s.ttf` of 1.5.0 | 389% | `@` (generated with a fixed 5000 scale, 5 em advance) |
| `helvetica1l-f3s.ttf` of 1.5.0 | 1.9% | `Õ` |
| `scriptround1l-f3s.ttf` of 1.5.0 | 1.5% | `Ã` |
| other `-f3s.ttf` of 1.5.0 | under 1.1% | none |
| the six `-f3s.ttf` built from `fonts.json` (per glyph `m[0]`, `@` corrected) | 0.07% | none |
| `coolemojis.ttf` | 6.4% | `[ } x y` (drawings narrower than the F3S ones, about 0.2 mm, within the limits) |

### Coverage verification of the rebuilt fonts (35 jobs)

Every glyph shared by the six TTFs and their F3S fonts, at 5 mm (3 lines per plate), at 2.5 mm (5 lines) and at 8 mm near the area limit, generated by `cases.py`, each viewport captured from the `master` fonts and from the fonts built from `fonts.json`:

| Fonts | Pass | Spacing mean | Spacing max | Line width | Baseline |
| --- | --- | --- | --- | --- | --- |
| `master` (1.5.0) | 33 / 35 | 0.02 to 0.09 mm | 0.23 mm | 0.25 mm | 0.16 mm |
| rebuilt (`fonts.json`) | 35 / 35 | 0.02 to 0.09 mm | 0.23 mm | 0.26 mm | 0.16 mm |

The 2 `master` failures are the Helvetica 4L `@` (the viewport trims the line); 6 of the jobs had to be submitted again for typing errors of the engraving.

### Coverage gaps

Glyphs in the F3S (so engraved) but missing in the `-f3s.ttf` (so previewed with a fallback font): `Ç ç` in Roman 4L, Script 412 1L, Script 4L and Script Round 1L, plus `Û û` (Roman 4L, Script 4L, Script Round 1L), `Î î` (Script 4L, Script 412 1L), `Õ` (Script Round 1L) and `# ~ \` in some of them. The viewport keyboard offers `_`, `´`, `^` and the backtick, which no F3S has (not engraved).

### Emojis

All 91 emojis verified two per line: pair distance error 0.06 mm mean, 0.17 mm max after the six glyph fix (C, E, W, t, -, tilde scaled to the F3S height and the space set to 601 units).
