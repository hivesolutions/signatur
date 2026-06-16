# Proposal: Double-sided engraving support

## Problem

Signatur today engraves a single face. The whole editing and submission pipeline assumes one design per job:

- A profile (`static/profiles/<id>.json`) describes **one** engravable surface — its dimensions, padding, font size, background and machine viewport.
- The `/viewport` editor holds **one** text buffer (`body.data("text")`) and renders **one** preview.
- The print button (`main.js`) builds **one** spec object and confirms **one** engrave job, which the print-jobs plugin tracks as **one** chip.
- An inspirations file (`static/profiles/<id>.inspirations.json`) is an array of **single-face** presets, each carrying one `text` array, one `font_size` and one optional `padding`/`align`.

[Issue #43](https://github.com/hivesolutions/signatur/issues/43) asks to engrave **both sides of a material** — a front and a back design — with:

- an engraving option to select "double-sided",
- alignment accuracy between the two sides,
- separate front/back design entry,
- workflow documentation,
- double-sided support for inspirations.

The maintainer flagged this as "a tricky one", which it is: the single-face assumption is woven through the profile schema, the editor state, the preview, the submission payload and the inspirations format. This proposal exists to pin the scope down **before** any code is written.

## Goal

Let a profile opt into being double-sided, let the operator enter and preview a back design alongside the front, and let inspirations carry a paired back preset — while keeping every existing single-face profile, inspiration and saved session working byte-for-byte unchanged.

## Decisions taken

These were settled with the maintainer before implementation:

- **Submission**: the back is sent as a **second, independent single-face job** (front then back). The Colony Print protocol and the print-jobs plugin stay unchanged.
- **Alignment**: **out of scope** for this iteration. We allow a separate back design but ship no mirroring, offset or registration logic.
- **Phasing**: land the **data model first** — the profile `double_sided` block, the inspiration `back` preset, the validators, the spec docs and the unit tests — as a reviewable first change. The editor, preview and submission wiring follow once the model is agreed.
- **Back design entry**: driven by **paired inspirations** (a `back` block on an inspiration entry). Manual front/back text entry on `/viewport` is deferred.

## Non-goals (this iteration)

- Re-engineering the Colony Print job protocol (the back is just a second normal job).
- Physical jig calibration, mirroring or automatic registration (alignment is out of scope).
- Per-variant double-sided overrides (a profile is double-sided or not; both faces share the same physical envelope).
- The editor, preview and submission wiring (a later change, once the model below is agreed).

## Affected surfaces (survey)

| Surface | File | Single-face assumption today |
| --- | --- | --- |
| Profile schema + validator | `lib/util/profile.js`, `docs/profile-spec.md` | One surface, no notion of a back face |
| Inspirations schema + validator | `lib/util/profile.js` (`validateInspiration`), `docs/profile-spec.md` | One `text`/`font_size`/`padding`/`align` per entry |
| Editor state | `static/js/main.js` | Single `body.data("text")` buffer, single preview, single URL `text=` |
| Print/confirm | `static/js/main.js`, `views/viewport*.ejs` | One spec, one confirm modal, one enqueue |
| Inspiration panel | `static/js/plugins/inspiration.js` | Renders one preview per inspiration |
| Job tracking | `static/js/plugins/printjobs.js` | One chip per job |
| Profile authoring UI | `static/js/plugins/profilemanager.js`, `views/manager*.ejs` | No back-face fields |

## Proposed shape

Backward compatibility is the spine of the design: a field absent ⇒ behaves exactly as today. This iteration ships only the data model below.

### Profile schema

Add an **optional** top-level `double_sided` object. Absent ⇒ single-face (current behaviour).

```json
{
    "double_sided": {
        "enabled": true,
        "back_background": "ring-back.png"
    }
}
```

- `enabled` (boolean, required when the object is present) — turns the second face on.
- `back_background` (string, optional) — PNG for the back preview; defaults to the front `background`.

Validated by a new `validateDoubleSided(...)` helper that mirrors the existing per-block validators (`validatePreview`, `validateMachine`, …) and is invoked from `validateProfile` behind a `profile.double_sided !== undefined` guard, so existing profiles are untouched. Alignment / mirroring is intentionally left out (out of scope).

### Inspirations schema

Add an **optional** `back` object on an inspiration entry, with the same shape as the front (`text`, `font_size`, `padding?`, `align?`). Absent ⇒ single-face preset (current behaviour). Validated by reusing the existing front-field checks against the `back` sub-object so the rules never drift between faces.

### Documentation

Extend `docs/profile-spec.md` (the authoritative schema doc) with the `double_sided` block and the inspiration `back` field.

### Deferred (later iterations, once the model is agreed)

- A second text buffer for the back face on `/viewport`, gated on the active profile being double-sided.
- A **thumbnail face switcher**: a small two-up component (a front thumbnail and a back thumbnail, each a miniature viewport preview rendered with the same `renderPreview` machinery the inspiration panel already uses) that the operator clicks to toggle which face the editor is currently editing, with the active thumbnail highlighted. Single-face profiles never render the switcher, so the editor stays unchanged for them.
- Rendering the active face in the main preview and the inspiration panel; a paired inspiration fills both faces at once and the thumbnails update together.
- On confirm, enqueueing two jobs (front then back), each a normal single-face job, so the print-jobs plugin needs no protocol change — only labelling to tell the two chips apart.

## Compatibility & testing

- Every new schema field is optional; the validator changes are purely additive and guarded, so the existing `test/lib/util/profile.js` suite stays green.
- New unit tests cover `validateDoubleSided` and the inspiration `back` branch, following the exact `describe`/`it` + `assert` patterns already in `test/lib/util/profile.js`, ordered to mirror the declaration order of the new validators.
- `npm run build`, `npm run lint`, `npm test` before each commit per `AGENTS.md`.
