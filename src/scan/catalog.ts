import {
  normalizeSourcePath,
  parseDependencyPath
} from "../dependencies";
import type { Confidence, Detection, FeatureKind, Usage } from "../types";
import { compareStrings } from "../util";

function bucketForSource(source: string): string {
  const dependency = parseDependencyPath(source);
  return dependency
    ? `${dependency.name}@${dependency.version ?? ""}`
    : "\0project";
}

function normalizedUsageSource(usage: Usage): string {
  return normalizeSourcePath(usage.source?.file ?? usage.file);
}

const confidenceRank: Record<Confidence, number> = {
  low: 0,
  medium: 1,
  high: 2
};

function unlimitedWhenZero(value: number): number {
  return value === 0 ? Infinity : value;
}

export class Catalog {
  readonly #features = new Map<string, Detection>();
  readonly #bucketCounts = new Map<string, Map<string, number>>();
  readonly #fileCounts = new Map<string, Map<string, number>>();
  readonly #maxUsagesPerBucket: number;
  readonly #maxUsagesPerFile: number;

  constructor(maxUsagesPerBucket = 10, maxUsagesPerFile = 1) {
    this.#maxUsagesPerBucket = unlimitedWhenZero(maxUsagesPerBucket);
    this.#maxUsagesPerFile = unlimitedWhenZero(maxUsagesPerFile);
  }

  /**
   * Whether another usage for `key` in `file` would be retained. Scanners use
   * this before building an expensive `Usage` (notably snippet extraction) so
   * that once a cap is reached the remaining occurrences are skipped entirely.
   */
  canAdd(key: string, file: string): boolean {
    return this.#canAddSource(key, normalizeSourcePath(file));
  }

  add(
    key: string,
    kind: FeatureKind,
    usage: Usage,
    confidence: Confidence = "high"
  ): void {
    let feature = this.#features.get(key);
    if (!feature) {
      feature = { key, kind, confidence, usages: [] };
      this.#features.set(key, feature);
    } else if (confidenceRank[confidence] > confidenceRank[feature.confidence]) {
      feature.confidence = confidence;
    }

    const source = normalizedUsageSource(usage);
    if (!this.#canAddSource(key, source)) {
      return;
    }

    if (
      !feature.usages.some(
        (existing) =>
          existing.file === usage.file &&
          existing.line === usage.line &&
          existing.column === usage.column
      )
    ) {
      feature.usages.push(usage);
      this.#increment(this.#bucketCounts, key, bucketForSource(source));
      this.#increment(this.#fileCounts, key, source);
    }
  }

  #canAddSource(key: string, normalizedSource: string): boolean {
    const fileCount =
      this.#fileCounts.get(key)?.get(normalizedSource) ?? 0;
    if (fileCount >= this.#maxUsagesPerFile) {
      return false;
    }
    const bucket = bucketForSource(normalizedSource);
    const bucketCount = this.#bucketCounts.get(key)?.get(bucket) ?? 0;
    return bucketCount < this.#maxUsagesPerBucket;
  }

  #increment(
    counts: Map<string, Map<string, number>>,
    key: string,
    entry: string
  ): void {
    let entries = counts.get(key);
    if (!entries) {
      entries = new Map<string, number>();
      counts.set(key, entries);
    }
    entries.set(entry, (entries.get(entry) ?? 0) + 1);
  }

  get size(): number {
    return this.#features.size;
  }

  keys(): string[] {
    return [...this.#features.keys()].sort(compareStrings);
  }

  results(): Detection[] {
    return [...this.#features.values()].sort((a, b) =>
      compareStrings(a.key, b.key)
    );
  }
}
