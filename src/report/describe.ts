import type { FeatureKind } from "../types";

const PSEUDO_ELEMENTS = new Set([
  "after",
  "backdrop",
  "before",
  "checkmark",
  "cue",
  "cue-region",
  "details-content",
  "file-selector-button",
  "first-letter",
  "first-line",
  "grammar-error",
  "highlight",
  "marker",
  "part",
  "placeholder",
  "selection",
  "slotted",
  "spelling-error",
  "target-text",
  "view-transition",
  "view-transition-group"
]);

const JS_SYNTAX_LABELS: Record<string, string> = {
  "javascript.classes.private_class_fields_in": "private fields in operator",
  "javascript.classes.static.initialization_blocks":
    "static initialization blocks",
  "javascript.operators.await.top_level": "top-level await",
  "javascript.operators.import.options_parameter": "dynamic import options",
  "javascript.operators.import_meta": "import.meta",
  "javascript.operators.nullish_coalescing": "nullish coalescing",
  "javascript.operators.nullish_coalescing_assignment":
    "nullish coalescing assignment",
  "javascript.operators.optional_chaining": "optional chaining"
};

function label(name: string): string {
  return name.replaceAll("_", " ");
}

function markupElement(key: string, root: string, namespace: string): string {
  const rest = key.slice(root.length);
  const [tag, ...parts] = rest.split(".");
  if (!tag) {
    return key;
  }
  if (parts.length === 0) {
    return `<${tag}> (${namespace})`;
  }
  if (parts.length >= 2) {
    return `<${tag} ${parts[0]}="${parts.slice(1).join(" ")}"> (${namespace})`;
  }

  const part = parts[0] ?? "";
  const underscore = part.indexOf("_");
  if (underscore > 0) {
    return `<${tag} ${part.slice(0, underscore)}="${part.slice(underscore + 1)}"> (${namespace})`;
  }
  return `<${tag} ${part}> (${namespace})`;
}

export function kindForKey(key: string): FeatureKind {
  if (key.startsWith("css.")) {
    return "css";
  }
  if (
    key.startsWith("javascript.") ||
    key.startsWith("api.") ||
    key.startsWith("webassembly.")
  ) {
    return "js";
  }
  return "html";
}

export function describeKey(key: string): string {
  if (key.startsWith("html.elements.")) {
    return markupElement(key, "html.elements.", "HTML");
  }
  if (key.startsWith("svg.elements.")) {
    return markupElement(key, "svg.elements.", "SVG");
  }
  if (key.startsWith("mathml.elements.")) {
    return markupElement(key, "mathml.elements.", "MathML");
  }
  if (key.startsWith("html.global_attributes.")) {
    const [attr, ...value] = key.slice("html.global_attributes.".length).split(".");
    return value.length > 0
      ? `${attr}="${value.join(" ")}" (HTML attribute)`
      : `${attr} (HTML attribute)`;
  }
  if (key.startsWith("svg.global_attributes.")) {
    return `${key.slice("svg.global_attributes.".length)} (SVG attribute)`;
  }
  if (key.startsWith("mathml.global_attributes.")) {
    return `${key.slice("mathml.global_attributes.".length)} (MathML attribute)`;
  }
  if (key.startsWith("css.properties.")) {
    const [property, ...value] = key.slice("css.properties.".length).split(".");
    return value.length > 0
      ? `${property}: ${value.join(" ")} (CSS)`
      : `${property} (CSS property)`;
  }
  if (key.startsWith("css.at-rules.media.")) {
    return `@media (${label(
      key.slice("css.at-rules.media.".length)
    )}) (CSS)`;
  }
  if (key.startsWith("css.at-rules.")) {
    return `@${key.slice("css.at-rules.".length)} (CSS at-rule)`;
  }
  if (key.startsWith("css.selectors.")) {
    const name = key.slice("css.selectors.".length);
    if (name === "nesting") {
      return "& (CSS nesting)";
    }
    return `${PSEUDO_ELEMENTS.has(name) ? "::" : ":"}${name} (CSS selector)`;
  }
  if (key.startsWith("css.types.")) {
    const name = key.split(".").at(-1) ?? key;
    return `${name}() (CSS)`;
  }
  if (key.startsWith("api.")) {
    return `${key.slice("api.".length).replace(/_static$/, "")} (Web API)`;
  }
  if (key.startsWith("javascript.builtins.")) {
    return `${key.slice("javascript.builtins.".length)} (JS builtin)`;
  }
  const syntaxLabel = JS_SYNTAX_LABELS[key];
  if (syntaxLabel) {
    return syntaxLabel;
  }
  if (key.startsWith("javascript.operators.")) {
    return `${label(key.slice("javascript.operators.".length))} (JS syntax)`;
  }
  if (key.startsWith("javascript.classes.")) {
    return `${label(key.slice("javascript.classes.".length))} (JS classes)`;
  }
  if (key.startsWith("javascript.statements.")) {
    return `${label(key.slice("javascript.statements.".length))} (JS syntax)`;
  }
  if (key.startsWith("javascript.grammar.")) {
    return `${label(key.slice("javascript.grammar.".length))} (JS syntax)`;
  }
  if (key.startsWith("javascript.regular_expressions.")) {
    return `${label(
      key.slice("javascript.regular_expressions.".length)
    )} (JS regular expressions)`;
  }
  if (key.startsWith("webassembly.")) {
    return `${key.slice("webassembly.".length)} (WebAssembly)`;
  }
  return key;
}
