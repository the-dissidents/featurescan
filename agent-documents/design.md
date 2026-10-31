# featurescan design notes

Status: v0.1 implementation complete (scan + report + check).

## Goal

Scan a built static site or HTML/JS desktop app and emit a manifest of web
platform features. The manifest is deliberately a plain list of MDN
browser-compat-data (BCD) keys:

```json
["api.IntersectionObserver", "css.properties.backdrop-filter", "html.elements.dialog"]
```

Compatibility metadata and usage locations are used by the CLI report, but are
not written into the manifest. A future runtime checker script can be generated
from the keys.

## Pipeline

```
discover files
  -> HTML scanner (parse5)
       -> inline CSS scanner (css-tree)
       -> inline JS scanner (Babel)
  -> CSS scanner (css-tree)
  -> JS scanner (Babel + scope analysis)
  -> Catalog (dedupe by key, keep usages/confidence)
  -> sorted key list
```

Parsers:

- HTML: `parse5`, with source locations and namespace awareness.
- CSS: `css-tree`, including declarations, values, selectors, at-rules,
  media features, and nesting.
- JS: `@babel/parser` plus `@babel/traverse` for binding-aware global
  detection. Babel was chosen over `oxc-parser` for mature scope analysis; the
  scanner is isolated so it can be swapped later.

Build/tooling:

- pnpm, TypeScript, rolldown, Vitest.
- `dist/cli.js` is the Node CLI; `dist/index.js` exposes the Node API.
- Dependencies are external in the bundle; the CLI is not a single-file binary.

## Detection rules

HTML/CSS rules are largely derived from BCD key existence:

- HTML element -> `html.elements.<tag>` (also SVG/MathML namespaces).
- Attribute -> `html.elements.<tag>.<attr>` or `html.global_attributes.<attr>`.
- Attribute values -> nested paths (`html.elements.link.rel.preload`) or
  flattened paths (`html.elements.input.type_date`).
- CSS property -> `css.properties.<property>`.
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

Run with `pnpm test`, `pnpm typecheck`, and `pnpm build`.
