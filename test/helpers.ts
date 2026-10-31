import { CompatDB } from "../src/compat/bcd";
import { Catalog } from "../src/scan/catalog";
import type { ScanContext } from "../src/scan/context";
import type { Diagnostic } from "../src/types";

export interface TestContext {
  context: ScanContext;
  catalog: Catalog;
  compat: CompatDB;
  diagnostics: Diagnostic[];
}

export function createTestContext(compat = new CompatDB()): TestContext {
  const catalog = new Catalog();
  const diagnostics: Diagnostic[] = [];
  const context: ScanContext = { compat, catalog, diagnostics };
  return { context, catalog, compat, diagnostics };
}
