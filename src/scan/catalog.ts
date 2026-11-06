import {
  normalizeSourcePath,
  parseDependencyPath
} from "../dependencies";
import type { Confidence, Detection, FeatureKind, Usage } from "../types";
import { compareStrings } from "../util";

function usageBucket(usage: Usage): string {
  const source = normalizeSourcePath(usage.source?.file ?? usage.file);
  const dependency = parseDependencyPath(source);
  return dependency
    ? `${dependency.name}@${dependency.version ?? ""}`
    : "\0project";
}

const confidenceRank: Record<Confidence, number> = {
  low: 0,
  medium: 1,
  high: 2
};

export class Catalog {
  readonly #features = new Map<string, Detection>();
  readonly #bucketCounts = new Map<string, Map<string, number>>();
  readonly #maxUsagesPerBucket: number;

  constructor(maxUsagesPerBucket = 10) {
    this.#maxUsagesPerBucket = maxUsagesPerBucket;
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

    const bucket = usageBucket(usage);
    let counts = this.#bucketCounts.get(key);
    if (!counts) {
      counts = new Map<string, number>();
      this.#bucketCounts.set(key, counts);
    }
    if ((counts.get(bucket) ?? 0) >= this.#maxUsagesPerBucket) {
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
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    }
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
