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
- **Phasing**: the **data model landed first** (the profile `double_sided` block, the inspiration `back` preset, the validators, the spec docs and the unit tests). The **viewport thumbnail face switcher**, the per-face editing controls and the profile manager display followed on the same branch. Only the submission wiring remains deferred.
- **Back design entry**: driven by **paired inspirations** (a `back` block on an inspiration entry); the face switcher lets the operator view and switch faces. Free manual typing per face works through the active editor surface, and each face keeps its own font size, margins and alignment.

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

### Profile manager display

The profile manager detail panel shows a **Double Sided** row (driven by `data-meta-double-sided-*` labels on the manager view, rendered only when `double_sided.enabled`) so an admin can see at a glance which templates carry a back face.

### Viewport face switcher (thumbnail component)

The `/viewport` editor gets a **thumbnail face switcher** — the `viewportfaces` plugin (`static/js/plugins/viewportfaces.js` + matching CSS), pinned **directly below the inspiration panel** (its `top` is computed from the inspiration panel's resting bottom edge and re-pinned when that panel collapses or expands) and gated on `double_sided.enabled` (hidden entirely for single-faced profiles, so their editor is untouched). The whole panel is additionally gated behind the `faces` feature flag (`FEATURE_FACES`, default on), so an operator can turn the switcher off through the `Features` tab on `/settings` without affecting the underlying double-sided data.

- It renders a **Front** and a **Back** thumbnail, each a miniature live viewport preview built with the same scaling/safe-area technique as the inspiration panel's `renderPreview`, and each rendered at **its own** font size, margins, alignment and background so the thumbnail faithfully reflects that face. The back thumbnail and the main editor preview use `double_sided.back_background` when it is set (falling back to the shared front `background`). The active face is highlighted.
- Each face owns a full **settings** object — `{ text, font_size, font_size_mode, margins, align }`. The **active** face stays live in the editor (its text in `body.data("text")` and its font size / margins / alignment in the existing controls, so the text editor, print button and auto font sizing keep working unchanged), while the **inactive** face is parked in `body.data("settings_front")` / `body.data("settings_back")`, with `body.data("face")` tracking the active side.
- Clicking a thumbnail emits a `switch` event; `main.js` captures every setting of the side being left into its parked object, then applies the side being entered (rebuilding the text through `texteditor("loadText", …)` and restoring its font size, margins and alignment), and re-renders the thumbnails. Typing or changing a control refreshes the active thumbnail live.
- Applying a **paired inspiration** fills the front from `text` (and the front controls) and parks the back from `back.text` / `back.font_size` / `back.padding` / `back.align` at once, and both thumbnails update together.

### Double-sided inspiration previews

For a double-sided profile, an inspiration that carries a `back` block previews **both faces side by side** (a front half and a back half within the same thumbnail / card) in both the inspiration panel and the View-all modal, so the operator sees what each face will hold before applying it. The back half renders against `double_sided.back_background` when set. Single-faced inspirations (and double-sided inspirations on a single-faced profile) keep the single preview they have always rendered.

### URL state (both faces, full per-face settings)

The viewport round-trips **both faces and their per-face settings** through the query string so a shared or bookmarked link resumes the full double-sided session:

- `text`, `font_size`, `font_size_mode`, `margins`, `align` — the **front** face. `text` and the existing params stay backward compatible; for double-sided profiles they are always resolved from the front face state (rather than the live controls) so they keep tracking the front even while the back is the live face. `align` is written only for double-sided sessions.
- `text_back`, `font_size_back`, `margins_back`, `align_back` — the **back** face, using the same serialization, written only for double-sided profiles and dropped (along with `align`) for single-faced ones so their URLs stay unchanged.

On restore, the front params rebuild the live editor and controls (as before), and the back params seed the parked back settings; the back seeding is duplicated in the profile-refresh reset and in the text-restore step so the two can run in either order during load without clobbering the resumed back face.

### Deferred (later iterations)

- On confirm, enqueueing two jobs (front then back), each a normal single-face job, so the print-jobs plugin needs no protocol change — only labelling to tell the two chips apart.

## Compatibility & testing

- Every new schema field is optional; the validator changes are purely additive and guarded, so the existing `test/lib/util/profile.js` suite stays green.
- New unit tests cover `validateDoubleSided` and the inspiration `back` branch, following the exact `describe`/`it` + `assert` patterns already in `test/lib/util/profile.js`, ordered to mirror the declaration order of the new validators.
- `npm run build`, `npm run lint`, `npm test` before each commit per `AGENTS.md`.
