export {
  loadFeaturescanConfig,
  resolveCheckConfig,
  resolveScanConfig
} from "./config";
export type {
  CheckCliOverrides,
  CheckConfig,
  FeaturescanConfig,
  LoadedFeaturescanConfig,
  LoadFeaturescanConfigOptions,
  ResolvedCheckConfig,
  ResolvedScanConfig,
  ScanCliOverrides,
  ScanConfig
} from "./config";
export {
  checkFeatures,
  checkManifest,
  DEFAULT_DEPENDENCY_SOURCES
} from "./check/index";
export type {
  BrowserTarget,
  CheckFeature,
  CheckIssue,
  CheckOptions,
  CheckResult,
  TargetResult
} from "./check/index";
export { CompatDB } from "./compat/bcd";
export type {
  BcdData,
  CompatStatement,
  SupportStatement
} from "./compat/types";
export { evaluateSupport, parseVersion } from "./compat/support";
export type { SupportEvaluation, SupportState } from "./compat/support";
export {
  formatDetailedManifest,
  formatManifest,
  manifestKeys,
  parseManifest,
  parseManifestData
} from "./manifest";
export type {
  ManifestFeature,
  ParsedManifest
} from "./manifest";
export { scan } from "./scan/index";
export { Catalog } from "./scan/catalog";
export type {
  Confidence,
  Detection,
  Diagnostic,
  FeatureKind,
  KeyManifestFormat,
  ManifestFormat,
  OriginalLocation,
  ScanOptions,
  ScanPhase,
  ScanProgress,
  ScanResult,
  Usage
} from "./types";
export { VERSION } from "./version";
