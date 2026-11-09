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

The default manifest intentionally contains only keys. Compatibility details
are resolved by the CLI when it prints a report or runs `check`. An opt-in
detailed manifest can also carry usage locations and source-map origins.

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
# Print the manifest to stdout and a summary to stderr
featurescan scan ./dist

# Write the manifest to a file and print the summary to stdout
featurescan scan ./dist -o features.json

# Print the full report instead of the summary
featurescan scan ./dist -o features.json --verbose

# Disable the interactive progress bar
featurescan scan ./dist -o features.json --no-progress

# Newline-delimited output
featurescan scan ./dist --format lines -o features.txt

# Detailed output with usages and source-map origins
featurescan scan ./dist --format detailed -o features-detailed.json

# Keep up to three usage locations per feature per file
featurescan scan ./dist --format detailed --max-usages-per-file 3

# Custom discovery
featurescan scan ./dist --include '**/*.html' --exclude 'legacy/**'
```

`scan` accepts a directory or a single file. By default it scans
`**/*.{html,htm,css,js,mjs,cjs}` and ignores `node_modules`, `.git`, and source
map files as standalone inputs. Inline `<style>`, `<script>`, `style=""`, and
common `on*` handlers are scanned as well. Referenced JS source maps are read
when available.

By default the manifest is written and a short summary is printed: the tool
version, the number of scanned files and duration, the number of detected
features by kind, and, with `-o`, the manifest path. Without `-o` the summary
goes to stderr so the manifest can still be piped; with `-o` it goes to stdout. Pass `--verbose` to print the full
report, which lists detected features and warnings. Neither mode includes usage
locations; use `--format detailed` for those. An interactive progress bar is
shown on stderr and is disabled automatically when stderr is not a TTY. Report
colors follow the output's destination stream; use `--no-color` or `NO_COLOR` to
disable them.

## Configuration

`featurescan` looks for `featurescan.config.json` in the current directory.
The loader also accepts `.js`, `.ts`, `.mjs`, `.cjs`, `.jsonc`, `.json5`,
`.yaml`, and `.toml` variants, including files under `.config/`. Use
`--config <path>` to load a specific file.

Values are merged in this order:

```text
built-in defaults < config file < explicit CLI flags
```

Array values from the CLI replace the corresponding config array; they are not
appended.

```json
{
  "$schema": "./node_modules/featurescan/featurescan.config.schema.json",
  "scan": {
    "include": ["**/*.{html,htm,css,js,mjs,cjs}"],
    "exclude": ["legacy/**"],
    "format": "detailed",
    "maxUsages": 10,
    "maxUsagesPerFile": 1,
    "out": "features.json",
    "verbose": true,
    "progress": true,
    "quiet": false
  },
  "check": {
    "browsers": ["safari@15.6", "chrome@120"],
    "includeSource": ["src/**"],
    "excludeSource": ["legacy/**"],
    "includePackage": ["@codemirror/*"],
    "excludePackage": ["@the_dissidents/*@0.0.28"],
    "showDependencyPaths": false,
    "groupByKind": true,
    "fail": false,
    "json": false,
    "quiet": false
  }
}
```

- `scan`: `include`, `exclude`, `format`, `maxUsages`, `maxUsagesPerFile`, `out`,
  `verbose`, `progress`, `quiet`
- `check`: `browsers`, `includeSource`, `excludeSource`, `includePackage`,
  `excludePackage`, `showDependencyPaths`, `groupByKind`, `fail`, `json`,
  `quiet`

The fully documented JSON Schema is exported as
`featurescan/config.schema.json` and shipped at
`node_modules/featurescan/featurescan.config.schema.json`. Each config file is
validated against it; unknown keys and invalid values are reported as errors.

### Checking a manifest

```bash
# Check against the latest version of every mainstream browser
featurescan check features.json

# Check specific targets
featurescan check features.json --browser safari@15.6 --browser chrome@120

# Group issues under HTML, CSS, and JS
featurescan check features.json --browser safari@15.6 --group-by-kind

# Machine-readable output
featurescan check features.json --browser safari@15.6 --json

