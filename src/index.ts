export { CompatDB } from "./compat/bcd";
export type {
  BcdData,
  CompatStatement,
  SupportStatement
} from "./compat/types";
export { evaluateSupport, parseVersion } from "./compat/support";
export type { SupportEvaluation, SupportState } from "./compat/support";
export {
  formatManifest,
  manifestKeys,
  parseManifest
} from "./manifest";
export { scan } from "./scan/index";
export { Catalog } from "./scan/catalog";
export type {
  Confidence,
  Detection,
  Diagnostic,
  FeatureKind,
  ManifestFormat,
  ScanOptions,
  ScanPhase,
  ScanProgress,
  ScanResult,
  Usage
} from "./types";
export { VERSION } from "./version";
