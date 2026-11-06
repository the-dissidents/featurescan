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

export interface TestCatalogLimits {
  maxUsagesPerBucket?: number;
  maxUsagesPerFile?: number;
}

export function createTestContext(
  limits: TestCatalogLimits = {},
  compat = new CompatDB()
): TestContext {
  const catalog = new Catalog(
    limits.maxUsagesPerBucket,
    limits.maxUsagesPerFile
  );
  const diagnostics: Diagnostic[] = [];
  const context: ScanContext = { compat, catalog, diagnostics };
  return { context, catalog, compat, diagnostics };
}
