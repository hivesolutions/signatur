# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

* Support for toggling the visual keyboard by clicking the same font again
* Support for multiple lines with Enter key and visual keyboard `↵` button
* Enforcement of `max_lines` profile constraint when inserting newlines
* Display of max lines in the profile info panel
* Dry run checkbox in the engraving confirmation modal
* Raw profile JSON viewer with show/hide toggle in the profile info panel
* Newline rendering in report views (EN and PT)
* Horizontal and vertical rulers adjacent to the viewport preview
* Arrow key navigation (left, right, up, down) for caret movement
* Delete key support for forward character deletion
* Floating viewport options panel with profile selection, font size controls, and rulers toggle

### Changed

* Line height in viewport preview now scales proportionally to font size (1.2x)
* Moved profile and font size controls from inline layout to fixed options panel

## [0.7.2] - 2024-05-18

### Changed

* Bumped pstoedit version to 4.01

## [0.7.1] - 2024-05-18

### Changed

* Bumped base nodejs version in `Dockerfile` to 18

## [0.7.0] - 2024-05-18

### Added

* Support for escaping of characters in the key selection

### Changed

* Added new characters to the `coolemojis.ttf` font

### Fixed

* Keyboard backspace and space keys issue - [[#4](https://github.com/hivesolutions/signatur/issues/4)]

## [0.6.1] - 2022-11-12

### Fixed

* Keyboard backspace and space keys issue - [[#4](https://github.com/hivesolutions/signatur/issues/4)]

## [0.6.0] - 2022-11-08

### Added

* Support for physical keyboard typing

### Fixed

* CI/CD integrations to make them compliant with new node versions

## [0.5.5] - 2022-11-08

### Fixed

* Small tilde character in emoji font

## [0.5.4] - 2022-11-08

### Fixed

* Added the new characters to cool emojis fonts

## [0.5.3] - 2022-11-08

### Changed

* Added new versions of `coolemojis.ttf` and `coolemojisp.ttf` fonts - [[#2](https://github.com/hivesolutions/signatur/issues/2)

## [0.5.2] - 2022-09-27

### Fixed

* Removed `graphic_element` from `diamond`

## [0.5.1] - 2021-10-17

### Added

* New symbols added to both the base `coolemojis.ttf` font and the `coolemojisp.ttf`

## [0.5.0] - 2021-10-06

### Added

* Support for the `/image` URL for PNG image generation

## [0.4.1] - 2021-09-24

### Added

* Support in report for calligraphy

## [0.4.0] - 2021-09-24

### Added

* Support for order number, size and observations

## [0.3.2] - 2021-08-31

### Added

* More symbols to the `coolemojis.ttf` font

## [0.3.1] - 2021-08-30

### Added

* Version information to footer

### Changed

* Bumped packages

## [0.3.0] - 2021-08-30

### Added

* Support for new character for font `coolemojisp.ttf` (V, W, X, Y, Z, a, b, c, d, e, f and g)

## [0.2.1] - 2021-07-08

### Added

* Small touch of files

## [0.2.0] - 2021-07-08

### Added

* Support for display of main font in report and receipt
* Added new cool emoji icons
