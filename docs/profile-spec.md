# Profile JSON Specification

This document describes the schema of the profile JSON payloads that live under `static/profiles/` and that are validated by `lib/util/profile.js` (`validateProfile`). The validator is the authoritative source; this document tracks it.

A profile defines an engravable surface (a medal, a plate, a ring, etc.): its physical dimensions, the area available for text, the font size range, optional background image, optional variants, and optional inspiration presets.

Companion `*.inspirations.json` files (described at the end) supply ready-to-apply text presets for a given profile.

## File naming

Profile files are stored as `static/profiles/<id>.json`, where `<id>` is the profile identifier and must satisfy the pattern `^[a-z0-9]+(?:-[a-z0-9]+)*$` (lowercase alphanumeric segments separated by single hyphens, no leading or trailing hyphen).

Optional inspirations for a profile live at `static/profiles/<id>.inspirations.json`.

PNG background assets live alongside the JSON files under `static/profiles/` and are referenced by filename only. Asset filenames must satisfy `^[a-z0-9]+(?:-[a-z0-9]+)*\.png$`.

## Top-level fields

| Field           | Type    | Required | Notes                                                                                 |
| --------------- | ------- | :------: | ------------------------------------------------------------------------------------- |
| `id`            | string  |   yes    | Matches `^[a-z0-9]+(?:-[a-z0-9]+)*$`. Must equal the filename stem.                   |
| `name`          | string  |   yes    | Human readable name shown in the UI.                                                  |
| `description`   | string  |    no    | Free form description.                                                                |
| `width`         | number  |   yes    | Positive. In `unit`s.                                                                 |
| `height`        | number  |   yes    | Positive. In `unit`s.                                                                 |
| `unit`          | string  |   yes    | One of `mm`, `px`.                                                                    |
| `orientation`   | string  |   yes    | One of `portrait`, `landscape`.                                                       |
| `shape`         | string  |    no    | One of `rectangle`, `circle`, `heart`. Drives boundary rendering.                     |
| `background`    | string  |    no    | PNG filename under `static/profiles/` used as the preview background.                 |
| `default_font`  | string  |    no    | Font name (e.g. `Helvetica 4L`) auto-selected on initial load when no font is active. |
| `enabled`       | boolean |    no    | When `false`, the profile is hidden from the catalog.                                 |
| `inspirations`  | string  |    no    | Filename of an inspirations JSON file (without the `.json` extension is not enough).  |
| `font_size`     | object  |   yes    | See [font_size](#font_size).                                                          |
| `padding`       | object  |    no    | See [padding](#padding).                                                              |
| `extra_padding` | object  |    no    | See [extra_padding](#extra_padding).                                                  |
| `preview`       | object  |    no    | See [preview](#preview).                                                              |
| `instructions`  | object  |    no    | See [instructions](#instructions).                                                    |
| `variants`      | array   |    no    | See [variants](#variants).                                                            |
| `machine`       | object  |    no    | See [machine](#machine).                                                              |
| `text`          | object  |    no    | See [text](#text).                                                                    |
| `metadata`      | object  |    no    | See [metadata](#metadata).                                                            |

## font_size

Controls the font size slider and the automatic font sizing behavior. Required at the top level; may be overridden per variant.

| Field     | Type   |     Required      | Notes                               |
| --------- | ------ | :---------------: | ----------------------------------- |
| `mode`    | string |        yes        | One of `manual`, `automatic`.       |
| `default` | number | yes (manual only) | Positive. Initial slider value.     |
| `min`     | number |        yes        | Positive. Lower bound (both modes). |
| `max`     | number |        yes        | Positive. Upper bound (both modes). |
| `step`    | number | yes (manual only) | Positive. Slider granularity.       |

`automatic` mode does not require `default` or `step`; the editor picks the best fit within `[min, max]`.

## padding

Inner padding (margin) of the engravable area, in profile units. All four sides are required and must be non-negative.

```json
{ "top": 2, "right": 2, "bottom": 2, "left": 2 }
```

## extra_padding

Additional padding overlay (e.g. for safe area or jig clearance). Same shape and constraints as `padding`.

## preview

Per-profile preview options for the viewport.

| Field            | Type    | Required | Notes                                               |
| ---------------- | ------- | :------: | --------------------------------------------------- |
| `show_bounds`    | boolean |    no    | When `true`, draws the profile bounding outline.    |
| `show_safe_area` | boolean |    no    | When `true`, draws the safe area (padding) outline. |
| `zoom`           | number  |    no    | Positive. Default zoom factor for this profile.     |

## instructions

Optional jig setup instructions surfaced through the editor.

| Field         | Type   | Required | Notes                                           |
| ------------- | ------ | :------: | ----------------------------------------------- |
| `title`       | string |    no    | Modal title.                                    |
| `description` | string |    no    | Body copy shown above the images.               |
| `images`      | array  |    no    | Each entry is a string (image URL or filename). |

## variants

Optional list of named sub-types of the profile (e.g. silver vs. gold finish) that override selected fields. Each entry is an object:

| Field           | Type   | Required | Notes                                                      |
| --------------- | ------ | :------: | ---------------------------------------------------------- |
| `name`          | string |   yes    | Display name in the variant dropdown.                      |
| `padding`       | object |    no    | Overrides the top-level `padding` for this variant.        |
| `extra_padding` | object |    no    | Overrides the top-level `extra_padding`.                   |
| `font_size`     | object |    no    | Overrides the top-level `font_size`.                       |
| `background`    | string |    no    | Overrides the top-level `background` with a different PNG. |

## machine

Physical viewport of the engraving machine, used by the print pipeline to translate from profile coordinates.

| Field             | Type   | Required | Notes                                               |
| ----------------- | ------ | :------: | --------------------------------------------------- |
| `viewport_width`  | number |   yes    | Positive. Machine viewport width in machine units.  |
| `viewport_height` | number |   yes    | Positive. Machine viewport height in machine units. |

## text

Controls editor-level text constraints applied while the user types or loads a preset.

| Field            | Type    | Required | Notes                                                           |
| ---------------- | ------- | :------: | --------------------------------------------------------------- |
| `max_lines`      | integer |    no    | Must be `>= 1`. Maximum number of lines the editor will accept. |
| `align`          | string  |    no    | One of `left`, `center`, `right`.                               |
| `vertical_align` | string  |    no    | One of `top`, `middle`, `bottom`.                               |

When `max_lines` is omitted or `<= 0`, the editor treats the profile as unbounded. The constraint is enforced both on physical keyboard input and on programmatic loads (inspirations, deep-link `?text=…`, session restore), trimming any overflow rather than rejecting the payload.

## metadata

Free-form metadata bundled with the profile, surfaced in the UI where relevant.

| Field     | Type    | Required | Notes                                                  |
| --------- | ------- | :------: | ------------------------------------------------------ |
| `version` | integer |    no    | Must be `>= 1`. Profile schema or content version.     |
| `tags`    | array   |    no    | Strings only; entries must be unique within the array. |

## Example

```json
{
    "id": "heart-medal",
    "name": "Heart Medal",
    "description": "A heart-shaped medal with a 16x11mm engravable area inscribed in a 22x20mm bounding box.",
    "width": 22,
    "height": 20,
    "unit": "mm",
    "orientation": "landscape",
    "shape": "heart",
    "padding": { "top": 3, "right": 3, "bottom": 7.5, "left": 3 },
    "font_size": { "mode": "manual", "default": 3, "min": 1, "max": 8, "step": 1 },
    "text": { "max_lines": 2, "align": "center" },
    "background": "heart-medal.png",
    "variants": [
        { "name": "Silver", "background": "heart-medal.png" },
        { "name": "Gold",   "background": "heart-medal-gold.png" }
    ],
    "preview": { "show_bounds": true, "show_safe_area": true, "zoom": 2 },
    "machine": { "viewport_width": 22, "viewport_height": 20 }
}
```

## Inspirations file

Each profile may ship a companion `static/profiles/<id>.inspirations.json` file containing an array of pre-built text presets. Each entry has the following shape:

| Field         | Type           | Required | Notes                                                                                             |
| ------------- | -------------- | :------: | ------------------------------------------------------------------------------------------------- |
| `id`          | string         |   yes    | Matches `^[a-z0-9]+(?:-[a-z0-9]+)*$`. Unique within the file.                                     |
| `title`       | string         |   yes    | Display name in the inspiration grid.                                                             |
| `description` | string         |   yes    | Short description shown alongside the title.                                                      |
| `author`      | string         |   yes    | Author / source attribution.                                                                      |
| `text`        | array of pairs |   yes    | Each entry is a `[font, character]` pair. `font` is a string or `null` (for newlines, see below). |
| `font_size`   | number         |   yes    | Positive. Font size to apply when this preset is loaded.                                          |
| `padding`     | object         |    no    | Overrides the active padding while this preset is in use.                                         |
| `align`       | string         |    no    | One of `left`, `center`, `right`. Overrides the profile alignment.                                |

The `text` array uses one entry per character. A newline is encoded as the pair `[null, "\n"]`. The character string may also be a multi-character run (e.g. a word) which the editor will expand into individual character cells on load.

```json
[
    {
        "id": "happy-birthday",
        "title": "Happy Birthday",
        "description": "Two-line birthday greeting.",
        "author": "Signatur",
        "font_size": 3,
        "align": "center",
        "text": [
            ["Helvetica 4L", "H"],
            ["Helvetica 4L", "a"],
            ["Helvetica 4L", "p"],
            ["Helvetica 4L", "p"],
            ["Helvetica 4L", "y"],
            [null, "\n"],
            ["Helvetica 4L", "B"],
            ["Helvetica 4L", "i"],
            ["Helvetica 4L", "r"],
            ["Helvetica 4L", "t"],
            ["Helvetica 4L", "h"],
            ["Helvetica 4L", "d"],
            ["Helvetica 4L", "a"],
            ["Helvetica 4L", "y"]
        ]
    }
]
```

## Validation

Both shapes are validated server-side:

- `validateProfile(profile)` in `lib/util/profile.js` returns an array of error messages for the profile body (empty when valid).
- `validateInspirations(array)` validates the inspirations payload.
- `validateProfileSubmission(profileText, inspirationsText)` is the combined entry point used by the `POST /profiles` and `POST /profiles/validate` endpoints; it parses the JSON, returns any parse errors, and aggregates the schema errors with `profile:` / `inspirations:` prefixes.
- `validateProfileFilesystem(profile, editTarget, directoryPath)` adds the on-disk rules (id collision in create mode, missing target in edit mode, rename collision) that complement the schema check.

Authoritative enum values:

- `unit` &mdash; `mm`, `px`
- `orientation` &mdash; `portrait`, `landscape`
- `shape` &mdash; `rectangle`, `circle`, `heart`
- `font_size.mode` &mdash; `manual`, `automatic`
- `text.align` / `inspiration.align` &mdash; `left`, `center`, `right`
- `text.vertical_align` &mdash; `top`, `middle`, `bottom`
