# Match F3S Fonts - Examples

Real runs of the skill, with the commands, the cases and the numbers they produced. Paths use `$SCRATCH` for a scratch directory and `$PY` for a Python with `fonttools numpy pillow scipy`; the scripts run from `.agents/skills/match-f3s-fonts/scripts/`.

## Deterministic fonts

`fonts.json` is the source of the six `-f3s.ttf` fonts; anyone can prove the committed files come from it, offline:

```bash
$PY selftest.py                     # fonts ok, guard ok, cases ok
$PY make_f3s_ttf.py build --verify  # static/fonts/<stem>-f3s.ttf: identical (x6)
$PY make_f3s_ttf.py build           # regenerates them, byte for byte the same
```

A new measured correction goes into the `adjust` of its font in `fonts.json` and is written with `build`; an F3S file that changed (its SHA-256 no longer the one of the manifest) is refused until it is measured again.

## Generated cases

```bash
$PY cases.py generate --font "Roman 4L" --size 5 --lines 3 --prefix cov > cov.json
$PY cases.py generate --font "Roman 4L" --size 2.5 --lines 5 --prefix small > small.json
$PY cases.py generate --font "Roman 4L" --size 8 --lines 2 --chars "ABCDEFGHIJKLMNOPQRSTUVWXYZ" --prefix limit > limit.json
$PY cases.py check cov.json         # 3 cases, 0 problems
```

The generated lines take every glyph shared by the TTF and the F3S in code point order (`!"#$%&'()*+,-./`, `0123456789:;=`, `?@ABCDEFGHI`, ...), each line filling up to 90% of the area as predicted by the model. On the PR #79 cases `cases.py check` flags exactly the ones that failed for a reason other than the TTF spacing: the 8 lines with `ç` (fallback glyph) and the 6 old size limits (overflow).

## Coverage verification (2026-10-01)

The full check of the rebuilt fonts: 35 generated cases (`cov` at 5 mm, `small` at 2.5 mm and `limit` at 8 mm for each of the six fonts), the branch Signatur submitting the dry runs and a `master` copy captured alongside:

```bash
for font in "Helvetica 1L" "Helvetica 4L" "Roman 4L" "Script 412 1L" "Script 4L" "Script Round 1L"; do
    stem=$(echo "$font" | tr -d " " | tr "A-Z" "a-z")
    $PY cases.py generate --font "$font" --size 5 --lines 3 --prefix cov > cov-$stem.json
    $PY cases.py generate --font "$font" --size 2.5 --lines 5 --prefix small > small-$stem.json
    $PY cases.py generate --font "$font" --size 8 --lines 2 --chars "ABCDEFGHIJKLMNOPQRSTUVWXYZ" \
        --prefix limit > limit-$stem.json
done
# every coverage case plus the first small and limit case of each font
$PY -c 'import glob, json; print(json.dumps(sum((json.load(open(path)) for path in sorted(glob.glob("cov-*.json"))), []) + [json.load(open(path))[0] for path in sorted(glob.glob("small-*.json") + glob.glob("limit-*.json"))], indent=4, ensure_ascii=False))' > all.json
$PY cases.py check all.json                                   # 35 cases, 0 problems
node capture.js all.json $SCRATCH/run-branch --label branch --submit
node capture.js all.json $SCRATCH/run-master --base http://127.0.0.1:3124 --label master --root $SCRATCH/master
$PY gravo_job.py fetch $SCRATCH/run-branch
$PY measure.py --viewport master=$SCRATCH/run-master --viewport branch=$SCRATCH/run-branch --out $SCRATCH/report
```

The first pass gave 4 `RETRY` verdicts (`E` and `Q` lost, `F` engraved as `E`, `L` as `K`); submitting those cases again (`capture.js retry.json $SCRATCH/run-branch --submit`, which replaces their jobs in the run) gave 2 more (`S` lost, `)` engraved as `(`) and a third pass none. Final: rebuilt fonts 35 of 35 PASS, `master` 33 of 35 (the `@` of Helvetica 4L trims two lines), spacing mean 0.02 to 0.09 mm and spacing max at most 0.23 mm for both.

## End to end verification (2026-10-01)

Six cases against the shipped fonts (port 3123), the skill generator output (candidate, port 3124) and the candidate with a measured `@` adjustment (port 3125), all compared with the same six gravo-gold-std dry run screenshots.

