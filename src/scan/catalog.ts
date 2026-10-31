import type { Confidence, Detection, FeatureKind, Usage } from "../types";
import { compareStrings } from "../util";

const confidenceRank: Record<Confidence, number> = {
  low: 0,
  medium: 1,
  high: 2
};

export class Catalog {
  readonly #features = new Map<string, Detection>();
  readonly #maxUsagesPerFeature: number;

  constructor(maxUsagesPerFeature = 50) {
    this.#maxUsagesPerFeature = maxUsagesPerFeature;
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

    if (feature.usages.length >= this.#maxUsagesPerFeature) {
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
