# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

* Profile manager screen at `/profiles/manager` with inline JSON editors for the profile and inspirations payloads, validated server side via the existing profile and inspirations schemas before being written to `static/profiles/` under the validated profile id
* Optional `Load from file` picker next to each JSON editor that reads the selected file as text into the editor textarea so the editor remains the source of truth on submit
* Reference panel on the upload screen with a profile dropdown that previews the picked profile (image, name, key metadata) and a `Use as starting point` button that loads its profile JSON (and matching inspirations when present) into the editor
* `Validate` button on the upload screen that posts the current editor contents to a new `/profiles/validate` endpoint and surfaces the server returned errors inline
* `Preview` tab on the upload reference pane that renders a live summary of the editor payload (image, name, key metadata) using the freshly picked background image as the preview surface, debounced on every input
* `Edit this profile` action on the upload reference pane that opens the selected profile in the editor and flips the form into edit mode so the next save overwrites the existing files via `POST /profiles` with an `edit_target` field, including support for renaming the profile id during edit (the old assets are removed after the new ones are written)
* Mode aware validation that lets create mode reject duplicate ids while edit mode accepts in place updates and renames, refusing only when the edited profile no longer exists on disk or when a rename would clobber another profile, with the same rules applied by `POST /profiles/validate` so the `Validate` button surfaces every error that would block a save
* AJAX save flow on the profile manager that posts the form via `fetch`, returns JSON from `POST /profiles` instead of a redirect, refreshes the reference dropdown in place, surfaces success through the existing toast plugin, and switches the form into edit mode pointing at the freshly saved id so the user never loses the editor context
* Dedicated background asset manager on the profile manager (new `Backgrounds` tab) backed by `GET /profiles/assets`, `POST /profiles/assets`, and `POST /profiles/assets/:filename/delete`, listing every PNG file under `static/profiles/` and offering inline upload and delete with confirmation modal so multiple variants can share the same asset
* Per-asset download button on each background card that points at the public `/static/profiles/<filename>` URL with the native browser `download` attribute so individual PNG assets can be saved locally without leaving the manager
* Profiles bundle export and restore on the profile manager (new `Export / Import` tab) backed by `GET /profiles/bundle` (streams a zip of every profile JSON, inspirations JSON, and PNG asset plus a `manifest.json` entry) and `POST /profiles/bundle` (wipes the profiles directory before unpacking the uploaded archive), with a confirmation modal guarding the destructive full replace semantics
* Decoupled the PNG asset lifecycle from the profile lifecycle: the background picker has been removed from the profile editor, the profile JSON `background` and `variant.background` fields remain plain filename references, profile renames no longer rewrite or delete PNG files, and profile deletes leave PNG assets untouched
* `Editing profile "<id>"` banner at the top of the upload form pane shown only while in edit mode, with an `Exit edit mode` link that reverts the hero, save button, and hidden target field back to the create state without reloading
* `Delete` action on the upload reference pane that opens a confirmation modal and removes the profile assets via `POST /profiles/:id/delete` after the user confirms
* `?edit=<id>` query parameter on `/profiles/manager` that pre-loads the profile and inspirations payloads into the editor on render
* Portuguese (`pt_pt`) translation of the profile manager screen mirroring the existing `manager.ejs` layout
* `Profile Manager` link on the welcome action bar pointing to `/profiles/manager`
* Profile manager jQuery plugin (`plugins/profilemanager.js`, `css/plugins/profilemanager.css`) that encapsulates the manager screen behavior previously inlined in `main.js`, initialized via a single `.form-manager.profilemanager()` call
* JSON syntax highlight jQuery plugin (`plugins/jsonhighlight.js`, `css/plugins/jsonhighlight.css`) that overlays a tokenized colored preview on top of the profile and inspirations textareas, applied automatically by the profile manager so keys, strings, numbers, booleans, null, and punctuation are colored while the native textarea behavior is preserved
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
* Collapsible panel jQuery plugin (`plugins/collapsible.js`, `css/collapsible.css`) extracted from inline logic
* Font size number input alongside range slider with per-profile step granularity
* Shared `.options-input` CSS class for consistent number input styling across controls
* Per-profile jig instructions modal with images, accessible via "Instructions" link in options panel
* Profile variants support with dropdown selector for sub-type overrides (padding, background, font size)
* Viewport preview jQuery plugin (`plugins/viewportpreview.js`) for SVG rendering, rulers, and zoom
* `AGENTS.md` with project conventions for building, testing, plugins, and commit messages
* Plugin CSS files moved to `static/css/plugins/` mirroring the `static/js/plugins/` structure
* JSDoc-style `/** */` docstrings on jQuery plugin definitions with actions and events
* Profile selector jQuery plugin (`plugins/profileselector.js`) for profile and variant dropdown management
* Welcome screen at `/welcome` with a visual template catalog of the available profiles (image, name, dimensions)
* Welcome jQuery plugin (`plugins/welcome.js`, `css/welcome.css`) with `load` and `value` actions
* Forwarding of `profile` and `variant` query parameters from the gateway POST to the editor for template pre-selection
* Session-tracked entry point so the back arrow in the viewport, signature, and report views returns to the welcome screen or classic gateway depending on where the user came from
* Restoration of the previously selected template card on the welcome catalog when navigating back from the editor
* Portuguese (`pt_pt`) translation of the welcome screen mirroring the existing `welcome.ejs` layout
* Documentation of the supported HTTP query parameters in `README.md`, grouped per route with type, default, and description columns
* White background on the welcome screen version footer so it visually matches the action bar above it
* Settings page at `/settings` for selecting the session-persisted `theme`, `locale`, and `fullscreen` values, with a Portuguese translation and a link from the welcome screen action bar
* Session-persisted `home` preference selecting whether the bare `/` URL redirects to the classic gateway or to the welcome screen, defaulting to gateway
* Session-persisted `show_options` preference toggling whether the technology, elements, and location selectors are rendered on the welcome screen and classic gateway, defaulting to on; when off the previously selected values are submitted via hidden inputs so the form still routes correctly
* `docs/profile-spec.md` documenting the profile and inspirations JSON schema sourced from the `lib/util/profile.js` validator, with a pointer from `README.md`
* Optional top-level `default_font` field on the profile schema that auto-selects the matching font (and its keyboard) on initial profile load when no font is already active and no URL `font` parameter is supplied
* Session-persisted `viewport_mode` setting (`technical` default, `store`) on `/settings` that, when set to `store`, applies a `store-mode` body class on `/viewport` whose dedicated `static/css/store-mode.css` hides the profile info panel, the profile and variant selectors, the rulers/crosshair/keyboard/guidelines/caret toggles, the zoom slider, the margin override fields, and the position readout; rulers, crosshair and guidelines visuals are forced off through the existing checkbox change handlers while the keyboard and caret stay active

