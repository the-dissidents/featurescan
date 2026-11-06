import { parse, walk, type CssNode } from "css-tree";
import type { ScanContext } from "./context";
import {
  addFeature,
  addSyntheticFeature,
  canAddFeature,
  canAddSyntheticFeature,
  warn
} from "./context";
import { makeUsage } from "./source";

const VENDOR_PREFIX = /^-(webkit|moz|ms|o|khtml)-/;

export interface CssBasePosition {
  offset: number;
  line: number;
  column: number;
}

export interface CssScanInput {
  file: string;
  source: string;
  context: ScanContext;
  base?: CssBasePosition;
  mode?: "stylesheet" | "declarationList";
}

function localPosition(
  line: number,
  column: number,
  base: CssBasePosition | undefined
): { line: number; column: number } {
  if (!base) {
    return { line, column };
  }
  const localLine = line - base.line + 1;
  const localColumn = localLine === 1 ? column - base.column + 1 : column;
  return { line: localLine, column: localColumn };
}

function mediaFeatureName(name: string): string {
  return name.replace(/^(min|max)-/, "");
}

export function scanCss(input: CssScanInput): void {
  const { file, source, context, base } = input;
  let ast: CssNode;

  try {
    ast = parse(source, {
      context: input.mode ?? "stylesheet",
      positions: true,
      filename: file,
      offset: base?.offset ?? 0,
      line: base?.line ?? 1,
      column: base?.column ?? 1,
      parseCustomProperty: false,
      onParseError: (error) => {
        warn(context, file, error.formattedMessage || error.message);
      }
    });
  } catch (error) {
    warn(
      context,
      file,
      error instanceof Error ? error.message : "failed to parse CSS"
    );
    return;
  }

  const addWith = (
    key: string | undefined,
    node: CssNode,
    confidence: "high" | "medium",
    synthetic: boolean
  ) => {
    if (!key || !node.loc) {
      return;
    }
    const allowed = synthetic
      ? canAddSyntheticFeature(context, key, file)
      : canAddFeature(context, key, file);
    if (!allowed) {
      return;
    }
    const start = node.loc.start;
    const local = localPosition(start.line, start.column, base);
    const usage = makeUsage(
      file,
      start.line,
      start.column,
      source,
      local.line,
      local.column
    );
    if (synthetic) {
      addSyntheticFeature(context, key, "css", usage, confidence);
    } else {
      addFeature(context, key, "css", usage, confidence);
    }
  };

  const add = (
    key: string | undefined,
    node: CssNode,
    confidence: "high" | "medium" = "high"
  ) => {
    addWith(key, node, confidence, false);
  };

  const addSynthetic = (key: string, node: CssNode) => {
    addWith(key, node, "high", true);
  };

  const addValues = (
    property: string,
    value: CssNode,
    declaration: CssNode
  ) => {
    if (value.type !== "Value") {
      return;
    }

    let identifierCount = 0;
    for (const child of value.children.toArray()) {
      if (child.type === "Identifier") {
        identifierCount += 1;
        add(context.compat.cssValue(property, child.name), child);
      }
    }

    if (identifierCount >= 2) {
      for (const suffix of [
        "multi-keyword_values",
        "multiple_keywords",
        "multi_keyword_values",
        "multiple_keyword_values"
      ]) {
        const key = `css.properties.${property}.${suffix}`;
        if (context.compat.has(key)) {
          add(key, declaration);
        }
      }
    }
  };

  walk(ast, {
    enter(node: CssNode) {
      switch (node.type) {
        case "Atrule": {
          add(context.compat.cssAtRule(node.name), node);
          break;
        }
        case "Declaration": {
          const property = node.property;
          if (property.startsWith("--")) {
            add(context.compat.cssProperty("custom-property"), node);
            break;
          }

          const normalizedProperty = property.toLowerCase();
          const prefixMatch = VENDOR_PREFIX.exec(normalizedProperty);
          if (prefixMatch) {
            const baseProperty = normalizedProperty.slice(prefixMatch[0].length);
            const baseKey = context.compat.cssProperty(baseProperty);
            if (baseKey) {
              add(baseKey, node);
              addSynthetic(`css.properties.${normalizedProperty}`, node);
              addValues(baseProperty, node.value, node);
              break;
            }
          }

          add(context.compat.cssProperty(normalizedProperty), node);
          addValues(normalizedProperty, node.value, node);
          break;
        }
        case "Function": {
          add(context.compat.cssFunction(node.name), node);
          break;
        }
        case "PseudoClassSelector":
        case "PseudoElementSelector": {
          add(context.compat.cssSelector(node.name), node);
          break;
        }
        case "NestingSelector": {
          add(context.compat.cssSelector("nesting"), node);
          break;
        }
        case "Feature": {
          add(context.compat.mediaFeature(mediaFeatureName(node.name)), node);
          break;
        }
        case "FeatureRange": {
          add(context.compat.mediaRangeSyntax(), node);
          const middle = node.middle;
          const left = node.left;
          const right = node.right;
          if (middle.type === "Identifier") {
            add(
              context.compat.mediaFeature(mediaFeatureName(middle.name)),
              middle
            );
          } else if (left.type === "Identifier") {
            add(
              context.compat.mediaFeature(mediaFeatureName(left.name)),
              left
            );
          } else if (right?.type === "Identifier") {
            add(
              context.compat.mediaFeature(mediaFeatureName(right.name)),
              right
            );
          }
          break;
        }
      }
    }
  });
}
