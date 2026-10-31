# featurescan

Scan a **built** static site or HTML/JS desktop app and emit a list of the web
platform features it uses. The list is made of
[MDN browser-compat-data](https://github.com/mdn/browser-compat-data) keys, plus
synthetic prefix markers for vendor-prefixed CSS fallbacks, so it can later be
used for runtime compatibility checks.

```json
[
  "api.IntersectionObserver",
  "css.properties.backdrop-filter",
  "html.elements.dialog",
  "javascript.operators.optional_chaining"
]
```

The manifest intentionally contains only keys. Compatibility details are
resolved by the CLI when it prints a report or runs `check`.

Vendor-prefixed CSS properties are recorded alongside their unprefixed key using
a synthetic marker, for example:

```json
["css.properties.user-select", "css.properties.-webkit-user-select"]
```

This lets `check` recognize a deliberate prefix fallback and suppress the
corresponding prefix warning.

## Requirements

- Node.js `^22.18.0` or `>=24.11.0`
- pnpm for development

## Usage

```bash
# Print the manifest to stdout and a readable report to stderr
featurescan scan ./dist

# Write the manifest to a file
featurescan scan ./dist -o features.json

# Include usage locations in the report
featurescan scan ./dist -o features.json --verbose

# Newline-delimited output
featurescan scan ./dist --format lines -o features.txt

# Custom discovery
featurescan scan ./dist --include '**/*.html' --exclude 'legacy/**'
```

`scan` accepts a directory or a single file. By default it scans
`**/*.{html,htm,css,js,mjs,cjs}` and ignores `node_modules`, `.git`, and source
maps. Inline `<style>`, `<script>`, `style=""`, and common `on*` handlers are
scanned as well.

### Checking a manifest

```bash
# Check against the latest version of every mainstream browser
featurescan check features.json

# Check specific targets
featurescan check features.json --browser safari@15.6 --browser chrome@120

# Machine-readable output
featurescan check features.json --browser safari@15.6 --json

# Fail CI when anything is unsupported
featurescan check features.json --browser safari@15.6 --fail
```

`--browser` accepts `name@version`, `name` (latest stable), or `name@latest`.
Aliases such as `ios` (for `safari_ios`) are supported. Use
`--list-browsers` to see the available identifiers and latest versions.

Prefixed-CSS warnings are suppressed when the manifest contains a matching
`-webkit-`, `-moz-`, `-ms-`, `-o-`, or `-khtml-` marker for that property.

Exit codes:

- `0` — success
- `1` — tool/usage error
- `2` — `check --fail` found unsupported features

## What is detected

### HTML

- Elements in HTML, SVG, and MathML namespaces
- Element and global attributes
- Attribute values where compatibility data is value-specific, such as
  `input[type]`, `script[type]`, and `link[rel]`
- Inline CSS and JavaScript, including `style` and event-handler attributes
- `<template>` content

### CSS

- Properties and custom properties
- Property values (`display: grid`, `overflow: clip`, ...)
- Functions (`color-mix()`, `clamp()`, `blur()`, ...)
- At-rules (`@container`, `@layer`, `@scope`, ...)
- Selectors and pseudo-classes/elements (`:has()`, `:is()`, `::backdrop`, ...)
- Media-query features and range syntax

### JavaScript

- Web APIs used as globals (`IntersectionObserver`, `fetch`, ...)
- Common window-level functions used bare (`requestAnimationFrame`,
  `matchMedia`, `getComputedStyle`, ...)
- Members on known global objects (`navigator.share`, `crypto.randomUUID`,
  `document.startViewTransition`, ...)
- Selected builtins (`Object.hasOwn`, `Promise.withResolvers`,
  `Array.prototype.toSorted`, ...)
- Syntax: optional chaining, nullish coalescing, logical assignment, BigInt,
  private/public class fields, static blocks, top-level await, dynamic import,
  import attributes, `using` declarations, regex flags and assertions, and more
- Shadowed identifiers are ignored using Babel scope analysis

## Library API

```ts
import { scan, manifestKeys, CompatDB, formatManifest } from "featurescan";

const result = await scan("./dist", { maxUsages: 20 });
const keys = manifestKeys(result);
const json = formatManifest(keys, "json");

// Resolve compatibility data directly
const compat = new CompatDB();
console.log(compat.version);
```

The browser-facing runtime checker and a script generator for it are not
implemented yet. The keys-only manifest is the input they are designed around.

## Known limitations

- Dynamic/computed feature access such as `window[name]` cannot be detected.
- All matching files are scanned; unused chunks and dead code can add features.
- Bundled polyfills can appear as feature usage; use `--exclude` if needed.
- JavaScript detection is syntactic, not type-aware.
- Source maps and `.asar` archives are not handled.
- Inline event handlers are parsed only for a known list of `on*` attributes.
- A feature may be reported at medium confidence when the receiver type is
  unknown (for example `.at()` on an arbitrary object); this affects the report
  but not the manifest.

## Development

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
```

The CLI is bundled with rolldown into `dist/cli.js`. Notes and design decisions
live in `agent-documents/`.
