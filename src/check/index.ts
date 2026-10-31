import type { CompatDB } from "../compat/bcd";
import {
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

export function checkManifest(
  keys: string[],
  targets: BrowserTarget[],
  compat: CompatDB
): CheckResult {
  const uniqueKeys = [...new Set(keys)].sort(compareStrings);
  const unknownKeys: string[] = [];
  const knownKeys: string[] = [];

  for (const key of uniqueKeys) {
    if (compat.has(key)) {
      knownKeys.push(key);
    } else {
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
      unsupported: unsupported.sort(byKey),
      warnings: warnings.sort(byKey),
      unknown: unknown.sort(byKey)
    };
  });

  return { targets: targetResults, unknownKeys };
}
