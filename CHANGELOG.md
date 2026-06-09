# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

* `SESSION_SECRET` environment variable to override the hardcoded `cookie-session` signing key, comma separated to support rotation (first entry signs new cookies, the rest still validate old ones); the Dockerfile ships the previous placeholder as a default so existing deployments keep working until the variable is set explicitly.
* `SESSION_MAX_AGE` environment variable to control the `signatur.sid` cookie lifetime in milliseconds. The default is bumped from the previous ~16.7 hours to ~6 months (15552000000 ms), so users stay logged in across the working week without re-authenticating.
* Optional `Record video` toggle on the confirm engraving modal, paired with the existing `Dry run` chip, that forwards a `record` boolean to the colony print payload so the engraving operation can be captured on video by the printing backend.
* Live print job indicator pinned to the top-left of the engraving page that surfaces each submitted job, polls colony print every 5 seconds for status updates, lets the operator cancel a still queued job, surfaces a red treatment plus a toast when a job fails, drops a job from the indicator when colony print no longer recognises it (a `500` response for an evicted entry, since the jobs are ephemeral), persists across reloads, and opens a tabbed overlay (Info, Files, Request, plus Result and Traceback when present) that any chip can open at any stage of its lifecycle with the identity, status, options, result summary, per stage timestamps, elapsed time and printing logs alongside the original request payload, the structured response and the inline thumbnails for screenshots and the inline player for the recorded video.
* Components showcase page rendered at `/components` that walks through the reusable building blocks of the interface (modal overlays, buttons and chips, form inputs, panels and cards, tabs and toast notifications) with a live preview, a copy paste markup snippet, an optional JS usage snippet, a deterministic anchor and a structured metadata block per entry so both human contributors and AI agents can pick up the components without scraping the rest of the codebase; the discovery link only appears as a ghost button on the welcome action bar when the viewport is in technical mode, while the page itself stays reachable directly through the URL regardless of the current mode.
* Optional `category` field on the profile schema that groups the welcome catalog into sections (e.g. `medals`, `plates`, `rings`), with profiles missing the field falling under a localized `Other` section pushed to the end; the seven shipped profiles are categorized into `medals`, `plates` and `rings`, the field is documented in [docs/profile-spec.md](docs/profile-spec.md) and validated as an optional string in `lib/util/profile.js` ([#47](https://github.com/hivesolutions/signatur/issues/47))
* Admin only Cool Emojis upload on a new `Emojis` tab of the settings screen, exposing a TTF font picker and an optional companion mapping JSON picker that POST to a new `/settings/emojis` route, which validates the TTF/OTF magic bytes and the mapping JSON shape through new `validateEmojisFont` and `validateEmojisMapping` helpers in `lib/util/emojis.js` before overwriting `static/fonts/coolemojis.ttf` and, when provided, `static/fonts/coolemojis.mapping.json` so the next viewport load picks the new glyphs up; the upload is admin gated behind `lib.requireAdmin` and rejects payloads above 5 MB through the existing multer in memory pipeline ([#37](https://github.com/hivesolutions/signatur/issues/37))
* Engraving glyphs management on the Emojis tab plus a new `Fonts` tab on the settings screen, both gated by `lib.requireAdmin`, that expose a single file uploader for emoji `.f3s` payloads and a paired uploader for text font display `.ttf` and engraving `.f3s` halves, surface the installed catalog with size and modified timestamp metadata and let the admin remove stale entries one row at a time; backed by six new HTTP endpoints under `/settings/emojis/f3s` and `/settings/fonts`, two new filename validators (`EMOJI_F3S_FILENAME_PATTERN` and `FONT_NAME_PATTERN`) on `lib/util/emojis.js`, a new `static/js/plugins/fontsmanager.js` plugin and matching CSS, and documented end to end on `README.md` and a new `docs/fonts-spec.md` ([#55](https://github.com/hivesolutions/signatur/issues/55))

### Changed

* The engraving layout page now shows the selected jewelry piece's name and SKU in both technical and store modes, so users can verify which item they are personalizing.

### Fixed

*

## [1.1.0] - 2026-05-23

### Added

* Login flow with role based access control gating every interactive route: a new `config/users.json` file (gitignored, with a `config/users.json.example` checked in) holds an array of `{ username, password_hash, role }` entries with bcrypt hashes managed by `bcryptjs`; a new `lib/util/auth.js` module exposes `loadUsers()` (read once and cached, refreshed automatically through `fs.watch`), `verifyCredentials()` (bcrypt compare returning the resolved entry without the password hash), `requireUser()` (express middleware that redirects to `/login?next=<originalUrl>` when no session user is present) and `requireAdmin()` (same plus a localized `403` render through the new `views/forbidden.ejs` and `views/forbidden-pt_pt.ejs` for non admin roles); a global `app.use` middleware on `app.js` enforces `requireUser` on every request except a small allowlist (`/login`, `/logout`, `/info`, `/favicon.ico`, `/static`, `/convert`) while every `/settings`, `/settings/diagnostics`, and `/profiles/*` route adopts `lib.requireAdmin` directly so the admin-only surface stays locked even when a session user is present but lacks the admin role; new `app.get("/login")` / `app.post("/login")` / `app.get("/logout")` / `app.post("/logout")` routes pair with new `views/login.ejs` and `views/login-pt_pt.ejs` templates rendered through the same welcome screen hero layout and styled by new fields appended to `static/css/welcome.css` (login container, error chip, label and input pair, focus states and matching `body.ldj` overrides), preserving the original target through a `next` hidden input that the POST handler validates against open redirects (local paths only) before placing `{ username, role }` on `req.session.user`; the welcome action bar in both `welcome.ejs` and `welcome-pt_pt.ejs` now gates the `Profile Manager` and `Settings` / `Definições` links behind `user.role === "admin"` and surfaces a `Logout` / `Sair` ghost button when a user is on the session; an `npm run user:add <username> <role>` helper backed by `scripts/user.js` (uses `readline` with a masked output writer, asks for the password twice, bcrypts at cost 10 and atomically rewrites `config/users.json`) keeps onboarding new operators a one liner so no external bcrypt tool is required; documented on `README.md` next to the existing environment variables
* Post engraving feedback modal on `/viewport` (and the `pt_pt` mirror) gated by the new `feedback` feature flag (`FEATURE_FEEDBACK` env var, default `on`) that opens automatically after a successful engrave submission and asks the user one multiple choice satisfaction question (`Very Satisfied` / `Satisfied` / `Neutral` / `Unsatisfied` / `Very Unsatisfied`) plus an optional free text notes field; submissions are sent as urlencoded POST to a new `app.post("/feedback")` endpoint that validates the satisfaction value against the allowed set, trims and truncates the notes to 2000 chars, and writes each entry as its own `data/feedback/<YYYY>/<MM>/<DD>/<uuid>.json` file grouped under per year, per month and per day subdirectories derived from the submission timestamp so the on disk layout stays easy to navigate as the number of entries grows, with the captured satisfaction, notes, profile, variant, locale, timestamp and a freshly minted UUID identifier so the submissions stay independent and easy to inspect; the `data/` directory is ignored by git, the modal markup is wrapped in `<% if (features.feedback) { %>` so disabled deployments never render the overlay, and the endpoint itself short circuits with a `404` when the flag is off for the requesting session so a stale tab cannot keep posting
* Feature flag system gated by environment variables and overridable per session: a new `FEATURES` registry on `lib/util/config.js` declares every flag the application understands keyed by short name (`calligraphy` for now), with a `FEATURE_<NAME>` environment variable (`FEATURE_CALLIGRAPHY`) backing the base value through `yonius.conf()` parsing the common truthy / falsy spellings (`1`, `true`, `yes`, `on` and their negatives); a new `lib.resolveFeatures(req.session)` helper merges the env base with the session level overrides (`req.session.feature_<name>` of `"1"` or `"0"`) so a fresh `features` object is stamped onto every render context that needs to gate UI; a new `Features` / `Funcionalidades` tab on `/settings` and `/settings-pt_pt` lists every declared flag as a row with a disabled `Base` pill showing the env resolved value (`On` / `Off`) and an `option-chips` toggle with `Default` / `Off` / `On` chips that submits `feature_<name>` form fields the `POST /settings` handler persists onto the session (or clears when `Default` is picked so the base value takes over again); the existing calligraphy controls on `/viewport` (`.calligraphy-mode-container`, `.calligraphy-controls`, `.calligraphy-thickness-container`, the `.calligraphy-container` canvas mount) are now wrapped in `<% if (features.calligraphy) { %>` server side so the markup never reaches the DOM when the flag is off, while the `calligraphy.js` plugin keeps shipping in the bundle but stays inert because its selectors find nothing; documented on `README.md` alongside the other environment variables
* `test/lib/smoke.js` mocha suite that boots `app.js` as a child process on a discovered free port and exercises eight live routes (`GET /`, `/gateway`, `/welcome`, `/settings`, `/profiles`, `/profiles/bundle`, `POST /profiles/validate` with a multipart payload, `POST /settings/diagnostics`) plus four module shape probes (`node-fetch`, `multer`, `jszip`, `uuid` must remain `require()` callable with the same shape they expose today) so a future `package.json` bump that breaks the public route surface or that turns a CJS dependency into ESM only is caught by the standard `npm test` ritual; the suite is self contained (no new dependencies, no supertest, just mocha plus node stdlib `http` and `net`), adds ~150 LOC and ~1 second of wall clock to `npm test`, and was validated against an unsaved `node-fetch ^3` install that flipped the require shape from a function to an object (the suite caught the regression as the first failure)
* `.dockerignore` at the repo root that trims the docker build context down to the directories actually copied into the image (`app.js`, `config`, `lib`, `res`, `static`, `views`, `package.json`), excluding `node_modules`, `.git`, `.github`, `docs`, `test`, `scripts`, the venv, lockfiles, dotfiles and markdown documentation so the build context is smaller and the resulting image cannot leak unrelated repository content through an accidental `ADD .`
* Diagnostics tab on `/settings` with a single `Run diagnostics` button that probes the engraving pipeline tools (`inkscape --version`, `gs --version`, `pstoedit -help`) and then exercises the full SVG → PDF → PS → HPGL chain against a bundled `res/diagnostic.svg` fixture, reporting per tool version banners and per pipeline step status, output byte count, elapsed milliseconds and captured stderr tail so an operator can confirm the install is healthy and locate any failing step without ssh access; the tab is owned by a new `plugins/diagnostics.js` jQuery plugin paired with `css/plugins/diagnostics.css`, the server side endpoint lives at `POST /settings/diagnostics` and is a thin wrapper over the `Inkscape` engine's new `probe()` and `diagnose(svgBuffer)` methods so the engine remains the single source of truth for the pipeline shape

### Changed

* Welcome catalog cards (`.welcome .catalog > .catalog-card`) now declare `user-select: none` (with the established `-o-`, `-ms-`, `-moz-`, `-khtml-`, `-webkit-` vendor prefix order) so tapping or dragging on a template card no longer triggers a text selection on the card name, the optional sku label, or the dimension chip; the cards are clickable selectors not readable surfaces, so suppressing the selection makes the tap-and-drag interaction match the affordance the cards visually present
* `Back` button in the header of `/viewport`, `/signature`, and `/report` (and their `pt_pt` counterparts) now renders as an icon only soft surface pill using the Ionicons `arrow-back-outline` glyph instead of the legacy `←` (U+2190) text character, matching the visual language already used by the `button-preview` (`expand-outline`) and `button-report` (`document-text-outline`) buttons on the same header row; the `title` attribute carries the localized affordance label (`Back` on EN, `Voltar` on PT) so the icon still gets a hover tooltip, and the existing `.header .button.button-back` and `.header .button > ion-icon` rules in `static/css/layout.css` carry over without changes so the chrome (background, hover, font sizing) is consistent across the three secondary buttons
* Bare filename entries in `instructions.images` on a profile JSON are now resolved against `/static/profiles/` (the default upload location for profile assets) so authors can reference uploaded jig images by filename only; entries that already start with `/` or carry a `scheme://` prefix are still passed through verbatim so external URLs and other absolute paths keep working unchanged, with the same detection rule documented on `docs/profile-spec.md`
* `.github/workflows/dockerx.yml` now produces a max mode SLSA provenance attestation and an SPDX SBOM (`provenance: mode=max`, `sbom: true` on `docker/build-push-action@v5`) so Docker Scout and other supply chain scanners can verify the build origin and inspect the package inventory of the pushed image without a separate post-build step
* `.github/dependabot.yml` enabling weekly automated update PRs for the `docker` ecosystem (the `Dockerfile` base image tag) and for the `github-actions` ecosystem (every `uses:` reference in the workflow files), with the `chore` commit prefix so the generated PRs match the project's Conventional Commits convention out of the box
* Every `Back` affordance now points to the bare `/` instead of branching on the entry point: the `back:` template variable rendered for `/viewport`, `/signature` and `/report` is hardcoded to `/`, and the hardcoded `/welcome` `Back` / `Voltar` links on the profile manager (`views/manager.ejs`, `views/manager-pt_pt.ejs`) and the `Back` / `Voltar` fallback on the settings screen (`views/settings.ejs`, `views/settings-pt_pt.ejs`) are also pointed at `/`; the `/` route dispatches to the user's chosen home screen (gateway or welcome) according to the session `home` preference, so the back button now respects that preference uniformly instead of being pinned to whichever entry point the user came in through this session; the `req.session.entry` plumbing on the gateway POST handler is left in place even though it is now read by nobody so a future feature can rewire it without a schema change
* `POST /settings` no longer hardcodes the post submit redirect target to `/welcome` when the form was submitted without a `next` field; the fallback target is now the bare `/` so the user lands on the home they just picked under the `Default Home` option (gateway or welcome) instead of being shipped to the welcome screen regardless of preference, mirroring the same routing logic used by every `Back` button on the rest of the application
* `Dockerfile` collapsed to a single stage on `node:20-trixie-slim` that `apt-get install`s `ghostscript`, `inkscape`, and `pstoedit` directly from the Debian 13 archive (pstoedit 4.02 on trixie) instead of building pstoedit from source under a separate builder stage on `node:20-bookworm-slim`, so each build avoids a 5-10 minute compile step and the resulting image no longer carries the source tarball, the `g++` toolchain, or any custom `--prefix=/opt/pstoedit` layout; the production image keeps the same `npm install --omit=dev` pruning, the dedicated `signatur` UID/GID 10001 non root user, the `COPY` (not `ADD`) layering, and the `ENV KEY=VALUE` form, while the image label `version` is bumped to `2.1` to reflect the shape change
* `lib/engines/inkscape.js` pipeline now routes the PDF produced by Inkscape through Ghostscript's `ps2write` device before handing the result to `pstoedit`, because `pstoedit` no longer reads PDF input directly when Ghostscript is newer than 9.56.1 (Debian bookworm ships 10.0.0, trixie ships 10.05.1) and the PDF interpreter API it relied on was removed upstream; the intermediate `${identifier}.ps` artifact is wired into `_cleanup` so a successful run leaves no residue, and the per step command argv definitions are now owned by a single private `_pipelineSteps(identifier, format)` builder consumed by both the existing `convert` flow and the new diagnostics flow, with sibling `probe()` and `diagnose(svgBuffer)` methods added to the engine so the diagnostics endpoint never has to redefine an argv that the engine already owns
* `package.json` bumped runtime and dev dependencies after running the smoke and unit tests against each upgrade locally: `express-session ^1.17.3 → ^1.19.0`, `hive-js-util ^0.4.1 → ^0.5.3`, `multer ^1.4.5-lts.1 → ^2.1.1` (mostly a CVE fix release with API compatible `.none()` and `.single()` shapes), `uuid ^9.0.0 → ^11.1.1` (the last release with a dedicated CJS `require` conditional export, so the package still loads on every Node version in the CI matrix), `mocha ^10.1.0 → ^11.7.6`, `nodemon ^2.0.20 → ^3.1.14`, `npm-check-updates ^16.3.18 → ^22.2.0`, and `sort-package-json ^2.1.0 → ^3.6.1`; the bump cuts the npm advisory count from 7 highs to 3 (1 low and 2 high) and was validated by running the 108 test suite (96 unit plus 4 module shape plus 8 route smoke) and by rebuilding the docker image and hitting `/settings/diagnostics` and `/profiles` inside the container to confirm the pipeline still produces a non empty HPGL; the upgrades known to be breaking or ESM only (`consola ^3`, `ejs ^5`, `express ^5`, `node-fetch ^3`, `uuid ^12+`, `yonius ^0.14`, `prettier ^3`) are held back for a follow up review pass
* `hive-js-util` bumped from `^0.5.3` to `^0.5.4` to pick up the upstream `ConsolaHandler` fix that makes the handler retro compatible with both `consola@^2` and `consola@^3`: previously the constructor crashed with `TypeError: Cannot read properties of undefined (reading 'Debug')` on consola 3 because the `LogLevel` enum was dropped, and the production docker image hid the regression because `ConsolaHandler.isReady()` short circuited when `process.stdout.isTTY` was false; the 0.5.4 release resolves the numeric debug level defensively as `consola.LogLevel ? consola.LogLevel.Debug : 4` so the same handler works on either consola major and `yarn dev` boots locally without any node_modules patch
* `consola` `^2.15.3` → `^3.4.2` (major; the v3 release switched to ESM by default but ships a CJS `require` conditional export so `hive-js-util`'s indirect `require("consola")` still resolves), `ejs` `^3.1.8` → `^5.0.2` (major across two releases; the rendering path used by every `res.render(...)` view in `app.js` is unchanged and the smoke suite renders gateway, welcome, settings, and the diagnostics tab to confirm), `express` `^4.18.2` → `^5.2.1` (major; v5 changes async error propagation and removed several legacy methods but the codebase only uses `app.get`/`app.post`/`app.use` plus the standard `body-parser`/`multer`/`cookie-session`/`express-session` middlewares which are all v5 compatible), `yonius` `^0.11.7` → `^0.14.0` (0.x major across three releases; the configuration loading layer the codebase consumes through `lib/util/config.js` continues to resolve `HOST`, `PORT`, `BASE_URL`, the `PRINT_*` and `ENGRAVE_*` overrides without code changes)
* CI Main Workflow matrix shrunk from `[14, 15, 16, 17, 18, 19, 20]` on `node:*-buster` (Debian 10, EOL since June 2024) to `[20, 22, 24]` on `node:*-trixie-slim` (Debian 13), dropping every Node version that is past End of Life or that lacks the ESM to CJS interop needed by modern dependencies; the Deploy Workflow that publishes to npm on tag pushes is moved from `node:14-buster` to `node:24-trixie-slim` so the publish path runs on the same modern stack as the test matrix; the production `Dockerfile` base image is bumped from `node:20-trixie-slim` to `node:24-trixie-slim` so the container runtime matches the new minimum, the bump cuts the npm advisory count further, and the Inkscape, Ghostscript, and pstoedit binaries continue to resolve under the same `PATH` because the apt package set on trixie is unchanged across the Node 20 to 24 transition (validated by rebuilding the image and hitting `/settings/diagnostics` to confirm the SVG to PDF to PS to HPGL pipeline still produces a non empty 516 byte HPGL output)
* `package.json` declares the minimum supported Node version explicitly via `engines.node: ">=20"` so a consumer that runs `npm install` on a Node version below 20 sees a warning at install time (or a hard refusal if the consumer has `engine-strict` enabled), aligning the package manifest with the CI matrix and the production base image
* `prettier` bumped from `^2.8.8` to `^3.8.3` (major), kept paired with `prettier-config-hive ^0.1.7` because the shareable config already pins the v3 sensitive option `trailingComma: "none"` so the v3 default change from `"es5"` to `"all"` does not affect the project; running `npm run pretty` after the bump reflows a small set of files (two nested ternaries in `static/js/main.js` and `static/js/plugins/inspiration.js`, four call sites in `static/js/plugins/texteditor.js`, and a long throw line in `test/lib/smoke.js` that exceeded the `printWidth: 100` limit) and the rebuilt `static/js/bundle.js` mirrors the reformatted sources; lint and the full 108 test suite stay green and the docker image still produces the canonical 461 to 1199 to 166496 to 516 byte HPGL output through `/settings/diagnostics`, confirming the reformat is purely stylistic
* `eslint` bumped from `^8.27.0` to `^10.4.0`, together with `eslint-config-hive ^0.6.0 → ^0.7.0` and `eslint-plugin-n ^15.5.0 → ^18.0.1` (npm picks the latest 17.x that satisfies the resolved peer chain), and the legacy `.eslintrc.js` plus `.eslintignore` are replaced by a single `eslint.config.mjs` flat config that imports the shareable Hive config through its ESM only `eslint-config-hive/prettier` entry point, declares the `espree` parser explicitly so the legacy `@babel/eslint-parser` (which calls a `scopeManager.addGlobals` API removed in ESLint 10) is no longer loaded, scopes the project specific browser helper globals (`jQuery`, `getOptions`, `drawText`, etc.) to `static/js/*.js` plus `static/js/plugins/**/*.js` and the mocha test globals (`describe`, `it`, `before`, `after`, etc.) to `test/**/*.js`, narrows the `process` / `fetch` globals away in `app.js` (where they are `require()` shadowed) and the `stop` global away in `lib/util/config.js` (where it is a local `const`) so `no-redeclare` no longer trips on the legitimate shadows, disables `no-redeclare` only on `static/js/util.js` (the single source of truth for the browser helper symbols), sets `no-unused-vars` to `args: "none"` and `caughtErrors: "none"` so the canonical jQuery plugin signature `function(action, options)` and the empty `catch (err)` cleanup pattern stop being flagged, allows empty catch blocks via `no-empty: { allowEmptyCatch: true }`, ignores the generated `static/js/bundle.js` plus `static/js/jSignature.min.js` from linting, and removes the now stale `// eslint-disable-line no-unused-expressions` and `// eslint-disable-next-line no-eval` directives from `plugins/collapsible.js`, `plugins/console.js`, and `plugins/inspiration.js` that referred to rules no longer active under the new shareable config; the `package.json` ships an `overrides.eslint-config-hive.eslint: "$eslint"` block so the shareable config's `peerDependencies: { eslint: "^9.0.0" }` constraint is rewritten to match the root `^10.4.0` spec and `npm install` resolves without `--legacy-peer-deps`

### Fixed

* `uuid` reverted from `^14.0.0` to `^11.1.1` because `uuid ^12` and newer are published as ESM only (`type: module` with no `require` conditional export), which breaks `require("uuid")` with `ERR_REQUIRE_ESM` on every Node version below 22 where experimental CJS to ESM interop is not enabled by default; the local test harness happened to be running on Node 25 where the interop succeeds, so the regression slipped past `npm test` and only manifested when the Main Workflow CI built against Node 14 to 20
* `test/lib/smoke.js` module shape probes now assert that every `require()` target dependency (`multer`, `jszip`, `uuid`) exposes a CJS `require` conditional export in its `package.json`, not just that the resolved value has the expected runtime shape on the local Node version; validated by an unsaved `uuid ^14` install that the probe correctly rejected with `uuid has no CJS require entry; would break on Node <22 with ERR_REQUIRE_ESM` so the next ESM only dependency bump is caught locally instead of only in CI

### Removed

* `uuid` direct dependency is dropped from `package.json` because Node 20 (the project's minimum supported version) ships `crypto.randomUUID()` as a built-in runtime global that returns a v4 UUID with the same shape `uuid.v4()` did; the two consumer call sites on `lib/engines/inkscape.js` (the `convert` request flow and the diagnostics flow) are switched to `crypto.randomUUID()`, the legacy `require("uuid")` import line is removed, the corresponding `assertRequireable("uuid")` smoke probe is replaced by a `typeof crypto.randomUUID === "function"` runtime assertion so a future Node downgrade that loses the built-in is caught the same way the `fetch` probe catches a missing global, validated by rebuilding the docker image on `node:24-trixie-slim` and confirming `uuid` is no longer present in `node_modules` while `/settings/diagnostics` continues to produce the canonical 461 to 1199 to 166496 to 516 byte HPGL output
* `node-fetch` direct dependency is dropped from `package.json` because Node 20 (the project's new minimum supported version) ships a built-in `fetch` global that covers every use site in `app.js` (the `/receipt` and `/image` routes that fetch from the headless renderer); the `require("node-fetch")` line at the top of `app.js` is removed and the existing `await fetch(url)` call sites continue to work against the runtime global, the eslint config `app.js` override that used to silence `fetch` as a shadowed global is removed since `fetch` is now the legitimate global being called, and the smoke suite's node-fetch shape probe is replaced by a `typeof fetch === "function"` global assertion so a future Node downgrade that loses the built-in fetch is caught the same way the previous probe caught ESM only dependency bumps; `node-fetch` may still appear in `node_modules` as a transitive dependency of `yonius` but the codebase no longer imports it directly

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
* Calligraphy mode with jSignature canvas overlay on the viewport preview for freehand engraving
* Calligraphy jQuery plugin (`plugins/calligraphy.js`, `css/plugins/calligraphy.css`) with init, reset, undo, and data actions
* Calligraphy mode toggle, undo, and clear controls in viewport options panel
* Per-profile calligraphy configuration with `calligraphy.line_width` field and validation
* Zoom slider disabled during calligraphy mode to preserve drawing integrity
* Calligraphy mode persisted via URL query parameter (`calligraphy=1`)
* Calligraphy mode preserved across profile switches with canvas re-initialization

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
