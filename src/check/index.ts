import type { CompatDB } from "../compat/bcd";
import {
  compareVersions,
  evaluateSupport,
  type SupportEvaluation,
  type SupportState
} from "../compat/support";
import { compareStrings } from "../util";

export interface BrowserTarget {
  browser: string;
  version: string;
}

export interface CheckIssue {
  key: string;
  state: SupportState;
  added?: SupportEvaluation["added"];
  removed?: SupportEvaluation["removed"];
  partial?: boolean;
  flags?: string[];
  prefix?: string;
  prefixes?: string[];
  alternativeName?: string;
  reason?: string;
}

export interface TargetResult extends BrowserTarget {
  browserName: string;
  supported: number;
  unsupported: CheckIssue[];
  warnings: CheckIssue[];
  unknown: CheckIssue[];
}

export interface CheckResult {
  targets: TargetResult[];
  unknownKeys: string[];
}

const WARNING_STATES = new Set<SupportState>([
  "partial",
  "flagged",
  "prefixed",
  "alternative"
]);

const CSS_PROPERTY_PREFIX = /^-(webkit|moz|ms|o|khtml)-(.+)$/;

function addedVersion(issue: CheckIssue): string | undefined {
  if (typeof issue.added === "string") {
    return issue.added;
  }
  return issue.added === true ? "0" : undefined;
}

function compareUnsupported(a: CheckIssue, b: CheckIssue): number {
  const aAdded = addedVersion(a);
  const bAdded = addedVersion(b);

  if (aAdded && bAdded) {
    const comparison = compareVersions(aAdded, bAdded);
    if (comparison !== undefined && comparison !== 0) {
      return -comparison;
    }
  } else if (aAdded) {
    return 1;
  } else if (bAdded) {
    return -1;
  }

  return compareStrings(a.key, b.key);
}

function cssPrefixMarker(
  key: string,
  compat: CompatDB
): { baseKey: string; prefix: string } | undefined {
  const namespace = "css.properties.";
  if (!key.startsWith(namespace)) {
    return undefined;
  }

  const property = key.slice(namespace.length);
  const match = CSS_PROPERTY_PREFIX.exec(property);
  if (!match) {
    return undefined;
  }

  const prefix = `-${match[1]}-`;
  const baseKey = `${namespace}${match[2]}`;
  if (!compat.has(baseKey)) {
    return undefined;
  }

  return { baseKey, prefix };
}

export function checkManifest(
  keys: string[],
  targets: BrowserTarget[],
  compat: CompatDB
): CheckResult {
  const uniqueKeys = [...new Set(keys)].sort(compareStrings);
  const unknownKeys: string[] = [];
  const knownKeys: string[] = [];
  const prefixMarkers = new Map<string, Set<string>>();

  for (const key of uniqueKeys) {
    const marker = cssPrefixMarker(key, compat);
    if (marker) {
      const prefixes = prefixMarkers.get(marker.baseKey) ?? new Set<string>();
      prefixes.add(marker.prefix);
      prefixMarkers.set(marker.baseKey, prefixes);
    }

    if (compat.has(key)) {
      knownKeys.push(key);
    } else if (!marker) {
      unknownKeys.push(key);
    }
  }

  const targetResults: TargetResult[] = targets.map((target) => {
    const unsupported: CheckIssue[] = [];
    const warnings: CheckIssue[] = [];
    const unknown: CheckIssue[] = [];
    let supported = 0;

    for (const key of knownKeys) {
      const evaluation = evaluateSupport(
        compat.getCompat(key),
        target.browser,
        target.version
      );
      const issue: CheckIssue = { key, ...evaluation };
      if (evaluation.state === "supported") {
        supported += 1;
      } else if (
        evaluation.state === "prefixed" &&
        (evaluation.prefixes ?? (evaluation.prefix ? [evaluation.prefix] : [])).some(
          (prefix) => prefixMarkers.get(key)?.has(prefix)
        )
      ) {
        supported += 1;
      } else if (evaluation.state === "unsupported") {
        unsupported.push(issue);
      } else if (WARNING_STATES.has(evaluation.state)) {
        warnings.push(issue);
      } else {
        unknown.push(issue);
      }
    }

    const byKey = (a: CheckIssue, b: CheckIssue) =>
      compareStrings(a.key, b.key);

    return {
      ...target,
      browserName: compat.browserName(target.browser),
      supported,
      unsupported: unsupported.sort(compareUnsupported),
      warnings: warnings.sort(byKey),
      unknown: unknown.sort(byKey)
    };
  });

  return { targets: targetResults, unknownKeys };
}