# Fail CI when anything is unsupported
featurescan check features.json --browser safari@15.6 --fail

# Include only first-party sources
featurescan check features-detailed.json --include-source 'src/**'

# Exclude a dependency package or version
featurescan check features-detailed.json --exclude-package '@the_dissidents/svelte-ui@0.0.28'

# Focus on selected packages
featurescan check features-detailed.json --include-package '@codemirror/*'

# Include dependency subpaths such as dist/Popup.svelte
featurescan check features-detailed.json --show-dependency-paths
```

`--browser` accepts `name@version`, `name` (latest stable), or `name@latest`.
Aliases such as `ios` (for `safari_ios`) are supported. Use
`--list-browsers` to see the available identifiers and latest versions.
`--group-by-kind` nests the issue categories (unsupported, warnings, unknown,
dependencies, ignored) under HTML, CSS, and JS headings.

Prefixed-CSS warnings are suppressed when the manifest contains a matching
`-webkit-`, `-moz-`, `-ms-`, `-o-`, or `-khtml-` marker for that property.
Unsupported features are sorted with never-supported features first, then by
the version that introduced support, newest first.

Issues whose active usages all originate from `node_modules` are moved to a
separate `Dependencies` category by default. Dependency issues do not trigger
`--fail`.

Source filtering uses four options:

- `includeSource` / `excludeSource` match the trimmed full source path.
- `includePackage` / `excludePackage` match the parsed package from a
  `node_modules` path, with an optional `@version` suffix. Glob patterns are
  allowed in both parts, for example `@codemirror/*`,
  `@the_dissidents/svelte-ui@0.0.28`, or `colorjs.io@0.7.*`.

A usage is excluded when it matches either exclude list. If any include list is
present, a usage must match at least one include pattern; otherwise it is
filtered out. Excludes take precedence over includes. Issues with no remaining
active usages are listed under `Ignored`; partially filtered issues keep only
their active usages for classification and display. Source and package filters
require a detailed manifest because keys-only manifests have no usage paths.

Check-time source display trims leading `../` segments for readability; the
manifest remains unchanged. For pnpm paths, the dependency name and version are
parsed from `.pnpm` and displayed as `@scope/package 1.2.3`. Vanilla
`node_modules` paths display the package name. Pass
`--show-dependency-paths` (or set `check.showDependencyPaths` in config) to
append the package subpath such as `dist/Popup.svelte`.

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

## Detailed manifests and source maps

`--format detailed` produces a JSON object instead of a key list:

```json
{
  "schemaVersion": 1,
  "tool": { "name": "featurescan", "version": "0.1.0" },
  "features": [
    {
      "key": "api.IntersectionObserver",
      "kind": "js",
      "confidence": "high",
      "usages": [
        {
          "file": "assets/app.js",
          "line": 1,
          "column": 20,
          "source": {
            "file": "src/observer.ts",
            "line": 10,
            "column": 5
          }
        }
      ]
    }
  ]
}
```

JS `//# sourceMappingURL=` and `/*# sourceMappingURL=... */` comments are
resolved from local files, `file:` URLs, and data URLs. Remote source maps are
ignored. Detailed manifests record the mapped location in each usage's
`source` field.

Detailed manifests retain at most 1 usage per feature per file and 10 usages per
feature per package by default; non-dependency sources share one project bucket.
Source-mapped usages count against their original source file. Set
`--max-usages-per-file 0` or `--max-usages 0` for unlimited usages, or a higher
value for more precise source filtering. Once either cap is reached, further
occurrences are skipped during the scan. Keys-only manifests remain the default
for runtime compatibility checks.

## Library API

```ts
import {
  scan,
  manifestKeys,
  CompatDB,
  formatManifest,
  formatDetailedManifest,
  parseManifestData
} from "featurescan";

const result = await scan("./dist", { maxUsages: 20, maxUsagesPerFile: 2 });
const keys = manifestKeys(result);
const json = formatManifest(keys, "json");
const detailed = formatDetailedManifest(result);
const parsed = parseManifestData(detailed);

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
- Source maps are supported for JS only, not CSS.
- Remote source maps and `.asar` archives are not handled.
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
