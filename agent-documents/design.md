# featurescan design notes

Status: v0.1 implementation complete (scan + report + check).

## Goal

Scan a built static site or HTML/JS desktop app and emit a manifest of web
platform features. The default manifest is a plain list of keys, mostly MDN
browser-compat-data (BCD) keys plus synthetic vendor-prefix markers:

```json
["api.IntersectionObserver", "css.properties.backdrop-filter", "html.elements.dialog"]
```

Compatibility metadata is resolved by the CLI. Usage locations and source-map
origins can be written with `--format detailed`; the default keys-only manifest
remains the runtime-checker input. A future runtime checker script can be
generated from the keys.

## Pipeline

```
discover files
  -> HTML scanner (parse5)
       -> inline CSS scanner (css-tree)
       -> inline JS scanner (Babel)
  -> CSS scanner (css-tree)
  -> JS scanner (Babel + scope analysis)
       -> local/data source maps via `source-map`
  -> Catalog (dedupe by key, keep usages/confidence/source origins)
  -> sorted key list or detailed manifest
```

Parsers:

- HTML: `parse5`, with source locations and namespace awareness.
- CSS: `css-tree`, including declarations, values, selectors, at-rules,
  media features, and nesting.
- JS: `@babel/parser` plus `@babel/traverse` for binding-aware global
  detection. Babel was chosen over `oxc-parser` for mature scope analysis; the
  scanner is isolated so it can be swapped later.
- Source maps: `source-map`, resolved from `sourceMappingURL` comments in JS.
  Local files, `file:` URLs, and data URLs are supported; remote maps are
  ignored. Each JS usage gains an optional original location.

Build/tooling:

- pnpm, TypeScript, rolldown, Vitest.
- `dist/cli.js` is the Node CLI; `dist/index.js` exposes the Node API.
- Dependencies are external in the bundle; the CLI is not a single-file binary.

## CLI output and progress

- `scan` exposes an `onProgress` callback through `ScanOptions`.
- The CLI renders an interactive progress bar on stderr only when stderr is a
  TTY; `--quiet` and `--no-progress` disable it.
- Without `-o`, the manifest is written to stdout and the report to stderr.
- With `-o`, the manifest is written to the file and the report to stdout, so
  report output can be redirected independently without corrupting the manifest.
- Report colors are derived from the report's destination stream, not stdout,
  so redirected manifests do not strip color from a TTY report.
- `--no-color` and `NO_COLOR` disable colors.
- `--format detailed` emits `{ schemaVersion, tool, features }` with usage
  locations and source-map origins. Detailed scans default to unlimited usages
  so source-based filtering sees every origin.
- Detailed `check` output separates issues whose usages all originate from
  `node_modules` into a `Dependencies` category by default.
  `--dependency-source <glob>` adds more dependency paths, and
  `--ignore-source <glob>` removes matching issues. They apply only when every
  usage matches; mixed first-party/dependency usage keeps the issue in its
  normal category. Dependency issues do not trigger `--fail`. Displayed source paths are filtered
per category: primary issues omit dependency sources, while dependency issues
show their dependency sources.

## Detection rules

HTML/CSS rules are largely derived from BCD key existence:

- HTML element -> `html.elements.<tag>` (also SVG/MathML namespaces).
- Attribute -> `html.elements.<tag>.<attr>` or `html.global_attributes.<attr>`.
- Attribute values -> nested paths (`html.elements.link.rel.preload`) or
  flattened paths (`html.elements.input.type_date`).
- CSS property -> `css.properties.<property>`.
- Vendor-prefixed properties (`-webkit-user-select`) also add the base BCD key
  and a synthetic marker such as `css.properties.-webkit-user-select`. The
  marker records that the prefix fallback was present.
- CSS value -> `css.properties.<property>.<value>` when BCD has that key.
- CSS function -> a leaf under `css.types.*` (`css.types.color.color-mix`).
- CSS at-rule/selector/media feature -> the matching BCD subtree. `min-` and
  `max-` media feature prefixes normalize to the base feature.

