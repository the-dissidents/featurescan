import picomatch from "picomatch";
import type { CompatDB } from "../compat/bcd";
import {
  compareVersions,
  evaluateSupport,
  type SupportEvaluation,
  type SupportState
} from "../compat/support";
import {
  formatDependency,
  normalizeSourcePath,
  parseDependencyPath,
  type DependencyLocation
} from "../dependencies";
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
  includeSource?: string[];
  excludeSource?: string[];
  includePackage?: string[];
  excludePackage?: string[];
  showDependencyPaths?: boolean;
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
  usages?: Usage[];
  sourcePaths?: string[];
  displaySources?: string[];
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

const ISSUE_STATE_ORDER: Record<SupportState, number> = {
  unsupported: 0,
  partial: 1,
  flagged: 2,
  prefixed: 3,
  alternative: 4,
  unknown: 5,
  supported: 6
};

type Matcher = (value: string) => boolean;
type SourceMode = "primary" | "dependency" | "ignored";
type SourceClassification = "none" | "dependency";

interface PackageMatcher {
  name: Matcher;
  version?: Matcher;
}

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

function compileMatchers(globs: string[] | undefined): Matcher[] {
  return (globs ?? []).map((glob) => picomatch(glob, { dot: true }));
}

function splitPackagePattern(pattern: string): {
  name: string;
  version?: string;
} {
  const versionIndex = pattern.lastIndexOf("@");
  if (versionIndex > 0) {
    const version = pattern.slice(versionIndex + 1);
    if (version) {
      return { name: pattern.slice(0, versionIndex), version };
    }
  }
  return { name: pattern };
}

function compilePackageMatchers(patterns: string[] | undefined): PackageMatcher[] {
  return (patterns ?? []).map((pattern) => {
    const parsed = splitPackagePattern(pattern);
    return {
      name: picomatch(parsed.name, { dot: true }),
      ...(parsed.version
        ? { version: picomatch(parsed.version, { dot: true }) }
        : {})
    };
  });
}

function sourcePath(usage: Usage): string {
  return normalizeSourcePath(usage.source?.file ?? usage.file);
}

function matchesAny(value: string, matchers: Matcher[]): boolean {
  return matchers.some((match) => match(value));
}

function matchesPackage(
  dependency: DependencyLocation,
  matchers: PackageMatcher[]
): boolean {
  return matchers.some((matcher) => {
    if (!matcher.name(dependency.name)) {
      return false;
    }
    if (!matcher.version) {
      return true;
    }
    return Boolean(dependency.version && matcher.version(dependency.version));
  });
}

function isUsageActive(
  usage: Usage,
  includeSource: Matcher[],
  excludeSource: Matcher[],
  includePackage: PackageMatcher[],
  excludePackage: PackageMatcher[]
): boolean {
  const source = sourcePath(usage);
  const dependency = parseDependencyPath(source);

  const excluded =
    matchesAny(source, excludeSource) ||
    Boolean(dependency && matchesPackage(dependency, excludePackage));
  if (excluded) {
    return false;
  }

  if (includeSource.length === 0 && includePackage.length === 0) {
    return true;
  }

  return (
    matchesAny(source, includeSource) ||
    Boolean(dependency && matchesPackage(dependency, includePackage))
  );
}

function classifyUsages(usages: Usage[]): SourceClassification {
  if (usages.length === 0) {
    return "none";
  }
  return usages.every((usage) =>
    Boolean(parseDependencyPath(sourcePath(usage)))
  )
    ? "dependency"
    : "none";
}

function computeSources(
  usages: Usage[] | undefined,
  mode: SourceMode,
  showDependencyPaths: boolean
): { sourcePaths?: string[]; displaySources?: string[] } {
  if (!usages || usages.length === 0) {
    return {};
  }

  const sources = [...new Set(usages.map(sourcePath))].sort(compareStrings);
  const sourcePaths =
    mode === "primary"
      ? sources.filter((source) => !parseDependencyPath(source))
      : sources;

  const displaySources = [
    ...new Set(
      sourcePaths.map((source) => {
        const dependency = parseDependencyPath(source);
        return dependency
          ? formatDependency(dependency, showDependencyPaths)
          : source;
      })
    )
  ].sort(compareStrings);

  return {
    ...(sourcePaths.length > 0 ? { sourcePaths } : {}),
    ...(displaySources.length > 0 ? { displaySources } : {})
  };
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

  const includeSource = compileMatchers(options.includeSource);
  const excludeSource = compileMatchers(options.excludeSource);
  const includePackage = compilePackageMatchers(options.includePackage);
  const excludePackage = compilePackageMatchers(options.excludePackage);
  const showDependencyPaths = options.showDependencyPaths ?? false;

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

      let effectiveUsages = usages;
      let mode: SourceMode = "primary";

      if (usages) {
        const active = usages.filter((usage) =>
          isUsageActive(
            usage,
            includeSource,
            excludeSource,
            includePackage,
            excludePackage
          )
        );
        if (active.length === 0) {
          const sources = computeSources(
            usages,
            "ignored",
            showDependencyPaths
          );
          ignored.push({
            key,
            ...evaluation,
            usages,
            ...sources
          });
          continue;
        }

        effectiveUsages = active;
        mode =
          classifyUsages(active) === "dependency" ? "dependency" : "primary";
      }

      const sources = computeSources(
        effectiveUsages,
        mode,
        showDependencyPaths
      );
      const issue: CheckIssue = {
        key,
        ...evaluation,
        ...(effectiveUsages ? { usages: effectiveUsages } : {}),
        ...sources
      };

      if (mode === "dependency") {
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
