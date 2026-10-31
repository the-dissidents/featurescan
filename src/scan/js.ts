import { parse, type ParserPlugin } from "@babel/parser";
import traverse, { type Scope } from "@babel/traverse";
import type { NodePath } from "@babel/traverse";
import type * as t from "@babel/types";
import {
  GLOBAL_FUNCTION_KEYS,
  GLOBAL_OBJECT_INTERFACES,
  GLOBAL_PATHS,
  INSTANCE_API_METHODS,
  INSTANCE_BUILTIN_METHODS,
  MODERN_BUILTIN_GLOBALS,
  SPECIAL_GLOBAL_KEYS,
  WINDOW_GLOBAL_FUNCTIONS
} from "../rules/js";
import type { Confidence, Usage } from "../types";
import type { ScanContext } from "./context";
import { addFeature, warn } from "./context";
import { makeUsage } from "./source";

const PLUGINS: ParserPlugin[] = [
  "jsx",
  "decorators",
  "decoratorAutoAccessors",
  "sourcePhaseImports",
  "deferredImportEvaluation"
];

export interface JsBasePosition {
  offset: number;
  line: number;
  column: number;
}

export interface JsScanInput {
  file: string;
  source: string;
  context: ScanContext;
  sourceType?: "script" | "module" | "unambiguous";
  base?: JsBasePosition;
  allowReturnOutsideFunction?: boolean;
  allowAwaitOutsideFunction?: boolean;
}

function localPosition(
  line: number,
  column: number,
  base: JsBasePosition | undefined
): { line: number; column: number } {
  if (!base) {
    return { line, column };
  }
  const localLine = line - base.line + 1;
  const localColumn = localLine === 1 ? column - base.column + 1 : column;
  return { line: localLine, column: localColumn };
}

function usageFor(
  node: t.Node,
  file: string,
  source: string,
  base: JsBasePosition | undefined
): Usage | undefined {
  const start = node.loc?.start;
  if (!start) {
    return undefined;
  }
  const line = start.line;
  const column = start.column + 1;
  const local = localPosition(line, column, base);
  return makeUsage(file, line, column, source, local.line, local.column);
}

function propertyName(
  node: t.MemberExpression | t.OptionalMemberExpression
): string | undefined {
  if (node.computed) {
    if (node.property.type === "StringLiteral" || node.property.type === "NumericLiteral") {
      return String(node.property.value);
    }
    return undefined;
  }
  return node.property.type === "Identifier" ? node.property.name : undefined;
}

function globalObjectPath(node: t.Node, scope: Scope): string | undefined {
  if (node.type === "Identifier") {
    if (scope.getBinding(node.name)) {
      return undefined;
    }
    return node.name;
  }

  if (
    (node.type === "MemberExpression" ||
      node.type === "OptionalMemberExpression") &&
    !node.computed &&
    node.property.type === "Identifier"
  ) {
    const base = globalObjectPath(node.object, scope);
    return base ? `${base}.${node.property.name}` : undefined;
  }

  return undefined;
}

function ownRecordValue<T>(
  record: Record<string, T>,
  key: string
): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

function stripGlobalPrefix(path: string): string {
  for (const prefix of ["window.", "self.", "globalThis."]) {
    if (path.startsWith(prefix)) {
      return path.slice(prefix.length);
    }
  }
  return path;
}

function resolveGlobalInterface(path: string): string | undefined {
  const namedPath = ownRecordValue(GLOBAL_PATHS, path);
  if (namedPath) {
    return namedPath;
  }
  const globalObject = ownRecordValue(GLOBAL_OBJECT_INTERFACES, path);
  if (globalObject) {
    return globalObject;
  }

  const stripped = stripGlobalPrefix(path);
  if (stripped !== path) {
    return resolveGlobalInterface(stripped);
  }
  return undefined;
}

function isCallCallee(path: NodePath<t.Node>): boolean {
  const parent = path.parent;
  return (
    (parent.type === "CallExpression" ||
      parent.type === "OptionalCallExpression") &&
    parent.callee === path.node
  );
}

