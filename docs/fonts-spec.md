# Fonts Specification

This document describes the on disk layout, the filename rules and the wire format of the font catalog owned by the admin UI under `/settings`. The authoritative validator lives in `lib/util/emojis.js`; this document tracks it.

## On disk layout

Fonts live under `static/fonts/` with the following structure:

```text
static/fonts/
  coolemojis.ttf                  Cool Emojis display font (browser)
  coolemojis.mapping.json         Cool Emojis display to engraving bridge
  helvetica4l.ttf                 text font display half (browser)
  ...
  f3s/
    emoji/                        Cool Emojis engraving glyphs (one per char)
      1101.coracao.f3s
      1102.estrela.f3s
      ...
    fonts/                        text fonts engraving halves
      helvetica4l.f3s
      ...
```

For Cool Emojis the display side ships a single `.ttf` covering every character used in the catalog (A-Z, a-z by default) while the engraving side ships one `.f3s` file per emoji glyph. The `coolemojis.mapping.json` payload bridges the two surfaces, mapping each displayed character to the engraving glyph that should be rendered for it. For regular text fonts the display and engraving halves are one to one and share the same canonical `<name>` stem.

## Filename rules

Filenames are validated server side so that arbitrary paths cannot be crafted through the URL or the form fields when reading, writing, or deleting on disk.

| Surface         | Pattern                                  | Notes                                                                                                |
| --------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| emoji `.f3s`    | `^[a-z0-9]+(?:[-.][a-z0-9]+)*\.f3s$`     | Lowercase alphanumeric segments separated by hyphens or dots so the `1101.coracao` form keeps working.|
| text font name  | `^[a-z0-9]+(?:-[a-z0-9]+)*$`             | Lowercase alphanumeric segments separated by hyphens, no leading or trailing hyphen.                 |

## Mapping JSON

The optional `coolemojis.mapping.json` payload is a flat object mapping each displayed character to the engraving glyph slug. Every value must be a string; arrays, nested objects and non string values are rejected.

```json
{
    "A": "1101.coracao",
    "B": "1102.estrela",
    "C": "1103.infinito"
}
```

## Validation

- `validateEmojisFont(buffer)` in `lib/util/emojis.js` checks the leading four bytes of the uploaded font payload against the TrueType `00 01 00 00` and OpenType `OTTO` magic byte signatures and rejects anything else.
- `validateEmojisMapping(text)` parses the mapping payload, ensures it is a plain object, and validates that every entry value is a string.
- `EMOJI_F3S_FILENAME_PATTERN` and `FONT_NAME_PATTERN` are exported from the same module and used by the route guards.
- `.f3s` payloads themselves are not validated content wise, per the scoping discussion across the signatur, colony print and gravo pilot repositories. The bytes flow straight from the admin upload to the engraving machine.

## Admin endpoints

Every endpoint below is gated by `lib.requireAdmin`.

| Method | Path                                       | Notes                                                                                       |
| ------ | ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `POST` | `/settings/emojis`                         | Replace the Cool Emojis `.ttf` and, optionally, the companion mapping JSON.                 |
| `GET`  | `/settings/emojis/f3s`                     | List installed emoji engraving glyphs as `{ fonts: [{ name, size, mtime }, ...] }`.         |
| `POST` | `/settings/emojis/f3s`                     | Upload one emoji engraving glyph; form fields are `filename` plus the `file` payload.       |
| `POST` | `/settings/emojis/f3s/:filename/delete`    | Delete one emoji engraving glyph by filename.                                               |
| `GET`  | `/settings/fonts`                          | List installed text fonts as `{ fonts: [{ name, ttf, f3s }, ...] }` rows.                   |
| `POST` | `/settings/fonts`                          | Upload one paired text font; form fields are `name` plus the `ttf` and `f3s` file payloads. |
| `POST` | `/settings/fonts/:name/delete`             | Delete both halves of a text font by canonical name.                                        |

## Wire format with colony print

The engraving payloads uploaded through the admin UI are hosted under `/static/fonts/...` and consumed in the viewport. Shipping them inline to colony print on every print job, so the engraving machine can install them per job through gravo pilot's [Extra Fonts](https://github.com/hivesolutions/gravo-pilot/blob/master/README.md#extra-fonts) kwarg, is tracked as a follow up in #56 against the [Gravo Print Payload](https://github.com/hivesolutions/colony-print/blob/master/README.md#gravo-print-payload) section of colony print's README.
