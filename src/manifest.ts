import type {
  KeyManifestFormat,
  OriginalLocation,
  ScanResult,
  Usage
} from "./types";
import { compareStrings } from "./util";
import { VERSION } from "./version";

export interface ManifestFeature {
  key: string;
  usages?: Usage[];
}

export interface ParsedManifest {
  keys: string[];
  features: ManifestFeature[];
  detailed: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseOriginalLocation(value: unknown): OriginalLocation | undefined {
  if (
    !isRecord(value) ||
    typeof value.file !== "string" ||
    typeof value.line !== "number" ||
    typeof value.column !== "number"
  ) {
    return undefined;
  }
  return {
    file: value.file,
    line: value.line,
    column: value.column,
    ...(typeof value.name === "string" ? { name: value.name } : {})
  };
}

function parseUsage(value: unknown): Usage | undefined {
  if (
    !isRecord(value) ||
    typeof value.file !== "string" ||
    typeof value.line !== "number" ||
    typeof value.column !== "number"
  ) {
    return undefined;
  }

  const usage: Usage = {
    file: value.file,
    line: value.line,
    column: value.column
  };
  if (typeof value.snippet === "string") {
    usage.snippet = value.snippet;
  }
  const source = parseOriginalLocation(value.source);
  if (source) {
    usage.source = source;
  }
  return usage;
}

function parseUsages(value: unknown): Usage[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value
    .map(parseUsage)
    .filter((usage): usage is Usage => usage !== undefined);
}

export function manifestKeys(result: ScanResult): string[] {
  return result.features.map((feature) => feature.key).sort(compareStrings);
}

export function formatManifest(
  keys: string[],
  format: KeyManifestFormat = "json"
): string {
  const sorted = [...keys].sort(compareStrings);
  if (format === "lines") {
    return sorted.length > 0 ? `${sorted.join("\n")}\n` : "";
  }
  return `${JSON.stringify(sorted, null, 2)}\n`;
}

export function formatDetailedManifest(result: ScanResult): string {
  const features = result.features.map((feature) => ({
    key: feature.key,
    kind: feature.kind,
    confidence: feature.confidence,
    usages: feature.usages
  }));
  return `${JSON.stringify(
    {
      schemaVersion: 1,
      tool: { name: "featurescan", version: VERSION },
      features
    },
    null,
    2
  )}\n`;
}

export function parseManifestData(source: string): ParsedManifest {
  const trimmed = source.trim();
  if (!trimmed) {
    return { keys: [], features: [], detailed: false };
  }

  if (trimmed.startsWith("[")) {
    const parsed: unknown = JSON.parse(trimmed);
    if (
      !Array.isArray(parsed) ||
      parsed.some((entry) => typeof entry !== "string")
    ) {
      throw new Error("manifest must be a JSON array of feature keys");
    }
    return {
      keys: parsed as string[],
      features: (parsed as string[]).map((key) => ({ key })),
      detailed: false
    };
  }

  if (trimmed.startsWith("{")) {
    const parsed: unknown = JSON.parse(trimmed);
    if (!isRecord(parsed) || !Array.isArray(parsed.features)) {
      throw new Error("detailed manifest must contain a features array");
    }

    const features: ManifestFeature[] = parsed.features.map((entry) => {
      if (!isRecord(entry) || typeof entry.key !== "string") {
        throw new Error("detailed manifest features must have a string key");
      }
      const usages = parseUsages(entry.usages);
      return usages ? { key: entry.key, usages } : { key: entry.key };
    });

    return {
      keys: features.map((feature) => feature.key),
      features,
      detailed: true
    };
  }

  const keys = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
  return {
    keys,
    features: keys.map((key) => ({ key })),
    detailed: false
  };
}

export function parseManifest(source: string): string[] {
  return parseManifestData(source).keys;
}
