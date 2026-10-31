import type { ManifestFormat, ScanResult } from "./types";
import { compareStrings } from "./util";

export function manifestKeys(result: ScanResult): string[] {
  return result.features.map((feature) => feature.key).sort(compareStrings);
}

export function formatManifest(
  keys: string[],
  format: ManifestFormat = "json"
): string {
  const sorted = [...keys].sort(compareStrings);
  if (format === "lines") {
    return sorted.length > 0 ? `${sorted.join("\n")}\n` : "";
  }
  return `${JSON.stringify(sorted, null, 2)}\n`;
}

export function parseManifest(source: string): string[] {
  const trimmed = source.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith("[")) {
    const parsed: unknown = JSON.parse(trimmed);
    if (
      !Array.isArray(parsed) ||
      parsed.some((entry) => typeof entry !== "string")
    ) {
      throw new Error("manifest must be a JSON array of feature keys");
    }
    return parsed as string[];
  }

  return trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}
