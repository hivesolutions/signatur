# Signatur

Simple vector signature service to be used to convert signatures.

Signatures from the client-side into beautiful files ready to be downloaded.

Supported file format include:

* [SVG](https://en.wikipedia.org/wiki/Scalable_Vector_Graphics) - Scalable Vector Graphics
* [PDF](https://en.wikipedia.org/wiki/PDF) - Portable Document Format
* [HPGL](https://en.wikipedia.org/wiki/HP-GL) - Hewlett-Packard Graphics Language

## Features

* Canvas based drawing, to be used in signatures
* Viewport for drawing of text and emoji
* Uses [canvas2svg](http://gliffy.github.io/canvas2svg) for SVG output

## Configuration

| Name                  | Type   | Default                              | Description                                                                                                                                                                                                                     |
| --------------------- | ------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BASE_URL`            | `str`  | `http://localhost:3000`              | The base URL that is going to be used in the construction of external URLs for Signatur.                                                                                                                                        |
| `SIGNATUR_KEY`        | `str`  | `None`                               | Secret key that should be passed in protected calls so that the server side "trusts" the client side (authentication).                                                                                                          |
| `HEADLESS_URL`        | `str`  | `https://headless.stage.hive.pt`     | The base URL to be used to access [Headless](https://github.com/hivesolutions/headless).                                                                                                                                        |
| `PRINT_URL`           | `str`  | `https://colony-print.stage.hive.pt` | Base URL of the [Colony Print](http://colony-print.hive.pt) service used for both the engraving job and the receipt printing.                                                                                                   |
| `PRINT_NODE`          | `str`  | `default`                            | Name of the Colony Print node to use when printing the report receipt.                                                                                                                                                          |
| `PRINT_PRINTER`       | `str`  | `printer`                            | Name of the printer (within the receipt node) to use when printing the report receipt.                                                                                                                                          |
| `PRINT_KEY`           | `str`  | `null`                               | Secret key used to authenticate against Colony Print; shared by both the engraving job and the receipt printing.                                                                                                                |
| `ENGRAVE_NODE`        | `str`  | value of `PRINT_NODE`                | Name of the Colony Print node to use when sending an engraving job; falls back to `PRINT_NODE` so existing single-printer deployments keep working.                                                                             |
| `ENGRAVE_PRINTER`     | `str`  | value of `PRINT_PRINTER`             | Name of the printer (within the engrave node) to use when sending an engraving job; falls back to `PRINT_PRINTER` for the same backward compat reason.                                                                          |
| `FEATURE_CALLIGRAPHY` | `bool` | `false`                              | Base value of the calligraphy feature flag; when set to a truthy value (`1`, `true`, `yes`, `on`) the calligraphy mode controls render on `/viewport`. May be overridden per session through the `Features` tab on `/settings`. |

## Authentication

Every interactive route is gated behind a session login. The list of valid users lives in `config/users.json` (gitignored, with a `config/users.json.example` checked into the repository) as an array of `{ "username": "...", "password_hash": "$2a$...", "role": "admin" | "user" }` entries; the `role` controls whether the user can reach the admin-only surfaces (`/settings`, `/settings/diagnostics`, `/profiles/*`) or just the basic engraving flow.

New users are added through the `npm run user:add <username> <role>` helper which prompts for the password twice (no echo), bcrypts it at cost 10 and rewrites `config/users.json` in place; the running application picks the change up automatically through `fs.watch` so no restart is required. The bare `/login` and `/logout` routes, the `/info` endpoint, the static assets and the engine `/convert` endpoint (key authenticated through `SIGNATUR_KEY`) stay public.

## Query Parameters

The following query parameters are honored by the Signatur HTTP routes. Most of the session level toggles (`theme`, `locale`, `text`, `fullscreen`, etc.) are persisted to the cookie session on first sight and then read from the session on every subsequent request, so they never need to be carried around through the URL once they have been set. The viewport editor still round-trips its visual state through the URL so a `/viewport` link can be shared or bookmarked verbatim, but those keys are scoped to the viewport page and are not propagated to other sections.

### Session persistence

| Parameter       | Session-persisted | Notes                                                                                                                                                                                                                                                                                                                  |
| --------------- | :---------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `theme`         |        yes        | Written to `req.session.theme` on every page that reads it except `/console`, which reads but does not write.                                                                                                                                                                                                          |
| `locale`        |        yes        | Written to `req.session.locale` on every page that reads it.                                                                                                                                                                                                                                                           |
| `text`          |        yes        | Written to `req.session.config.text` on every page that reads it.                                                                                                                                                                                                                                                      |
| `fullscreen`    |        yes        | Written to `req.session.fullscreen` on every page that reads it; the URL query is honored first as a one-shot override and otherwise the session takes over.                                                                                                                                                           |
| `home`          |        yes        | Set via the `/settings` POST body. Controls whether `/` redirects to `/gateway` (default) or `/welcome`.                                                                                                                                                                                                               |
| `show_options`  |        yes        | Set via the `/settings` POST body. Controls whether the technology / elements / location selectors render on welcome and gateway.                                                                                                                                                                                      |
| `viewport_mode` |        yes        | Set via the `/settings` POST body. Either `technical` (default) or `store` (simplified `/viewport` for store operators).                                                                                                                                                                                               |
| `profile`       |        no         | Stored on the session via the `/gateway` POST body (form field), then forwarded as a query string to the editor on redirect.                                                                                                                                                                                           |
| `variant`       |        no         | Same handling as `profile`.                                                                                                                                                                                                                                                                                            |
| editor state    |        no         | `font`, `font_size`, `font_size_mode`, `zoom`, `margins`, `rulers`, `crosshair`, `keyboard`, `guidelines`, `caret` are written to the URL by the viewport only, and only while `.viewer-container` is mounted on the page so they never leak into `/welcome`, `/gateway`, `/settings` or any other downstream section. |
| `engine`        |        no         | Read once per `/convert` POST.                                                                                                                                                                                                                                                                                         |
| `format`        |        no         | Read once per `/convert` POST.                                                                                                                                                                                                                                                                                         |

### Theme and locale

| Route        | `theme` | `locale` | `fullscreen` |
| ------------ | :-----: | :------: | :----------: |
| `/`          |   yes   |   yes    |     yes      |
| `/gateway`   |   yes   |   yes    |     yes      |
| `/welcome`   |   yes   |   yes    |     yes      |
| `/signature` |   yes   |    -     |     yes      |
| `/viewport`  |   yes   |    -     |     yes      |
| `/report`    |   yes   |   yes    |     yes      |
| `/console`   |   yes   |    -     |      -       |
| `/receipt`   |    -    |   yes    |      -       |
| `/image`     |    -    |   yes    |      -       |

| Name         | Type  | Default | Description                                                                                                                                    |
| ------------ | ----- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `theme`      | `str` | `""`    | Visual theme identifier applied to the body (e.g. `ldj`). Persisted on the session for subsequent requests.                                    |
| `locale`     | `str` | `""`    | Locale identifier used to pick a localized view (e.g. `pt_pt`). Persisted on the session and used to load the matching `*-${locale}.ejs`.      |
| `fullscreen` | `str` | `"0"`   | When set to `"1"`, enables the `apple-mobile-web-app-capable` meta. Persisted on the session; the URL query is honored as a one-shot override. |

### Text payload (`/viewport`, `/report`, `/text`, `/image`, `/receipt`)

| Name   | Type  | Default | Description                                                                                                                |
| ------ | ----- | ------- | -------------------------------------------------------------------------------------------------------------------------- |
| `text` | `str` | `null`  | Serialized text payload to seed the editor or render with (`font/character` pairs). Persisted on the session config field. |

### Template pre-selection (`/viewport`, `/report`)

Forwarded automatically by the gateway POST when the welcome screen is used, but they can also be passed directly to deep-link into the editor with a specific template.

| Name      | Type  | Default | Description                                                                                        |
| --------- | ----- | ------- | -------------------------------------------------------------------------------------------------- |
| `profile` | `str` | `null`  | Profile ID (matches a file under `static/profiles/*.json`) to pre-select in the profile dropdown.  |
| `variant` | `str` | `null`  | Index of the variant to pre-select within the chosen profile, applied after `profile` is restored. |

### Viewport editor state (`/viewport`)

Read by the client and written back via `history.replaceState` so the editor URL always reflects the current state and can be shared or reloaded.

| Name             | Type  | Default | Description                                                                                             |
| ---------------- | ----- | ------- | ------------------------------------------------------------------------------------------------------- |
| `font`           | `str` | `null`  | Currently selected font name; restored by clicking the matching font element on load.                   |
| `font_size`      | `int` | `null`  | Manual font size in profile units; applied to both the slider and the number input.                     |
| `font_size_mode` | `str` | `null`  | Either `manual` or `automatic` for the font size mode toggle.                                           |
| `zoom`           | `int` | `null`  | Zoom percentage applied to the viewport preview; clamped to the slider's min/max range.                 |
| `margins`        | `str` | `null`  | Four comma-separated values (`left,right,top,bottom`) overriding the profile padding, in profile units. |
| `rulers`         | `str` | `"1"`   | When `"0"` hides the horizontal and vertical rulers; any other value (or absent) keeps them visible.    |
| `crosshair`      | `str` | `"1"`   | When `"0"` disables the hover crosshair lines on the viewport preview.                                  |
| `keyboard`       | `str` | `"1"`   | When `"0"` hides the visual keyboard panel until re-toggled.                                            |
| `guidelines`     | `str` | `"1"`   | When `"0"` hides the SVG profile bounds and safe area outlines on the preview.                          |
| `caret`          | `str` | `"1"`   | When `"0"` hides the blinking caret in the viewport preview.                                            |

### `/convert`

| Name     | Type  | Default      | Description                                                                              |
| -------- | ----- | ------------ | ---------------------------------------------------------------------------------------- |
| `engine` | `str` | `"inkscape"` | Conversion engine identifier; resolved against the registered engines (e.g. `inkscape`). |
| `format` | `str` | `"hpgl"`     | Target output format honored by the inkscape engine; one of `svg`, `pdf`, or `hpgl`.     |

## Profiles

The engraving surfaces (medals, plates, rings, etc.) are described by JSON profile files under `static/profiles/`. The schema of these files (and of their companion `*.inspirations.json` files) is documented in [docs/profile-spec.md](docs/profile-spec.md). The authoritative validator lives in `lib/util/profile.js` and is the source the spec document tracks.

## Printing

Signatur drives two independent print jobs through Colony Print: the **engraving** job that is sent from the `/viewport` editor and the **receipt** job that is printed from `/report`. Both share the same Colony Print server URL and the same secret key, but each one targets its own node and printer so a single Signatur install can drive an engraver and a receipt printer that live on different physical machines without any name collision.

The configuration is resolved through a three step fallback chain so existing single printer deployments keep working without any change:

1. **Scenario specific `localStorage` keys** (browser side, highest priority).
2. **Legacy unprefixed `localStorage` keys** (`node`, `printer`) so installs that predate the engrave/receipt split still see their old configuration.
3. **Server side environment variables** rendered into the page as `data-*` fallbacks (`PRINT_URL`, `ENGRAVE_NODE`/`ENGRAVE_PRINTER` for the engrave button, `PRINT_NODE`/`PRINT_PRINTER` for the receipt button, `PRINT_KEY` for both).

The settings page exposes a `Printing` readout that shows the server side base value next to the effective resolved value for each entry, so an operator can verify at a glance which side is active.

### Configuration keys

| `localStorage` key | Scenario | Server side fallback                            | Description                                                                         |
| ------------------ | -------- | ----------------------------------------------- | ----------------------------------------------------------------------------------- |
| `url`              | shared   | `PRINT_URL`                                     | Colony Print base URL; used by both the engrave and the receipt flows.              |
| `key`              | shared   | `PRINT_KEY`                                     | Colony Print secret key; used by both the engrave and the receipt flows.            |
| `engrave_node`     | engrave  | `ENGRAVE_NODE` (defaults to `PRINT_NODE`)       | Colony Print node that receives the engrave job (`POST /nodes/<node>/print`).       |
| `engrave_printer`  | engrave  | `ENGRAVE_PRINTER` (defaults to `PRINT_PRINTER`) | Printer within the engrave node; reserved for the per-printer engrave endpoint.     |
| `receipt_node`     | receipt  | `PRINT_NODE`                                    | Colony Print node that receives the receipt (`POST /nodes/<node>/printers/print`).  |
| `receipt_printer`  | receipt  | `PRINT_PRINTER`                                 | Printer within the receipt node.                                                    |
| `node`             | legacy   | -                                               | Read as a fallback for both `engrave_node` and `receipt_node` so old installs work. |
| `printer`          | legacy   | -                                               | Read as a fallback for both `engrave_printer` and `receipt_printer`.                |

To configure both scenarios from the Browser's JavaScript console:

```javascript
// shared between both scenarios
localStorage.setItem("url", "https://colony-print.stage.hive.pt");
localStorage.setItem("key", "${server-key}");

// engraving job (the /viewport "Engrave" action)
localStorage.setItem("engrave_node", "${engrave-node}");
localStorage.setItem("engrave_printer", "${engrave-printer}");

// receipt printing (the /report "Receipt" action)
localStorage.setItem("receipt_node", "${receipt-node}");
localStorage.setItem("receipt_printer", "${receipt-printer}");
```

To read the configuration:

```javascript
console.info(localStorage.getItem("url"));
console.info(localStorage.getItem("key"));
console.info(localStorage.getItem("engrave_node"));
console.info(localStorage.getItem("engrave_printer"));
console.info(localStorage.getItem("receipt_node"));
console.info(localStorage.getItem("receipt_printer"));
```

The same configuration can also be edited through the `Configure` modal accessible from the gateway and the viewport.

## Maintenance

### Adding New Emoji

To add a new emoji to the system the following steps should be followed:

1. Determine the right file name for the new emoji font file (e.g. `coolemojis.ttf` for laser and `coolemojisp.ttf` for pantogrpah)
2. Place the new font file in the `static/fonts` directory
3. Add the new emoji "characters" to the `emoji` array in the `viewport.ejs` file
4. Test the using the local machine `yarn && yarn dev`
5. Release a new version of the system (Docker Image)

## License

Signatur is currently licensed under the [Apache License, Version 2.0](http://www.apache.org/licenses/).

## Build Automation

[![Build Status](https://github.com/hivesolutions/signatur/workflows/Main%20Workflow/badge.svg)](https://github.com/hivesolutions/signatur/actions)
[![npm Status](https://img.shields.io/npm/v/signatur.svg)](https://www.npmjs.com/package/signatur)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](https://www.apache.org/licenses/)
