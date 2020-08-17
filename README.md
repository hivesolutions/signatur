# Signatur

Simple vector signature service to be used to convert signatures.

Signatures from the client-side into beautiful files ready to be downloaded.

Supported file format include:

* [SVG](https://en.wikipedia.org/wiki/Scalable_Vector_Graphics) - Scalable Vector Graphics
* [PDF](https://en.wikipedia.org/wiki/PDF) - Portable Document Format
* [HPGL](https://en.wikipedia.org/wiki/HP-GL) - Hewlett-Packard Graphics Language

## Features

* Canvas based drawing, to be used in signatures
* Viewport for drawing of text

## Configuration

| Name           | Type  | Default | Description                                                                                                            |
| -------------- | ----- | ------- | ---------------------------------------------------------------------------------------------------------------------- |
| `SIGNATUR_KEY` | `str` | `None`  | Secret key that should be passed in protected calls so that the server side "trusts" the client side (authentication). |

## License

Signatur is currently licensed under the [Apache License, Version 2.0](http://www.apache.org/licenses/).

## Build Automation

[![Build Status](https://travis-ci.org/hivesolutions/signatur.svg?branch=master)](https://travis-ci.org/hivesolutions/signatur)
[![npm Status](https://img.shields.io/npm/v/signatur.svg)](https://www.npmjs.com/package/signatur)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](https://www.apache.org/licenses/)
