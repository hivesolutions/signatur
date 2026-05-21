# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

* `test/lib/smoke.js` mocha suite that boots `app.js` as a child process on a discovered free port and exercises eight live routes (`GET /`, `/gateway`, `/welcome`, `/settings`, `/profiles`, `/profiles/bundle`, `POST /profiles/validate` with a multipart payload, `POST /settings/diagnostics`) plus four module shape probes (`node-fetch`, `multer`, `jszip`, `uuid` must remain `require()` callable with the same shape they expose today) so a future `package.json` bump that breaks the public route surface or that turns a CJS dependency into ESM only is caught by the standard `npm test` ritual; the suite is self contained (no new dependencies, no supertest, just mocha plus node stdlib `http` and `net`), adds ~150 LOC and ~1 second of wall clock to `npm test`, and was validated against an unsaved `node-fetch ^3` install that flipped the require shape from a function to an object (the suite caught the regression as the first failure)
* `.dockerignore` at the repo root that trims the docker build context down to the directories actually copied into the image (`app.js`, `config`, `lib`, `res`, `static`, `views`, `package.json`), excluding `node_modules`, `.git`, `.github`, `docs`, `test`, `scripts`, the venv, lockfiles, dotfiles and markdown documentation so the build context is smaller and the resulting image cannot leak unrelated repository content through an accidental `ADD .`
* Diagnostics tab on `/settings` with a single `Run diagnostics` button that probes the engraving pipeline tools (`inkscape --version`, `gs --version`, `pstoedit -help`) and then exercises the full SVG → PDF → PS → HPGL chain against a bundled `res/diagnostic.svg` fixture, reporting per tool version banners and per pipeline step status, output byte count, elapsed milliseconds and captured stderr tail so an operator can confirm the install is healthy and locate any failing step without ssh access; the tab is owned by a new `plugins/diagnostics.js` jQuery plugin paired with `css/plugins/diagnostics.css`, the server side endpoint lives at `POST /settings/diagnostics` and is a thin wrapper over the `Inkscape` engine's new `probe()` and `diagnose(svgBuffer)` methods so the engine remains the single source of truth for the pipeline shape

### Changed

* Bare filename entries in `instructions.images` on a profile JSON are now resolved against `/static/profiles/` (the default upload location for profile assets) so authors can reference uploaded jig images by filename only; entries that already start with `/` or carry a `scheme://` prefix are still passed through verbatim so external URLs and other absolute paths keep working unchanged, with the same detection rule documented on `docs/profile-spec.md`
* `.github/workflows/dockerx.yml` now produces a max mode SLSA provenance attestation and an SPDX SBOM (`provenance: mode=max`, `sbom: true` on `docker/build-push-action@v5`) so Docker Scout and other supply chain scanners can verify the build origin and inspect the package inventory of the pushed image without a separate post-build step
* `.github/dependabot.yml` enabling weekly automated update PRs for the `docker` ecosystem (the `Dockerfile` base image tag) and for the `github-actions` ecosystem (every `uses:` reference in the workflow files), with the `chore` commit prefix so the generated PRs match the project's Conventional Commits convention out of the box
* Every `Back` affordance now points to the bare `/` instead of branching on the entry point: the `back:` template variable rendered for `/viewport`, `/signature` and `/report` is hardcoded to `/`, and the hardcoded `/welcome` `Back` / `Voltar` links on the profile manager (`views/manager.ejs`, `views/manager-pt_pt.ejs`) and the `Back` / `Voltar` fallback on the settings screen (`views/settings.ejs`, `views/settings-pt_pt.ejs`) are also pointed at `/`; the `/` route dispatches to the user's chosen home screen (gateway or welcome) according to the session `home` preference, so the back button now respects that preference uniformly instead of being pinned to whichever entry point the user came in through this session; the `req.session.entry` plumbing on the gateway POST handler is left in place even though it is now read by nobody so a future feature can rewire it without a schema change
* `Dockerfile` collapsed to a single stage on `node:20-trixie-slim` that `apt-get install`s `ghostscript`, `inkscape`, and `pstoedit` directly from the Debian 13 archive (pstoedit 4.02 on trixie) instead of building pstoedit from source under a separate builder stage on `node:20-bookworm-slim`, so each build avoids a 5-10 minute compile step and the resulting image no longer carries the source tarball, the `g++` toolchain, or any custom `--prefix=/opt/pstoedit` layout; the production image keeps the same `npm install --omit=dev` pruning, the dedicated `signatur` UID/GID 10001 non root user, the `COPY` (not `ADD`) layering, and the `ENV KEY=VALUE` form, while the image label `version` is bumped to `2.1` to reflect the shape change
* `lib/engines/inkscape.js` pipeline now routes the PDF produced by Inkscape through Ghostscript's `ps2write` device before handing the result to `pstoedit`, because `pstoedit` no longer reads PDF input directly when Ghostscript is newer than 9.56.1 (Debian bookworm ships 10.0.0, trixie ships 10.05.1) and the PDF interpreter API it relied on was removed upstream; the intermediate `${identifier}.ps` artifact is wired into `_cleanup` so a successful run leaves no residue, and the per step command argv definitions are now owned by a single private `_pipelineSteps(identifier, format)` builder consumed by both the existing `convert` flow and the new diagnostics flow, with sibling `probe()` and `diagnose(svgBuffer)` methods added to the engine so the diagnostics endpoint never has to redefine an argv that the engine already owns

