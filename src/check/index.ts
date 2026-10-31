import picomatch from "picomatch";
import type { CompatDB } from "../compat/bcd";
import {
  compareVersions,
  evaluateSupport,
  type SupportEvaluation,
  type SupportState
} from "../compat/support";
import type { Usage } from "../types";
import { compareStrings } from "../util";

export interface BrowserTarget {
  browser: string;
  version: string;
}

export interface CheckFeature {
  key: string;
  usages?: Usage[];
}

export interface CheckOptions {
  ignoreSources?: string[];
  dependencySources?: string[];
}

export const DEFAULT_DEPENDENCY_SOURCES = ["**/node_modules/**"];

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
  usages?: Usage[];
  sourcePaths?: string[];
}

export interface TargetResult extends BrowserTarget {
  browserName: string;
  supported: number;
  unsupported: CheckIssue[];
  warnings: CheckIssue[];
  unknown: CheckIssue[];
  ignored: CheckIssue[];
  dependencies: CheckIssue[];
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

type Matcher = (value: string) => boolean;
type SourceClassification = "none" | "ignored" | "dependency";

const ISSUE_STATE_ORDER: Record<SupportState, number> = {
  unsupported: 0,
  partial: 1,
  flagged: 2,
  prefixed: 3,
  alternative: 4,
  unknown: 5,
  supported: 6
};

function compileMatchers(globs: string[] | undefined): Matcher[] {
  return (globs ?? []).map((glob) => picomatch(glob, { dot: true }));
}

function sourcePath(usage: Usage): string {
  const value = (usage.source?.file ?? usage.file).replaceAll("\\", "/");
  const parts: string[] = [];

  for (const part of value.split("/")) {
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      parts.pop();
      continue;
    }
    parts.push(part);
  }

  return parts.join("/");
}

function matchesAny(value: string, matchers: Matcher[]): boolean {
  return matchers.some((match) => match(value));
}

function displaySources(
  usages: Usage[] | undefined,
  classification: SourceClassification,
  dependencyMatchers: Matcher[]
): string[] | undefined {
  if (!usages || usages.length === 0) {
    return undefined;
  }

  const sources = [...new Set(usages.map(sourcePath))].sort(compareStrings);
  const display =
    classification === "none"
      ? sources.filter((source) => !matchesAny(source, dependencyMatchers))
      : sources;

  return display.length > 0 ? display : undefined;
}

function classifyUsages(
  usages: Usage[] | undefined,
  ignoreMatchers: Matcher[],
  dependencyMatchers: Matcher[]
): SourceClassification {
  if (!usages || usages.length === 0) {
    return "none";
  }

  const sources = usages.map(sourcePath);
  if (
    ignoreMatchers.length > 0 &&
    sources.every((source) => ignoreMatchers.some((match) => match(source)))
  ) {
    return "ignored";
  }
  if (
    dependencyMatchers.length > 0 &&
    sources.every((source) => dependencyMatchers.some((match) => match(source)))
  ) {
    return "dependency";
  }
  return "none";
}

export function checkFeatures(
  features: CheckFeature[],
  targets: BrowserTarget[],
  compat: CompatDB,
  options: CheckOptions = {}
): CheckResult {
  const usageByKey = new Map<string, Usage[] | undefined>();
  for (const feature of features) {
    if (!usageByKey.has(feature.key)) {
      usageByKey.set(
        feature.key,
        feature.usages ? [...feature.usages] : undefined
      );
    } else if (feature.usages) {
      usageByKey.set(feature.key, [
        ...(usageByKey.get(feature.key) ?? []),
        ...feature.usages
      ]);
    }
  }

  const uniqueKeys = [...usageByKey.keys()].sort(compareStrings);
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

  const ignoreMatchers = compileMatchers(options.ignoreSources);
  const dependencyMatchers = compileMatchers([
    ...DEFAULT_DEPENDENCY_SOURCES,
    ...(options.dependencySources ?? [])
  ]);

  const targetResults: TargetResult[] = targets.map((target) => {
    const unsupported: CheckIssue[] = [];
    const warnings: CheckIssue[] = [];
    const unknown: CheckIssue[] = [];
    const ignored: CheckIssue[] = [];
    const dependencies: CheckIssue[] = [];
    let supported = 0;

    for (const key of knownKeys) {
      const evaluation = evaluateSupport(
        compat.getCompat(key),
        target.browser,
        target.version
      );
      const usages = usageByKey.get(key);

      if (evaluation.state === "supported") {
        supported += 1;
        continue;
      }

      if (
        evaluation.state === "prefixed" &&
        (evaluation.prefixes ?? (evaluation.prefix ? [evaluation.prefix] : [])).some(
          (prefix) => prefixMarkers.get(key)?.has(prefix)
        )
      ) {
        supported += 1;
        continue;
      }

      const classification = classifyUsages(
        usages,
        ignoreMatchers,
        dependencyMatchers
      );
      const sourcePaths = displaySources(
        usages,
        classification,
        dependencyMatchers
      );
      const issue: CheckIssue = {
        key,
        ...evaluation,
        ...(usages ? { usages } : {}),
        ...(sourcePaths ? { sourcePaths } : {})
      };

      if (classification === "ignored") {
        ignored.push(issue);
        continue;
      }
      if (classification === "dependency") {
        dependencies.push(issue);
        continue;
      }

      if (evaluation.state === "unsupported") {
        unsupported.push(issue);
      } else if (WARNING_STATES.has(evaluation.state)) {
        warnings.push(issue);
      } else {
        unknown.push(issue);
      }
    }

    const byKey = (a: CheckIssue, b: CheckIssue) =>
      compareStrings(a.key, b.key);
    const byDependency = (a: CheckIssue, b: CheckIssue) =>
      ISSUE_STATE_ORDER[a.state] - ISSUE_STATE_ORDER[b.state] ||
      compareStrings(a.key, b.key);

    return {
      ...target,
      browserName: compat.browserName(target.browser),
      supported,
      unsupported: unsupported.sort(compareUnsupported),
      warnings: warnings.sort(byKey),
      unknown: unknown.sort(byKey),
      ignored: ignored.sort(byKey),
      dependencies: dependencies.sort(byDependency)
    };
  });

  return { targets: targetResults, unknownKeys };
}

export function checkManifest(
  keys: string[],
  targets: BrowserTarget[],
  compat: CompatDB
): CheckResult {
  return checkFeatures(
    keys.map((key) => ({ key })),
    targets,
    compat
  );
}