```bash
# shipped Signatur, the one that submits the dry run jobs
PRINT_URL=https://print.bemisc.com PRINT_KEY="$(cat ~/.colony-print-key)" \
ENGRAVE_NODE=gravo-gold-std ENGRAVE_PRINTER=gravo PORT=3123 HOST=127.0.0.1 node app.js &

# candidate copy with the regenerated fonts
rsync -a --exclude .git --exclude node_modules --exclude coverage ./ $SCRATCH/candidate/
ln -s "$PWD/node_modules" $SCRATCH/candidate/node_modules
for pair in "helvetica1l:Helvetica 1L" "helvetica4l:Helvetica 4L" "roman4l:Roman 4L" \
    "script4121l:Script 412 1L" "script4l:Script 4L" "scriptround1l:Script Round 1L"; do
    $PY make_f3s_ttf.py text --ttf static/fonts/${pair%%:*}.ttf --f3s "${pair#*:}" \
        --output $SCRATCH/candidate/static/fonts/${pair%%:*}-f3s.ttf
done
(cd $SCRATCH/candidate && PORT=3124 HOST=127.0.0.1 node app.js &)

export PLAYWRIGHT_PATH=~/.local/share/mise/installs/npm-playwright/1.63.0/node_modules/playwright
node capture.js cases.json $SCRATCH/run-shipped --base http://127.0.0.1:3123 --label shipped --submit
node capture.js cases.json $SCRATCH/run-candidate --base http://127.0.0.1:3124 --label candidate \
    --root $SCRATCH/candidate
$PY gravo_job.py fetch $SCRATCH/run-shipped
$PY make_f3s_ttf.py check --ttf static/fonts/helvetica4l-f3s.ttf --f3s "Helvetica 4L" \
    --json $SCRATCH/check-shipped-helvetica4l.json
$PY measure.py --viewport shipped=$SCRATCH/run-shipped --viewport candidate=$SCRATCH/run-candidate \
    --check $SCRATCH/check-shipped-helvetica4l.json --out $SCRATCH/report
```

`cases.json`:

```json
[
    {"name": "e2e-helvetica4l-at", "font": "Helvetica 4L", "font_size": 5, "lines": ["a@b.pt", "Ana @ Rui"],
     "profile": "plate", "width": 70, "height": 70, "margins": [5, 5, 5, 5], "f3s": true},
    {"name": "e2e-helvetica1l-tilde", "font": "Helvetica 1L", "font_size": 5, "lines": ["Ãão Õõ", "Tiago AV"],
     "profile": "plate", "width": 70, "height": 70, "margins": [5, 5, 5, 5], "f3s": true},
    {"name": "e2e-roman4l", "font": "Roman 4L", "font_size": 6, "lines": ["Wa fij 01", "Ãã Õõ"],
     "profile": "plate", "width": 70, "height": 70, "margins": [5, 5, 5, 5], "f3s": true},
    {"name": "e2e-script4l", "font": "Script 4L", "font_size": 6, "lines": ["Tiago Ana", "Ôô Êê"],
     "profile": "plate", "width": 70, "height": 70, "margins": [5, 5, 5, 5], "f3s": true},
    {"name": "e2e-scriptround1l", "font": "Script Round 1L", "font_size": 5, "lines": ["Ana Ãã", "õ 2026"],
     "profile": "plate", "width": 70, "height": 70, "margins": [5, 5, 5, 5], "f3s": true},
    {"name": "e2e-emojis", "font": "Cool Emojis", "font_size": 6,
     "lines": [[["Cool Emojis", "A ["]], [["Cool Emojis", "x y"]], [["Cool Emojis", "C W"]]],
     "profile": "plate", "width": 70, "height": 70, "margins": [5, 5, 5, 5], "f3s": true}
]
```

Results (spacing mean / max in mm, line width error in mm):

| Case | Shipped | Candidate | Adjusted |
| --- | --- | --- | --- |
| `e2e-helvetica4l-at` | FAIL 7.64 / 14.95, width +19.9 | FAIL 0.16 / 0.36, width +0.43 | PASS 0.04 / 0.12, width -0.10 |
| `e2e-helvetica1l-tilde` | PASS 0.05 / 0.15 | PASS 0.07 / 0.17 | |
| `e2e-roman4l` | PASS 0.04 / 0.13 | PASS 0.04 / 0.13 | |
| `e2e-script4l` | PASS 0.03 / 0.08 | PASS 0.04 / 0.08 | |
| `e2e-scriptround1l` | PASS 0.05 / 0.11 | PASS 0.07 / 0.11 | |
| `e2e-emojis` | PASS 0.08 / 0.12, width -0.25 | PASS 0.08 / 0.12 | |

## Tuning a glyph by trial and error (`@` of Helvetica 4L)