## [1.0.0] - 2026-05-21

### Added

* Optional `sku` field on the profile schema that, when present, is rendered as quiet monospaced metadata between the product name and the dimension pill on every welcome catalog card so operators can identify the matching stock keeping unit at a glance; the field is validated as an optional string in `lib/util/profile.js` and documented in [docs/profile-spec.md](docs/profile-spec.md) ([#30](https://github.com/hivesolutions/signatur/issues/30))
* `button-tiny` size variant on the `.button` component mirroring the existing `button-small` shape at a smaller 28×28 scale with a 9px label, so very small affordances like the `Instructions` link on the viewport options panel can use the established button language instead of a one off styled link
* iOS Safari touch responsiveness pass: `touch-action: manipulation` is applied at the body level and reinforced on every interactive surface (`.button`, `.option-chip`, `.option-chip-toggle`, `.slider-preset`, `.settings-tab`, `.emojis-tab`, keyboard `.char`, `.catalog-card`, `.fonts-container > .font`) so the first tap registers immediately without the legacy hover stall; the viewport meta is locked at `maximum-scale=1, user-scalable=no` so neither double tap nor pinch can zoom the page; the body also sets `-webkit-tap-highlight-color` to transparent so taps no longer flash the iOS gray overlay
* Container level fallback caret click handler on the viewer container that resolves taps landing outside any character span to the nearest character, working around iOS Safari's touch hit-test that occasionally promotes the click target to the closest interactive ancestor when the tap falls in the few pixel gap before or after a span
* Entrance animation for the viewport preview that fades the engraving surface in with a subtle three pixel translate up using a `cubic-bezier(0.22, 1.2, 0.36, 1)` ease so the moment a profile becomes active feels deliberate rather than abrupt; runs once per `.profile-active` activation
* New slider control on the viewport options panel that replaces the legacy native range plus number input plus auto checkbox triplet with a preset chip row above a visually enlarged slider; the chips share the existing option chip language (`S` / `M` / `L` / `XL` / `Auto` for the font size, `1x` / `2x` / `3x` for the zoom) and turn the slider into a quick destination picker without losing the fine grained scrubbing affordance, while a tooltip bubble floats above the thumb showing the live value with the profile unit only while the user is actively dragging so the panel stays uncluttered when idle; the visual layer lives under a shared `.slider-field` / `.slider-presets` / `.slider-preset` / `.slider-track` / `.slider-range` / `.slider-bubble` / `.slider-dragging` class set so both the font size and the zoom containers compose the same look through class composition (`viewport-options-field slider-field font-size-container`), the bubble positioning is owned by a single `refreshSliderBubble(range, bubble, formatter)` helper that each container wraps with its own unit suffix, and the existing `font-size-input` / `font-size-mode` hidden form controls are kept verbatim so the URL persistence, the modal specs and every downstream consumer keep working without any change to their code; the legacy `.zoom-value` static label is removed in favor of the live bubble
* Separate Colony Print configuration for the engraving job and the receipt printing so a single Signatur install can drive an engraver and a receipt printer that live on different nodes without any name collision; the colony print base URL and the secret key remain shared between both scenarios, while `engrave_node` / `engrave_printer` (with legacy `node` / `printer` fallback) and `receipt_node` / `receipt_printer` (same legacy fallback) are read independently by the engrave and the receipt code paths
* `ENGRAVE_NODE` and `ENGRAVE_PRINTER` server side environment variables that feed the `data-node` / `data-printer` attributes rendered onto the viewport `Engrave` button so deployments that do not configure the browser side `localStorage` still pick up a sensible default; both fall back to `PRINT_NODE` / `PRINT_PRINTER` so existing single printer installs keep working
* Tabbed `/settings` screen with a `General` tab for the existing preferences (theme, locale, fullscreen, home, show options, viewport mode, version) and a dedicated `Printing` tab that exposes the Colony Print configuration; each printing entry renders as a card with the label on top and two pill-shaped sub lines underneath, a disabled `Base` pill showing the server side `lib.conf` value and an editable `Effective` input prefilled with the resolved value so operators can override any entry inline; the form submit handler persists each input to its matching `localStorage` key (or removes it when blank so the base takes over again)
* Localized data attributes on the confirmation modal so each viewport locale template owns its own label set (`Texto`, `Letra`, `Perfil`, `Área`, `Tam. Letra`, `Margens`, `Espaç. Extra`, `Área Final`, `Nó`, `Suporte` for `pt_pt`); the modal also renders a friendly subtitle (`Ready to engrave on …` / `Pronto para gravar em …`), pill chips for each multifont text segment, an amber/lavender empty hint that blocks the primary action with the `Engrave` button greyed out when no text was entered, and a `Dry run` / `Simulação` chip toggle that replaces the legacy checkbox; the secondary `Cancel` / `Cancelar` button adopts the ghost variant so the engrave action stays visually dominant
* `data-message-no-printer` / `data-message-pantograph` data attributes on the viewport body so the engrave guard error messages are owned by each locale template instead of being hardcoded; the missing printer message now points the user to `/settings` and is required whenever any of `url`, `node`, `printer` or `key` is unset
* `Settings` / `Definições` link on both gateway action bars so the configuration screen is reachable from the gateway in either locale (the EN gateway previously exposed a `Configure` button that opened the legacy modal, while the PT gateway had no entry point at all)
* QWERTY layout on the on screen text keyboard with `<br>` row separators that respect the existing `.keyboard-container > .char` styling, an iOS style utility row at the bottom (`123` mode toggle, spacebar, return) and a dedicated `Shift`/`Backspace` placement at the edges of the Z row; a letters/symbols toggle mirrors the existing `.lowercase` casing toggle pattern by adding a `.symbols` class on the container that swaps a 3 row symbols layout (10/10/5) in place of the letters rows, with a separate backspace inside the symbols section so it remains reachable when the Z row is hidden
* Themed tabs above each emoji keyboard that split the large flat key list into 5 categories (`Symbols`/`Símbolos`, `Nature`/`Natureza`, `People`/`Pessoas`, `Pop`, `Phrases`/`Frases`) for the Cool Emojis font and 4 categories (`Symbols`, `Nature`, `People`, `Pop`) for the Cool Emojis Pantograph font; tabs are wired through the existing keyboard plugin via a `data-active` attribute on the container plus `data-category` on each `.char`, the visibility rules live in plugin CSS so the active category is the only one rendered, and the container width is constrained to 10 emojis per row with the utility keys (`⌫`, `⎵`, `↵`) placed on a dedicated row via a `<br>` separator so they never mingle with the glyph grid
* Mobile viewport block under 430px wide that overlays every page with a centered notice telling the user that Signatur is not designed for mobile devices, fully inert so the underlying UI cannot be interacted with; implemented as a CSS-only `body::before` pseudo-element driven by the existing `<html lang="…">` attribute so the English and Portuguese copies switch automatically with no per-page markup edits, with `ldj` theme tints picked up from the body class
* `Version` field on `/settings` rendered as a soft-fill pill that replaces the legacy per-page `welcome-version` footer (removed from welcome, profile manager and gateway views) so the application version lives in a single, predictable place
* Preview mode on `/viewport` triggered by a new header icon button (Ionicons `expand-outline`) and reversible via the Esc key or a floating exit hint: layers a layered fade-out of the chrome (header, profile info, inspirations panel, viewport options, font row, keyboards) with `cubic-bezier(0.16, 1, 0.3, 1)` easing while compounding the current zoom by 1.5x for a cinematic centered preview; the underlying toggle states are snapshotted on enter and restored on exit through their existing change handlers, with the `restoring` flag (wrapped in `try`/`finally`) suppressing URL writes so the temporary off state never persists
* `cookie-session` based session middleware that replaces the in-memory `express-session` store with a signed cookie payload, so UI preferences (theme, locale, last text, profile, viewport mode) survive Node restarts without any server side storage; the secret is hardcoded because the session only carries non sensitive UI state
* Modernized native keyboards with a soft entry/exit motion: `keyboard-enter` keyframe (0.5s out-expo) plays automatically when a keyboard becomes visible, `keyboard-leaving` class (0.25s in-quint) plays the reverse before `display: none` so font switches go through a sequenced leave-then-enter handoff instead of snapping
* Profile JSON / Inspirations JSON dropdown selector on `/profiles/manager` that swaps the two textareas in place to reclaim vertical space, and auto routes the user to the failing editor when validation or save errors come back with `profile:` / `inspirations:` prefixes
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

### Changed

* The viewport preview reclaims about 52px of vertical space when the rulers are toggled off: the body now carries a `rulers-off` class that collapses the preview's top reservation from 48px to 8px and the bottom gap from 16px to 4px, so the chrome-free vertical room recovered from the hidden ruler labels feeds straight back to the editing surface instead of sitting empty; the class is flipped through the existing rulers change handler and seeded on initial render from the URL restored value so there is no flash on first paint
* Special character keys on the on screen keyboard (`Backspace`, `Shift`, `Space`, `Return`) now render the official Lucide `delete`, `arrow-big-up`, `space`, and `corner-down-left` SVG icons inline so they look identical across every platform regardless of the system font's rendering of the matching Unicode codepoints; the keyboard plugin reads the dispatched value from the `data-value` attribute first and falls back to the element text so the existing downstream `keyHandler` switch keeps working unchanged, and the inline SVGs share a consistent `viewBox`, stroke weight and round line caps so they read as a single visual family
* The confirmation modal preview now sits on a soft tinted card with the spec list rendered as a clean rounded table (`label : value` rows, monospaced segment chips) instead of the previous inline `bold key: value` debug style, the spec rows are tightened (font size, padding, column width) so the contents fit comfortably inside the modal without overflowing
* `/settings` printing tab now uses a stable scrollbar gutter on the surrounding catalog rail (`scrollbar-gutter: stable`) so the card position does not shift when a long tab causes a scrollbar to appear, the printing inputs use `flex: 1 1 0` plus `min-width: 0` so their intrinsic content width (long URLs in the disabled `Base` pill) cannot push the row past the card boundary, and the card itself no longer caps at `max-height: 560px` so the printing tab can grow vertically to fit all entries
* `/viewport` `updateUrl` is now an action scoped serializer that takes the change source as an argument (`text`, `profile`, `font`, `font_size`, `zoom`, `margins`, `toggle`, `restore`) and only rewrites the matching URL fragment while preserving the rest of the query string verbatim, so callers no longer recompute the full URL from possibly stale DOM state; the function also bails out early when the viewport editor is not mounted on the current page (`viewer-container` absent) so non viewport pages never accumulate viewport only query parameters in their address bar, with `theme` dropped from the URL writes entirely since it lives in the cookie session
* `fullscreen` flag is now persisted on the cookie session alongside the other UI preferences, so it survives the next request without having to be forwarded through redirect query strings; every page route reads `req.query.fullscreen` first as an override and falls back to `req.session.fullscreen`, the `/settings` POST stores it on the session and redirects without appending the flag to the target URL, and the front end `updateUrl` no longer writes it back into the address bar
* Modernized the classic `/gateway` form so it now reuses the same page chrome as welcome / settings / profile manager: the page wrapper changed from `.gateway` to `.welcome`, the form is wrapped by the standard hero (logo, `Gateway` / `Entrada` eyebrow, hairline divider), the form fields moved into a white `.gateway-container` card on the new tinted body (lavender bordered and tinted-shadow in `ldj`), the text inputs and labels now follow the `settings-group` / `settings-group-label` pattern, the Order No. + Size pair lives in a flex `.gateway-row`, the Technology / Elements / Location radio buttons became `option-chips` matching the welcome screen chip language, and the Submit / Configure buttons now sit on a centered `welcome-action-bar` with Submit as the primary `button-start` and Configure as a `button-ghost` secondary
* Stopped persisting the viewport-only visual toggles (`rulers`, `crosshair`, `keyboard`, `guidelines`, `caret`, `zoom`, `margins`, `font_size`, `font_size_mode`, `font`, `theme`) into the address bar from `updateUrl`, so the address bar on `/viewport` now only carries semantic state (`text`, `profile`, `variant`, `fullscreen`) and these UI level flags can no longer leak into shareable links or downstream pages
* Removed the welcome screen default template pre-selection so the catalog renders with nothing highlighted and the Start button stays disabled until the user explicitly picks a card; the hidden `profile` input is cleared on each render so a previously chosen template never restores itself
* Modernized the `/report` view with a tinted page surface, a 2-column grid of soft-fill spec tiles (date, order, size, technology, elements, location, font), a softer card shadow with the new layered palette, and a full-width engraving preview row that spans both columns; LDJ theme picks up the lavender chip / border / shadow tints to keep visual continuity with the rest of the studio
* Replaced the `Report` text button with an icon-only soft-surface pill in the `/viewport` header (Ionicons `document-text-outline`) to recover header space; the icon button inherits the same theme-aware tint as the other header secondaries (neutral grey default, lavender in `ldj`)
* Modernized the profile manager dropdown style on `/profiles/manager` with a custom inline-SVG chevron, white resting state with a soft `#e6e8ee` border that deepens on hover and on focus (lavender `#ece4f5` → `#c9b6e5` → `rgba(151, 120, 211, 0.55)` in `ldj`), 12px radius, 40px height, smooth color/border transitions, and a reusable `.manager-select` class shared by both the reference dropdown and the new editor dropdown
* Modernized the side panel components on `/viewport` (profile info, viewport options, inspirations panel) with the new layered shadow language: borderless 14px radius cards with `0 8px 20px rgba(31, 35, 48, 0.06) + 0 1px 2px rgba(31, 35, 48, 0.04)`, soft pill selects with chevron SVG, soft-fill numeric inputs with theme-aware focus borders, smaller muted eyebrow titles, and a chip-style author badge on the inspirations modal cards
* Replaced the in-process `express-session` MemoryStore with `cookie-session` so UI preferences survive Node restarts without any server-side storage; the cookie carries non-sensitive UI state only and uses a hardcoded secret to keep dev installs working out of the box
* Theme aware tinted page canvas plus a frosted glass header (`backdrop-filter: saturate(160%) blur(12px)`) replace the flat white chrome on `/viewport` and the welcome screen, with the lavender body wash and hairline picked up in the `ldj` theme so the floating panels read as real white surfaces on a soft tinted page
* Smoothed the keyboard show/hide flow on `/viewport`: switching fonts now waits for the leaving keyboard to fade out before the next one fades in (sequential cross fade), the `font` event handler picks the previously visible keyboard once and chains the show onto its leave callback, and `pointer-events: none` on the leaving keyboard prevents accidental clicks during the transition
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

### Fixed

* Avoids a split second flash of the legacy dashed text box on the viewport while the profile selector is being restored: the body now carries a `profiles-loading` class at server render time that hides the no profile viewer container, and the class is cleared in a `finally` block once `loadProfiles` resolves so the legacy box only appears after the initial profile state has been settled
* Hide the floating viewport options panel on `/viewport` in store mode when no profile is selected since every visible field inside it requires an active profile, so the panel no longer renders as an empty chrome card; the rule lives in `static/css/store-mode.css` and relies on the existing `.profile-active` signal so the panel reappears immediately when a profile is picked
* Stop applying the zoom compensating `margin-bottom` and `margin-right` on the viewport preview when no profile is active, so the extra bottom and right space no longer appears under the empty engraving surface or when entering preview mode without a selected template; detection uses the existing `.profile-active` class on the preview element so every caller of the `zoom` action benefits without per call site changes
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

### Removed

* `Printer Configuration` modal (`.modal-overlay-config`) from `/viewport` and `/gateway`, along with the matching `Configure` header button on `/gateway` and the `Configure` button inside the error modal that used to open it; the same configuration is now fully owned by the `Printing` tab on `/settings`, the gateway entry point becomes a plain `<a href="/settings">Settings</a>` link, the error modal `Configure` action becomes a plain `<a href="/settings">` link, and the now unused `buttonConfigure` / `buttonSave` plumbing on `main.js` and `plugins/modal.js` (~80 lines) is removed

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
