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

| Name            | Type  | Default                              | Description                                                                                                            |
| --------------- | ----- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `BASE_URL`      | `str` | `http://localhost:3000`              | The base URL that is going to be used in the construction of external URLs for Signatur.                               |
| `SIGNATUR_KEY`  | `str` | `None`                               | Secret key that should be passed in protected calls so that the server side "trusts" the client side (authentication). |
| `HEADLESS_URL`  | `str` | `https://headless.stage.hive.pt`     | The base URL to be used to access [Headless](https://github.com/hivesolutions/headless).                               |
| `PRINT_URL`     | `str` | `https://colony-print.stage.hive.pt` | The base URL to be used to access [Colony Print](http://colony-print.hive.pt).                                         |
| `PRINT_NODE`    | `str` | `default`                            | The name of the print node to be used when accessing Colony Print.                                                     |
| `PRINT_PRINTER` | `str` | `printer`                            | The name of printer (within print node) to be used by Colony Print.                                                    |
| `PRINT_KEY`     | `str` | `null`                               | The secret key to be used when accessing Colony Print service.                                                         |

## Query Parameters

The following query parameters are honored by the Signatur HTTP routes. Most of them are also persisted on the user session (`theme`, `locale`, `text`) or restored from the URL on page load (viewport editor state) so they survive navigation.

### Theme and locale

| Route        | `theme` | `locale` | `fullscreen` |
| ------------ | :-----: | :------: | :----------: |
| `/`          |    ✓    |    ✓     |      ✓       |
| `/gateway`   |    ✓    |    ✓     |      ✓       |
| `/welcome`   |    ✓    |    ✓     |      ✓       |
| `/signature` |    ✓    |    —     |      ✓       |
| `/viewport`  |    ✓    |    —     |      ✓       |
| `/report`    |    ✓    |    ✓     |      ✓       |
| `/console`   |    ✓    |    —     |      —       |
| `/receipt`   |    —    |    ✓     |      —       |
| `/image`     |    —    |    ✓     |      —       |

| Name         | Type  | Default | Description                                                                                                                                |
| ------------ | ----- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `theme`      | `str` | `""`    | Visual theme identifier applied to the body (e.g. `ldj`). Persisted on the session for subsequent requests.                                |
| `locale`     | `str` | `""`    | Locale identifier used to pick a localized view (e.g. `pt_pt`). Persisted on the session and used to load the matching `*-${locale}.ejs`.  |
| `fullscreen` | `str` | `"0"`   | When set to `"1"`, enables the `apple-mobile-web-app-capable` meta. The viewport editor preserves the value across `history.replaceState`. |

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

## Printing

To be able to enable printing the following JavaScript code should be used inside Browser's JavaScript console:

```javascript
localStorage.setItem("url", "https://colony-print.stage.hive.pt");
localStorage.setItem("node", "${node-name}");
localStorage.setItem("printer", "${node-printer}");
localStorage.setItem("key", "${server-key}");
```

To read the configuration you can use the following JavaScript code:

```javascript
console.info(localStorage.getItem("url"));
console.info(localStorage.getItem("node"));
console.info(localStorage.getItem("printer"));
console.info(localStorage.getItem("key"));
```

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

[![Build Status](https://app.travis-ci.com/hivesolutions/signatur.svg?branch=master)](https://travis-ci.com/github/hivesolutions/signatur)
[![Build Status GitHub](https://github.com/hivesolutions/signatur/workflows/Main%20Workflow/badge.svg)](https://github.com/hivesolutions/signatur/actions)
[![npm Status](https://img.shields.io/npm/v/signatur.svg)](https://www.npmjs.com/package/signatur)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](https://www.apache.org/licenses/)