### Fixed

* `text.max_lines` profile constraint now also enforced on programmatic text loads (inspirations, deep-link `?text=…`, session restore) and when the active profile changes, trimming any overflow newlines and emitting a `change` event so the URL state and button state stay in sync
* Script 4L font glyphs with positive LSB shifted to start at x=0 with adjusted advance widths

* `/profiles` endpoint now handles async errors through Express error middleware
* Invalid CSS `background-position` value corrected to valid 2-value syntax
* Restored text click handler now binds to all non-caret children including newline elements
* Malformed HTML `style` attribute on space bar keyboard keys (extra double quote)
* Small-medal profile description now matches actual 20x20mm dimensions
* Font deselection handler now clears stored font state and updates URL
* Backspace at caret start position no longer corrupts text state
* Server-side validation for `preview.zoom` field in profile schema
* `lang` attribute on Portuguese views (`welcome-pt_pt.ejs`, `gateway-pt_pt.ejs`, `report-pt_pt.ejs`) corrected from `en` to `pt`
* Welcome catalog `background-image` URLs now pass profile filenames through `encodeURI` to guard against malformed CSS

### Changed

* Compacted and modernized the font selector row above the visual keyboards (`.fonts-container`): tiles are now full-pill chips with a soft white fill, no hard border, a subtle resting shadow, lift-on-hover, and a dark filled selected state matching the Engrave button language; in-tile font preview (each label rendered in its own typeface) is preserved, and tile height drops from 46px to 36px (with tighter row margin) so the row reclaims ~20px of vertical real estate
* Refreshed the visual keyboards (`.keyboard-container`, `.emojis-container`, `.emojisp-container`) with a frosted glass aesthetic: translucent white keys with `backdrop-filter: blur(8px)` and a soft inner highlight, 10px rounded corners, hover deepens the shadow and lifts 1px, active presses in with an inset shadow; the keyboard surface itself now sits in a soft tinted card with a 16px radius and a subtle gradient backdrop so the frosted keys read as floating tiles
* Introduced a `utility` class on the special keys (`⌫`, `⎵`, `↵`, `⇧`) that gives them a translucent grey fill and slightly smaller glyph so they visually separate from the letter rows, and widened the Space bar from 96px to 220px so it reads like a real keyboard space; the Shift active state picks up a lavender tint that matches the rest of the engraving studio palette
* Refreshed the welcome catalog template cards to a refined glass card aesthetic for consumer-facing jewelry store users: borderless cards with soft layered shadows that deepen and lift on hover, 16px outer radius with a nested 12px inner image panel carrying an inset highlight, taller 150px image area so the necklace photography breathes, name aligned left next to a soft chip-style dimension badge, and a confident 2px selected ring that replaces the previous thin border (matching purple ring in the `ldj` theme)
* Refreshed the site-wide button visual language to a softer, rounder feel: full pill `border-radius`, taller comfortable 38px height, breathable horizontal padding, smooth color and press transitions; viewport header `Back`, `Clear` and `Report` buttons now read as soft-surface secondaries (light grey fill) while `Engrave` keeps the dark filled primary treatment, restoring visual hierarchy on the action bar
* Aligned the surrounding surface chrome with the new rounder language by bumping `.input` and the floating profile info / inspiration panel border radii from 6px to 12px, and re-anchoring the panels under the slightly taller header (78px → 84px / 220px → 226px) so the breathing room above each panel is preserved
* Welcome action bar `button-ghost` variant now uses the same soft-surface fill instead of a 1px outlined pill so it matches the new system
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
