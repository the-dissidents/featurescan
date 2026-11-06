export type FeatureKind = "html" | "css" | "js";

export type Confidence = "high" | "medium" | "low";

export interface OriginalLocation {
  file: string;
  line: number;
  column: number;
  name?: string;
}

export interface Usage {
  file: string;
  line: number;
  column: number;
  snippet?: string;
  source?: OriginalLocation;
}

export interface Detection {
  key: string;
  kind: FeatureKind;
  confidence: Confidence;
  usages: Usage[];
}

export interface Diagnostic {
  severity: "warning";
  file?: string;
  message: string;
}

export type ScanPhase = "discover" | "scan" | "done";

export interface ScanProgress {
  phase: ScanPhase;
  processed: number;
  total: number;
  file?: string;
}

export interface ScanOptions {
  include?: string[];
  exclude?: string[];
  maxUsages?: number;
  maxUsagesPerFile?: number;
  onProgress?: (progress: ScanProgress) => void;
}

export interface ScanResult {
  root: string;
  files: string[];
  features: Detection[];
  diagnostics: Diagnostic[];
}

export type ManifestFormat = "json" | "lines" | "detailed";
export type KeyManifestFormat = Exclude<ManifestFormat, "detailed">;