export function scanJs(input: JsScanInput): void {
  const { file, source, context, base } = input;
  let ast: t.File;

  const parseOptions = (
    sourceType: "script" | "module" | "unambiguous",
    plugins: ParserPlugin[]
  ) => ({
    sourceType,
    plugins,
    startLine: base?.line,
    startColumn: base ? base.column - 1 : undefined,
    startIndex: base?.offset,
    allowReturnOutsideFunction: input.allowReturnOutsideFunction,
    allowAwaitOutsideFunction: input.allowAwaitOutsideFunction,
    attachComment: false
  });

  const requestedSourceType = input.sourceType ?? "unambiguous";

  try {
    ast = parse(source, parseOptions(requestedSourceType, PLUGINS));
  } catch (firstError) {
    try {
      ast = parse(source, parseOptions(requestedSourceType, ["jsx"]));
      warn(
        context,
        file,
        `parsed with a reduced plugin set: ${
          firstError instanceof Error ? firstError.message : "unknown parse error"
        }`
      );
    } catch (secondError) {
      if (requestedSourceType === "unambiguous") {
        try {
          ast = parse(source, parseOptions("module", ["jsx"]));
        } catch (error) {
          warn(
            context,
            file,
            error instanceof Error
              ? error.message
              : "failed to parse JavaScript"
          );
          return;
        }
      } else {
        warn(
          context,
          file,
          secondError instanceof Error
            ? secondError.message
            : "failed to parse JavaScript"
        );
        return;
      }
    }
  }

  const add = (
    key: string | undefined,
    node: t.Node,
    confidence: Confidence = "high"
  ) => {
    const usage = usageFor(node, file, source, base);
    if (usage) {
      addFeature(context, key, "js", usage, confidence);
    }
  };

  const addBuiltinInstanceMethods = (name: string, node: t.Node) => {
    const candidates = ownRecordValue(INSTANCE_BUILTIN_METHODS, name);
    if (!candidates) {
      return;
    }
    for (const candidate of candidates) {
      add(
        context.compat.builtinStatic(candidate.owner, candidate.property),
        node,
        "medium"
      );
    }
  };

  const addApiInstanceMethods = (name: string, node: t.Node) => {
    const candidates = ownRecordValue(INSTANCE_API_METHODS, name);
    if (!candidates) {
      return;
    }
    for (const candidate of candidates) {
      add(
        context.compat.interfaceMember(
          candidate.interfaceName,
          candidate.property
        ),
        node,
        "medium"
      );
    }
  };

  const handleMember = (
    path: NodePath<t.MemberExpression | t.OptionalMemberExpression>
  ) => {
    const node = path.node;
    const name = propertyName(node);
    if (!name) {
      return;
    }

    const objectPath = globalObjectPath(node.object, path.scope);
    let handled = false;

    if (objectPath) {
      const stripped = stripGlobalPrefix(objectPath);
      const interfaceName = resolveGlobalInterface(objectPath);
      if (interfaceName) {
        const key = context.compat.interfaceMember(interfaceName, name);
        if (key) {
          add(key, node);
          handled = true;
        }
      }

      if (stripped === "window" || stripped === "self" || stripped === "globalThis") {
        const key =
          context.compat.interfaceMember("Window", name) ??
          context.compat.apiGlobal(name);
        if (key) {
          add(key, node);
          handled = true;
        }
      }

      if (stripped === "WebAssembly") {
        const key = context.compat.webAssemblyStatic(name);
        if (key) {
          add(key, node);
          handled = true;
        }
      } else if (context.compat.builtinGlobal(stripped)) {
        const key = context.compat.builtinStatic(stripped, name);
        if (key) {
          add(key, node);
          handled = true;
        }
      } else if (context.compat.apiGlobal(stripped)) {
        const key = context.compat.interfaceMember(stripped, name);
        if (key) {
          add(key, node);
          handled = true;
        }
      }
    }

    if (handled) {
      return;
    }

    if (isCallCallee(path)) {
      addBuiltinInstanceMethods(name, node);
      addApiInstanceMethods(name, node);
    }
  };

  const addFunctionSyntax = (node: t.Node & { async?: boolean | null; generator?: boolean | null }) => {
    if (node.async && node.generator) {
      add("javascript.statements.async_generator_function", node);
    } else if (node.async) {
      add("javascript.statements.async_function", node);
    } else if (node.generator) {
      add("javascript.statements.generator_function", node);
    }
  };

  traverse(ast, {
    ReferencedIdentifier(path) {
      const name = path.node.name;
      if (path.scope.getBinding(name)) {
        return;
      }
      if (Object.hasOwn(GLOBAL_OBJECT_INTERFACES, name)) {
        return;
      }
      if (name === "WebAssembly") {
        add(ownRecordValue(SPECIAL_GLOBAL_KEYS, name), path.node);
        return;
      }
      const override = ownRecordValue(GLOBAL_FUNCTION_KEYS, name);
      if (override) {
        add(
          context.compat.interfaceMember(
            override.interfaceName,
            override.property
          ),
          path.node
        );
        return;
      }
      if (WINDOW_GLOBAL_FUNCTIONS.has(name)) {
        const windowKey = context.compat.interfaceMember("Window", name);
        if (windowKey) {
          add(windowKey, path.node);
          return;
        }
      }
      const apiKey = context.compat.apiGlobal(name);
      if (apiKey) {
        add(apiKey, path.node);
        return;
      }
      if (MODERN_BUILTIN_GLOBALS.has(name)) {
        add(context.compat.builtinGlobal(name), path.node);
      }
    },

    MemberExpression(path) {
      handleMember(path);
    },

    OptionalMemberExpression(path) {
      add("javascript.operators.optional_chaining", path.node);
      handleMember(path);
    },

    OptionalCallExpression(path) {
      add("javascript.operators.optional_chaining", path.node);
    },

    LogicalExpression(path) {
      if (path.node.operator === "??") {
        add("javascript.operators.nullish_coalescing", path.node);
      }
    },

    AssignmentExpression(path) {
      switch (path.node.operator) {
        case "??=":
          add("javascript.operators.nullish_coalescing_assignment", path.node);
          break;
        case "&&=":
          add("javascript.operators.logical_and_assignment", path.node);
          break;
        case "||=":
          add("javascript.operators.logical_or_assignment", path.node);
          break;
        case "**=":
          add("javascript.operators.exponentiation_assignment", path.node);
          break;
      }
    },

    BinaryExpression(path) {
      if (path.node.operator === "**") {
        add("javascript.operators.exponentiation", path.node);
      }
    },

    BigIntLiteral(path) {
      add("javascript.builtins.BigInt", path.node);
    },

    ClassProperty(path) {
      add("javascript.classes.public_class_fields", path.node);
    },

    ClassAccessorProperty(path) {
      add("javascript.classes.public_class_fields", path.node);
    },

    ClassPrivateProperty(path) {
      add("javascript.classes.private_class_fields", path.node);
    },

    ClassPrivateMethod(path) {
      add("javascript.classes.private_class_methods", path.node);
      addFunctionSyntax(path.node);
    },

    PrivateName(path) {
      const parent = path.parent;
      if (parent.type === "BinaryExpression" && parent.operator === "in") {
        add("javascript.classes.private_class_fields_in", path.node);
      }
    },

    StaticBlock(path) {
      add("javascript.classes.static.initialization_blocks", path.node);
    },

    AwaitExpression(path) {
      if (!path.getFunctionParent()) {
        add("javascript.operators.await.top_level", path.node);
      }
    },

    ImportExpression(path) {
      add("javascript.operators.import", path.node);
      if (path.node.options) {
        add("javascript.operators.import.options_parameter", path.node);
      }
    },

    MetaProperty(path) {
      if (path.node.meta.name === "import" && path.node.property.name === "meta") {
        add("javascript.operators.import_meta", path.node);
      } else if (
        path.node.meta.name === "new" &&
        path.node.property.name === "target"
      ) {
        add("javascript.operators.new_target", path.node);
      }
    },

    ForOfStatement(path) {
      if (path.node.await) {
        add("javascript.statements.for_await_of", path.node);
      }
    },

    VariableDeclaration(path) {
      if (path.node.kind === "using") {
        add("javascript.statements.using", path.node);
      } else if (path.node.kind === "await using") {
        add("javascript.statements.await_using", path.node);
      }
    },

    ImportDeclaration(path) {
      if (path.node.phase === "source") {
        add("javascript.statements.import.import_source", path.node);
      } else if (path.node.phase === "defer") {
        add("javascript.statements.import.defer", path.node);
      }
      if (path.node.attributes && path.node.attributes.length > 0) {
        add("javascript.statements.import.import_attributes", path.node);
      }
    },

    ExportDefaultDeclaration(path) {
      add("javascript.statements.export.default", path.node);
    },

    ExportNamedDeclaration(path) {
      if (
        path.node.specifiers.some(
          (specifier) => specifier.type === "ExportNamespaceSpecifier"
        )
      ) {
        add("javascript.statements.export.namespace", path.node);
      }
    },

    FunctionDeclaration(path) {
      addFunctionSyntax(path.node);
    },

    FunctionExpression(path) {
      addFunctionSyntax(path.node);
    },

    ArrowFunctionExpression(path) {
      addFunctionSyntax(path.node);
    },

    ClassMethod(path) {
      addFunctionSyntax(path.node);
    },

    ObjectMethod(path) {
      addFunctionSyntax(path.node);
    },

    YieldExpression(path) {
      add(
        path.node.delegate
          ? "javascript.operators.yield_star"
          : "javascript.operators.yield",
        path.node
      );
    },

    ClassDeclaration(path) {
      if (path.node.superClass) {
        add("javascript.classes.extends", path.node);
      }
    },

    ClassExpression(path) {
      if (path.node.superClass) {
        add("javascript.classes.extends", path.node);
      }
    },

    RegExpLiteral(path) {
      const flags = path.node.flags;
      if (flags.includes("d")) {
        add("javascript.builtins.RegExp.hasIndices", path.node);
      }
      if (flags.includes("v")) {
        add("javascript.builtins.RegExp.unicodeSets", path.node);
      }
      if (flags.includes("s")) {
        add("javascript.builtins.RegExp.dotAll", path.node);
      }

      const pattern = path.node.pattern;
      if (pattern.includes("(?<=") || pattern.includes("(?<!")) {
        add("javascript.regular_expressions.lookbehind_assertion", path.node);
      }
      if (/\(\?<[A-Za-z_$][A-Za-z0-9_$]*>/.test(pattern)) {
        add("javascript.regular_expressions.named_capturing_group", path.node);
      }
      if (pattern.includes("\\k<")) {
        add("javascript.regular_expressions.named_backreference", path.node);
      }
      if (pattern.includes("\\p{") || pattern.includes("\\P{")) {
        add(
          "javascript.regular_expressions.unicode_character_class_escape",
          path.node
        );
      }
    },

    NumericLiteral(path) {
      const raw = path.node.extra?.raw;
      if (typeof raw !== "string") {
        return;
      }
      if (raw.includes("_")) {
        add("javascript.grammar.numeric_separators", path.node);
      }
      if (/^0[bB]/.test(raw)) {
        add("javascript.grammar.binary_numeric_literals", path.node);
      } else if (/^0[oO]/.test(raw)) {
        add("javascript.grammar.octal_numeric_literals", path.node);
      } else if (/^0[xX]/.test(raw)) {
        add("javascript.grammar.hexadecimal_numeric_literals", path.node);
      }
    },

    InterpreterDirective(path) {
      add("javascript.grammar.hashbang_comments", path.node);
    }
  });
}