JS detection is curated plus scope-aware:

- Free globals map to `api.<name>` when BCD has it.
- Selected modern builtin globals (`WeakRef`, `BigInt`, `Temporal`, ...) map to
  `javascript.builtins.*`.
- Members of known global objects map through interface names
  (`navigator.share` -> `api.Navigator.share`). Nested paths such as
  `crypto.subtle` and `navigator.serviceWorker` are handled explicitly.
- Common window-level functions are recognized when used as free globals
  (`requestAnimationFrame`, `getComputedStyle`, `matchMedia`, ...).
- Static builtins and API static members are resolved dynamically
  (`Object.hasOwn`, `Promise.withResolvers`, `Intl.Segmenter`,
  `URL.createObjectURL`, ...).
- A curated list of instance builtins and DOM methods covers common ambiguous
  receivers (`replaceAll`, `toSorted`, `showModal`, `attachShadow`, ...).
  These are marked `medium` confidence.
- Syntax features are detected from AST nodes: optional chaining, `??`,
  logical assignment, `**`, BigInt, class fields/private names/static blocks,
  top-level await, dynamic import, `import.meta`, import attributes, `using`,
  regex flags/assertions, and related grammar keys.

Babel 8 note: many proposal plugins are now defaults, and `_static` is used for
static interface members in BCD (`api.CSS.supports_static`). `interfaceMember()`
tries both forms.

## Compatibility checking

`featurescan check` loads BCD at runtime and evaluates each key against explicit
browser targets. `evaluateSupport()` normalizes BCD's support arrays:

- string versions, `true` (treated as version `0`), `false`/`null`
- multiple support ranges with `version_removed`
- `partial_implementation`, flags, prefixes, and alternative names
- version prefixes such as `≤37`
- `TP`/`preview` targets

Results are split into supported, unsupported, warnings (partial/flagged/
prefixed/alternative), and unknown. Unknown feature keys are reported
separately. `check` defaults to the latest stable version of mainstream
browsers; `--browser name@version` overrides this.

When a feature is supported only through a prefix and the manifest contains a
matching synthetic prefix marker for any qualifying prefix, the prefixed
warning is suppressed and the feature is counted as covered. Synthetic markers
are excluded from feature evaluation and unknown-key reporting.

Source classification uses the mapped original path when present, otherwise the
generated file path. `check` rejects source-filter options for keys-only
manifests because there is no usage information to evaluate.

Unsupported issues with no support at all are listed first; the rest are sorted
by their `version_added` value descending (newest support requirement first),
with key order as the tiebreaker.

## Detection confidence

The manifest has no confidence field. Confidence exists only in the in-memory
catalog and the report:

- `high`: direct BCD lookup (tags, attributes, CSS, globals, static builtins).
- `medium`: instance methods whose receiver type is not statically known.

This avoids blocking on ambiguous method names while still surfacing them.

## Limitations / future work

- Runtime checker script generation and browser probes are deferred.
- No source-map remapping, `.asar` support, or type-aware JS/TS analysis.
- Computed access (`window[name]`) is undetectable.
- All matching files are scanned, so unused chunks and dead code can add
  features.
- Polyfills may produce feature false positives.
- Possible next steps: source maps, runtime probe descriptors, `--targets`
  shorthand via browserslist, more precise receiver inference, and an ESLint
  plugin for TypeScript sources.

## Tests

- Unit tests for HTML/CSS/JS scanners.
- BCD rule validation (curated keys must exist).
- Support evaluation tests with synthetic BCD entries.
- Fixture-site end-to-end scan and manifest round-trip.
- Check command/target resolution tests.
- Progress bar and destination-stream color tests.
- Source-map mapping and detailed-manifest round-trip tests.
- Source-based dependency classification and ignore tests.

Run with `pnpm test`, `pnpm typecheck`, and `pnpm build`.
