export type FeatureKind = "html" | "css" | "js";

export type Confidence = "high" | "medium" | "low";

export interface Usage {
  file: string;
  line: number;
  column: number;
  snippet?: string;
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
  onProgress?: (progress: ScanProgress) => void;
}

export interface ScanResult {
  root: string;
  files: string[];
  features: Detection[];
  diagnostics: Diagnostic[];
}

export type ManifestFormat = "json" | "lines";
