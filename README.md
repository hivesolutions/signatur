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
