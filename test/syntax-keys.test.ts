import { describe, expect, it } from "vitest";
import { CompatDB } from "../src/compat/bcd";

const compat = new CompatDB();

const SYNTAX_KEYS = [
  "javascript.operators.optional_chaining",
  "javascript.operators.nullish_coalescing",
  "javascript.operators.nullish_coalescing_assignment",
  "javascript.operators.logical_and_assignment",
  "javascript.operators.logical_or_assignment",
  "javascript.operators.exponentiation",
  "javascript.operators.exponentiation_assignment",
  "javascript.operators.await.top_level",
  "javascript.operators.import",
  "javascript.operators.import.options_parameter",
  "javascript.operators.import_meta",
  "javascript.operators.new_target",
  "javascript.operators.yield",
  "javascript.operators.yield_star",
  "javascript.builtins.BigInt",
  "javascript.builtins.RegExp.hasIndices",
  "javascript.builtins.RegExp.unicodeSets",
  "javascript.builtins.RegExp.dotAll",
  "javascript.classes.public_class_fields",
  "javascript.classes.private_class_fields",
  "javascript.classes.private_class_methods",
  "javascript.classes.private_class_fields_in",
  "javascript.classes.static.initialization_blocks",
  "javascript.classes.extends",
  "javascript.statements.async_function",
  "javascript.statements.async_generator_function",
  "javascript.statements.generator_function",
  "javascript.statements.for_await_of",
  "javascript.statements.using",
  "javascript.statements.await_using",
  "javascript.statements.import.import_source",
  "javascript.statements.import.defer",
  "javascript.statements.import.import_attributes",
  "javascript.statements.export.default",
  "javascript.statements.export.namespace",
  "javascript.regular_expressions.lookbehind_assertion",
  "javascript.regular_expressions.named_capturing_group",
  "javascript.regular_expressions.named_backreference",
  "javascript.regular_expressions.unicode_character_class_escape",
  "javascript.grammar.numeric_separators",
  "javascript.grammar.binary_numeric_literals",
  "javascript.grammar.octal_numeric_literals",
  "javascript.grammar.hexadecimal_numeric_literals",
  "javascript.grammar.hashbang_comments"
];

describe("syntax feature keys", () => {
  it("exist in the compatibility database", () => {
    for (const key of SYNTAX_KEYS) {
      expect(compat.has(key), key).toBe(true);
    }
  });
});