1. `check` flagged the shipped `helvetica4l-f3s.ttf`: `'@' advance_dev +2725.0` (it had been generated with a fixed 5000 scale while the `@` stores `m[0] = 21740`), and the viewport showed `a      @      b.pt`.
2. The generator with the per glyph scale fixed it to 0.16 mm, but the line stayed 0.34 to 0.43 mm wider than the engraving. The `steps off` of the report (viewport minus Gravostyle, centre to centre) pointed at the glyph: `a..@ +0.34`, `a..@ +0.29` (through a space) and `@..b`, `@..R` about +0.12, the same next to different neighbours, so a property of the `@`, not kerning.
3. The residuals at 5 mm become TTF units with `mm / size * 0.7 * upm`: left `-0.31 / 5 * 700 = -43`, right `-0.125 / 5 * 700 = -18`:

```bash
echo '{"@": {"left": -43, "right": -18}}' > adjust-helvetica4l.json
$PY make_f3s_ttf.py text --ttf static/fonts/helvetica4l.ttf --f3s "Helvetica 4L" \
    --adjust adjust-helvetica4l.json --output $SCRATCH/adjusted/static/fonts/helvetica4l-f3s.ttf
$PY make_f3s_ttf.py check --ttf $SCRATCH/adjusted/static/fonts/helvetica4l-f3s.ttf \
    --f3s "Helvetica 4L" --adjust adjust-helvetica4l.json    # PASS
```

4. Only the viewport is captured again (`capture.js` without `--submit` against the adjusted copy) and measured against the **same** dry run screenshots: 0.04 / 0.12 mm, PASS. No new machine job is needed while iterating on the TTF.
5. The correction is recorded in `fonts.json` (`"adjust": {"@": {"left": -43, "right": -18}}` for `helvetica4l`) and the font written with `make_f3s_ttf.py build`.

## Re-measuring existing evidence

`measure.py` reads any run directory with a `capture.json` (cases, plate box, character boxes, font size and line height, job id and payload) plus `<name>-plate.png`, `<name>-viewport.png` and, in the run that submitted, `<name>-composition.png`. Re-measuring the 75 PR #79 jobs (before: regular fonts and old factors, after: `-f3s.ttf`):

```bash
$PY measure.py --viewport before=$SCRATCH/run-before --viewport after=$SCRATCH/run-after --out $SCRATCH/report-pr79
```

| Viewport | Pass | Typical spacing mean | Notes |
| --- | --- | --- | --- |
| before | 1 / 75 | 0.12 to 4.18 mm | line widths up to 18.8 mm off |
| after | 60 / 75 | 0.01 to 0.09 mm | the 15 FAIL: 6 trimmed old limits, 1 pipe emoji job (not in the URL), 8 `ç` fallbacks |

## Pre-flight check output

The fonts of release 1.5.0, before the per glyph scale (`build` now gives 0.07% and PASS for all six):

```text
$ python make_f3s_ttf.py check --ttf static/fonts/helvetica4l-f3s.ttf --f3s "Helvetica 4L"
static/fonts/helvetica4l-f3s.ttf: FAIL
  121 glyphs, worst deviation in % of the font size: advance 389.29, centre 194.76, height 12.64, bottom 29.04
  1 glyphs off in spacing (over 10.5 units):
    '@' at             advance_dev +2725.0 centre_dev +1363.3
  66 glyphs differ in ink height or bottom by more than 10.5 units (outline thickness and drawing differences, informational for text fonts)
  in the F3S but missing in the TTF (previewed with a fallback font): ¡£ª°º¿ÄÅÆËÏ...
  in the TTF but missing in the F3S (not engraved): `´ˆ˜–

$ python make_f3s_ttf.py check --ttf static/fonts/coolemojis.ttf --emoji
static/fonts/coolemojis.ttf: FAIL
  92 glyphs, worst deviation in % of the font size: advance 6.39, centre 3.27, height 0.57, bottom 0.57
  4 glyphs off in spacing (over 10.5 units):
    '[' bracketleft    advance_dev -44.7 centre_dev -22.9
    '}' braceright     advance_dev -19.0 centre_dev -9.5
    'y' y              advance_dev -15.7 centre_dev -7.8
    'x' x              advance_dev -15.2 centre_dev -7.6
```

The emoji residuals are drawings narrower than their F3S glyphs; the dry run `A [` and `x y` lines show them as -0.25 and -0.18 mm line width errors, within the pass limits.

## Probing the F3S model directly

To learn how Gravostyle treats something (never as the proof of a TTF), send guarded payloads straight to the node and inspect the compositions:

```bash
$PY gravo_job.py submit probe.json $SCRATCH/probe --plan   # prints the payloads only
$PY gravo_job.py submit probe.json $SCRATCH/probe          # dry run jobs, waits and downloads
```
