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
* Margin override controls in viewport options panel with real-time preview
* Margins included in the engraving confirmation report
* Application icon (SVG, PNG 512/180/32) with monospaced S on blue gradient
* Favicon and Apple touch icon references in HTML head
* Icon generation script (`npm run icons`) using sharp
* Circular profile shape support with `shape: "circle"` field
* New "small-medal" circular profile (20x20mm)
* Circle boundary rendering in viewport preview for circular profiles
* Zoom slider in viewport options panel with per-profile default zoom and layout compensation
* Collapsible viewport options and profile info panels with animated toggle
* Dynamic profile info panel title showing the selected profile name
* Crosshair lines on viewport hover with toggleable visibility checkbox
* Position readout in viewport options panel showing X/Y coordinates in mm
* Show Keyboard toggle checkbox in viewport options panel to hide/show the visual keyboard
* Selected class tracking on the active keyboard container for font-based key validation
* Single-line constraint when no profile is selected (max 1 line)
* Emoji validation script (`scripts/emoji_validation.py`) for visual glyph-to-F3S mapping verification
* Missing emoji keyboard keys for all Cool Emojis TTF glyphs (`0`, `@`, `$`, `%`, `&`, `(`, `)`, `` ` ``, `[`, `{`, `|`, `}`)
* Optional background image support for viewport profiles (`background` field)
* Show Guidelines toggle checkbox in viewport options panel to hide/show SVG bounds and safe area
* Show Caret toggle checkbox in viewport options panel to hide/show the blinking caret
* URL persistence for rulers, crosshair, keyboard, guidelines, and caret visibility toggles
* Font metrics rendering script (`scripts/font_metrics.py`) for visual glyph metric inspection
* Inspiration presets system with per-profile pre-built configurations
* Collapsible inspiration panel on the right side showing 3 thumbnail previews
* Full-screen inspiration modal with 4-column grid, search, and click-to-apply
* Inspiration plugin (`plugins/inspiration.js`) with event-driven architecture
* Dedicated inspiration CSS file (`css/inspiration.css`) for panel and modal styles
* Hover zoom and active press animations on inspiration preview thumbnails
* Sample inspirations for small-medal profile including emoji presets
* Modal `hide` action for programmatic dismiss with animation

### Fixed

* Script 4L font glyphs with positive LSB shifted to start at x=0 with adjusted advance widths

* `/profiles` endpoint now handles async errors through Express error middleware
* Invalid CSS `background-position` value corrected to valid 2-value syntax
* Restored text click handler now binds to all non-caret children including newline elements
* Malformed HTML `style` attribute on space bar keyboard keys (extra double quote)
* Small-medal profile description now matches actual 20x20mm dimensions
* Font deselection handler now clears stored font state and updates URL
* Backspace at caret start position no longer corrupts text state
* Server-side validation for `preview.zoom` field in profile schema

### Changed

* Corrected Cool Emojis character-to-F3S font mapping using visual glyph recognition
* Sorted `coolemojis.mapping.json` by font number for better structure

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
