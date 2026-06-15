# Proposal: Configurable emoji keyboard driven by the uploadable mapping file

## Problem

The emoji keyboard has a split brain. Uploads are dynamic, but the layout is static.

What an admin can already change from **Settings → Emojis**:

- The display font (`coolemojis.ttf`) via `POST /settings/emojis`.
- The glyph → name mapping (`coolemojis.mapping.json`), used for the per key tooltips.
- The engraving `.f3s` payloads, dropped into `static/fonts/f3s/emoji/`.

What an admin cannot change without a developer editing templates:

- Which emoji keys appear on the keyboard — the `.char` spans hardcoded in `views/viewport.ejs` (and the `-pt_pt` twin).
- Which tab/category each emoji lands in — the `data-category` attribute, written by hand per key.
- The order/position of each emoji in the grid — driven by DOM source order.
- The tab list itself (Symbols, Nature, People, Pop, Phrases).

The result: uploading a new emoji font replaces the glyphs but changes nothing on the keyboard. A new glyph only becomes reachable after a developer hand edits the markup, and the arbitrary `data-value` slot letters (`A`, `B`, `$`, `@` …) must stay in lockstep across three places with no single source of truth:

1. the `.char` spans in the EJS views,
2. the `coolemojis.mapping.json` entries,
3. the glyph order baked into the font.

This is the gap behind "we need more configuration for the emoji keyboard and where newly uploaded emojis go".

## Goal

Make the emoji keyboard layout — which emoji, in which category, in what order — a configuration concern owned by the already uploadable mapping file, so that:

- Adding or reordering emojis, or moving one between tabs, is an admin upload, not a code change.
- There is a single source of truth (the mapping file) for slot, glyph name, category and order.
- The change is backward compatible with the current mapping files and the current behaviour.

## Decisions taken

- **Source of layout**: extend the existing uploadable `coolemojis.mapping.json` (single source of truth, already uploaded alongside the font).
- **Rendering**: generate the grid client side in `static/js/main.js`, reusing the mapping JSON it already fetches and then initialising the existing keyboard plugin over the generated markup. This keeps template churn low and lets uploads take effect on the next viewport load without a server restart.

## Mapping format (backward compatible)

Today every entry maps a slot character to a glyph name:

```json
{
    "A": "1101.coracao",
    "B": "1102.estrela"
}
```

The extended form lets an entry also carry a category and an order, while the plain string form keeps working unchanged:

```json
{
    "A": { "name": "1101.coracao", "category": "nature", "order": 10 },
    "B": "1102.estrela"
}
```

Rules:

- A string value is treated as `{ name: <string> }` with no category and no order (current behaviour).
- `category` is optional; entries without one are gathered into a dedicated catch-all tab (labelled "Other") instead of being folded into an existing category, so uncategorized uploads stay visible and reachable rather than disappearing into a real bucket. This also means an old all-string mapping file surfaces entirely under the "Other" tab, with nothing lost.
- `order` is optional; entries without one keep their position from the file's key order, sorted after any entry that does declare an `order`.
- The tab list is derived from the distinct categories present, in first seen order, so adding a category to the mapping adds a tab. The catch-all "Other" tab is appended last and only when at least one uncategorized entry exists.

The display semantics stay the same: the slot character is the key value sent on press, and the glyph is rendered by the Cool Emojis font; `name` continues to drive the tooltip.

## Work breakdown

### 1. Server side mapping validation (`lib/util/emojis.js`)

`validateEmojisMapping` currently rejects any non string value:

```js
if (typeof parsed[key] !== "string") {
    errors.push(`mapping entry "${key}" must be a string`);
}
```

This must be relaxed to accept either:

- a string (the current form), or
- an object with a required string `name`, an optional string `category`, and an optional numeric `order`.

Anything else stays an error, with the same `errors[]` shape the upload route already surfaces. Keep the existing comment style and the existing message phrasing.

### 2. Client side grid generation (`static/js/main.js`)

- Add a helper that, given the fetched mapping object, normalises every entry to `{ value, name, category, order }`, assigning a sentinel catch-all category (for example `other`) to any entry that declares none.
- Build the tab strip (`.emojis-tabs > .emojis-tab`) from the distinct categories, mirroring the existing markup and the `data-category` / `active` conventions, with the catch-all "Other" tab appended last and emitted only when at least one uncategorized entry exists.
- Build the `.char` spans with the same classes and `data-category` / `data-value` attributes the CSS already filters on (uncategorized entries carry `data-category="other"`), so `static/css/plugins/keyboard.css` needs only the catch-all category added to the existing `data-active` filter selector list.
- Re-run the existing tab wiring and key wiring after generation (the plugin already binds these by class convention).

### 3. Load and render integration (`static/js/main.js`)

- `main.js` already fetches `coolemojis.mapping.json` and walks `.char[data-value]` to set tooltips. Have it pass the mapping to the keyboard plugin (or expose the normalised layout) so the grid is generated from the same fetch instead of from hardcoded markup.
- Keep the tooltip behaviour (title from `name`) intact.

### 4. Template cleanup (`views/viewport.ejs`, `views/viewport-pt_pt.ejs`)

- Reduce the hardcoded emoji blocks to empty containers (the tabs and `.char` spans become generated). Keep the `.emojis-container` / `.emojisp-container` shells, their `data-active` defaults, and the surrounding structure.
- The Pantograph keyboard (`.emojisp-container`) stays static in this iteration because there is no `coolemojisp.mapping.json` to drive it; it keeps its bundled markup until its own mapping file is introduced.

### 5. Settings copy (`views/settings.ejs`, `views/settings-pt_pt.ejs`)

- Update the Emojis tab helper text to mention that the mapping file now also controls category and order, so admins know the upload drives the keyboard layout.

### 6. Build, lint, tests, changelog

- Rebuild bundles: `npm run build` (regenerates `bundle.js` / `bundle.css`).
- `npm run lint` and `npm test` per the pre commit checklist.
- Add unit tests for the relaxed `validateEmojisMapping` (string form, object form, missing `name`, bad `category`, bad `order`).
- Add a single user facing line under `CHANGELOG.md` `[Unreleased] > Added`.
- Preserve CRLF line endings in JS/CSS/EJS and the vendor prefix order.

## Backward compatibility and risks

- Existing `coolemojis.mapping.json` files (all string values) keep every key; with no categories declared they all surface under the catch-all "Other" tab, so nothing is lost (the within-tab order is preserved from the file).
- The catch-all "Other" tab needs a sentinel category value (for example `other`) that is reserved and cannot collide with an admin-declared category name.
- Client side generation means the grid depends on the mapping fetch succeeding; if the fetch fails the keyboard should degrade gracefully (empty emoji grid, regular keyboard unaffected) rather than break.
- The Pantograph variant has its own glyph set; it needs its own mapping file to be configurable the same way, otherwise it keeps a built in default.

## Out of scope

- A visual editor for arranging emojis.
- Per profile emoji subsets (today `config/master.json` only gates whether the emoji fonts appear at all).
- Server side rendering of the grid (explicitly chosen to render client side).
