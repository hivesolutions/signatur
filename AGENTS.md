# AGENTS.md file

## Building

Always rebuild bundles before committing to ensure `bundle.js` and `bundle.css` are up to date, using:

```bash
npm run build
```

## Linting

Run the ESLint linter before committing new code:

```bash
npm run lint
```

To automatically fix linting issues:

```bash
npm run lint-fix
```

## Testing

Run the mocha test suite before committing new code:

```bash
npm test
```

## jQuery Plugin Components

UI components are encapsulated as jQuery plugins following the IIFE pattern with `jQuery.fn`.
Each plugin must have its own JS file in `static/js/plugins/` and a matching CSS file in `static/css/plugins/`.
Both files must be registered in `scripts/build.js` (bundle order) and `views/head.ejs` (dev mode).

Plugins communicate with `main.js` via custom events using `triggerHandler()` - never by
accessing global state directly. The container element receives a `.collapsible` or similar
top-level class, and child elements use `collapsible-*` suffixed classes scoped under it.
CSS selectors follow the `parent > .child` combinator pattern used throughout the codebase.

When extracting logic from `main.js` into a plugin, remove all related functions, event
handlers, and unused variable declarations from `main.js`, replacing them with a single
plugin initialization call. Preserve vendor-prefixed CSS properties with the established
`-o-`, `-ms-`, `-moz-`, `-khtml-`, `-webkit-` order. Use full variable names - prefer
`bodyElement` over `bodyEl`, `currentIndex` over `curIdx`, etc.

Every plugin must have a `/** */` docstring immediately before the `jQuery.fn` assignment
with the following structure:

```javascript
/**
 * Brief description of the plugin's purpose (2-3 lines).
 *
 * Operates on a .class-name element and discovers its children
 * (.child-a, .child-b) by class name convention.
 *
 * Actions:
 *   "action1" - description of what this action does
 *   "action2" - description of what this action does
 *
 * Events:
 *   "event1" - description of when this event fires and
 *              what arguments it passes
 */
```

Omit the Actions section if the plugin takes no action parameter. Omit the Events section
if the plugin emits no custom events.

Reference `static/js/plugins/profileselector.js` as the canonical example of a
well-documented plugin with actions, events, and its companion CSS file.

## Style Guide

- Always update `CHANGELOG.md` according to semantic versioning, mentioning your changes in the unreleased section.
- Write commit messages using [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).
- Never bump the version in `package.json`. This is handled by the release process.
- The implementation should be done in a way that is compatible with the existing codebase.
- The commenting style of the project is unique, try to keep commenting style consistent.
- Use full variable names - no abbreviations (e.g. `bodyElement` not `bodyEl`).
- jQuery plugins use the IIFE pattern with `jQuery.fn` extensions.
- EJS templates in `views/` use server-side rendering with Express.
- CSS uses vendor prefixes in the order: `-o-`, `-ms-`, `-moz-`, `-khtml-`, `-webkit-`.
- JS, CSS, and EJS files use CRLF (`\r\n`) line endings.

## Commit Messages

This project follows [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) with the following structure:

```text
<type>: <description>

<body>
```

### Commit Types

| Type       | Description                                             |
| ---------- | ------------------------------------------------------- |
| `feat`     | A new feature or functionality                          |
| `fix`      | A bug fix                                               |
| `docs`     | Documentation only changes                              |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `chore`    | Maintenance tasks, dependency updates, build changes    |
| `test`     | Adding or updating tests                                |
| `version`  | Version bump commits (reserved for releases)            |

### Guidelines

- Use lowercase for the type prefix.
- Use imperative mood in the description (e.g., "Add feature" not "Added feature").
- Keep the first line under 50 characters.
- Reference issue/PR numbers when applicable using `(#123)` at the end.
- For version releases, use the format `version: X.Y.Z`.
- Add an extra newline between subject and body.
- Make the body a series of bullet points about the commit.
- Be descriptive always making use of the body of the message.

### Examples

```text
feat: Add collapsible panel plugin (#15)
fix: Resolve font size reset during session restore
docs: Add API endpoint documentation for profiles
refactor: Extract validation logic into reusable utility module
chore: Update dependencies to latest stable versions
test: Add unit tests for profile validation
version: 0.8.0
```

## Pre-Commit Checklist

Before committing, ensure that the following items check:

- [ ] Bundles are rebuilt: `npm run build`
- [ ] Linting passes: `npm run lint`
- [ ] Tests pass: `npm test`
- [ ] CHANGELOG.md is updated in [Unreleased] section
- [ ] No debugging console.log statements or commented-out code
- [ ] New plugins are registered in both `scripts/build.js` and `views/head.ejs`
- [ ] CRLF line endings are preserved in JS, CSS, and EJS files

## New Release

To create a new release follow the following steps:

- Make sure that both the tests pass and the bundles are rebuilt.
- Increment (look at `CHANGELOG.md` for semver changes) the `version` value in `package.json`.
- Move all the `CHANGELOG.md` Unreleased items that have at least one non empty item into a new section with the new version number and date, and then create new empty sub-sections (Added, Changed and Fixed) for the Unreleased section with a single empty item.
- Create a commit with the following message `version: $VERSION_NUMBER`.
- Push the commit.
- Create a new tag with the value of the new version number `$VERSION_NUMBER`.
- Create a new release on the GitHub repo using the Markdown from the corresponding version entry in `CHANGELOG.md` as the description of the release and the version number as the title. Do not include the title of the release (version and date) in the description.

## License

Signatur is licensed under the [Apache License, Version 2.0](http://www.apache.org/licenses/).
