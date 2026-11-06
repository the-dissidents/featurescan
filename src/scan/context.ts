import type { CompatDB } from "../compat/bcd";
import type { Confidence, Diagnostic, FeatureKind, Usage } from "../types";
import type { Catalog } from "./catalog";

export interface ScanContext {
  compat: CompatDB;
  catalog: Catalog;
  diagnostics: Diagnostic[];
}

export function canAddFeature(
  context: ScanContext,
  key: string | undefined,
  file: string
): key is string {
  return (
    key !== undefined &&
    context.compat.has(key) &&
    context.catalog.canAdd(key, file)
  );
}

export function canAddSyntheticFeature(
  context: ScanContext,
  key: string | undefined,
  file: string
): key is string {
  return key !== undefined && context.catalog.canAdd(key, file);
}

export function addFeature(
  context: ScanContext,
  key: string | undefined,
  kind: FeatureKind,
  usage: Usage,
  confidence: Confidence = "high"
): void {
  if (!key || !context.compat.has(key)) {
    return;
  }
  context.catalog.add(key, kind, usage, confidence);
}

export function addSyntheticFeature(
  context: ScanContext,
  key: string,
  kind: FeatureKind,
  usage: Usage,
  confidence: Confidence = "high"
): void {
  context.catalog.add(key, kind, usage, confidence);
}

export function warn(
  context: ScanContext,
  file: string,
  message: string
): void {
  context.diagnostics.push({ severity: "warning", file, message });
}
