import type { CheckIssue, CheckResult } from "../check/index";
import type { Detection, ScanResult } from "../types";
import { VERSION } from "../version";
import { createColors, type Colors } from "./colors";
import { describeKey, kindForKey } from "./describe";

export interface ScanReportOptions {
  verbose?: boolean;
  quiet?: boolean;
  out?: string;
  durationMs?: number;
  stream?: NodeJS.WriteStream;
}

export interface CheckReportOptions {
  stream?: NodeJS.WriteStream;
  groupByKind?: boolean;
}

const GROUP_TITLES: Record<string, string> = {
  html: "HTML",
  css: "CSS",
  js: "JS"
};

function usageLines(
  feature: Detection,
  limit: number,
  colors: Colors
): string[] {
  const usages = feature.usages.slice(0, limit);
  const lines = usages.map((usage) => {
    const snippet = usage.snippet ? `  ${colors.dim(usage.snippet)}` : "";
    const source = usage.source
      ? ` ${colors.cyan(
          `-> ${usage.source.file}:${usage.source.line}:${usage.source.column}${
            usage.source.name ? ` (${usage.source.name})` : ""
          }`
        )}`
      : "";
    return `    ${usage.file}:${usage.line}:${usage.column}${source}${snippet}`;
  });
  const remaining = feature.usages.length - usages.length;
  if (remaining > 0) {
    lines.push(`    ${colors.dim(`... and ${remaining} more`)}`);
  }
  return lines;
}

export function printScanReport(
  result: ScanResult,
  keys: string[],
  options: ScanReportOptions = {}
): void {
  if (options.quiet) {
    return;
  }

  const stream = options.stream ?? process.stderr;
  const colors = createColors(stream);
  const lines: string[] = [];
  lines.push(colors.bold(`featurescan ${VERSION}`));
  const duration =
    options.durationMs === undefined ? "" : ` in ${options.durationMs} ms`;
  lines.push(
    `Scanned ${result.files.length} file${
      result.files.length === 1 ? "" : "s"
    }${duration}`
  );

  if (keys.length === 0) {
    lines.push("Found no features.");
    if (options.out) {
      lines.push(`Manifest written to ${options.out}`);
    }
    stream.write(`${lines.join("\n")}\n`);
    return;
  }

  const groups: Record<string, Detection[]> = { html: [], css: [], js: [] };
  for (const feature of result.features) {
    groups[kindForKey(feature.key)]?.push(feature);
  }

  lines.push(
    `Found ${keys.length} feature${keys.length === 1 ? "" : "s"}: ` +
      (["html", "css", "js"] as const)
        .map((group) => `${groups[group]?.length ?? 0} ${GROUP_TITLES[group]}`)
        .join(", ")
  );

  for (const group of ["html", "css", "js"] as const) {
    const features = groups[group] ?? [];
    if (features.length === 0) {
      continue;
    }
    lines.push("");
    lines.push(colors.bold(`${GROUP_TITLES[group]} (${features.length})`));
    for (const feature of features) {
      lines.push(`  ${colors.cyan(describeKey(feature.key))}`);
      if (options.verbose) {
        lines.push(...usageLines(feature, 3, colors));
      }
    }
  }

  if (result.diagnostics.length > 0) {
    lines.push("");
    lines.push(colors.yellow(`Warnings (${result.diagnostics.length}):`));
    for (const diagnostic of result.diagnostics.slice(0, 20)) {
      const location = diagnostic.file ? `${diagnostic.file}: ` : "";
      lines.push(`  ${location}${diagnostic.message}`);
    }
    if (result.diagnostics.length > 20) {
      lines.push(`  ... and ${result.diagnostics.length - 20} more`);
    }
  }

  if (options.out) {
    lines.push("");
    lines.push(`Manifest written to ${options.out}`);
  }

  stream.write(`${lines.join("\n")}\n`);
}

function issueSources(issue: CheckIssue, colors: Colors): string {
  const sources = issue.displaySources ?? issue.sourcePaths;
  if (!sources || sources.length === 0) {
    return "";
  }
  const shown = sources.slice(0, 3).join(", ");
  const remaining = sources.length - 3;
  return colors.dim(
    ` [${shown}${remaining > 0 ? `, +${remaining}` : ""}]`
  );
}

function issueMarker(issue: CheckIssue, colors: Colors): string {
  switch (issue.state) {
    case "unsupported":
      return colors.red("x");
    case "unknown":
      return colors.yellow("?");
    default:
      return colors.yellow("!");
  }
}

function issueDetail(issue: CheckIssue): string {
  switch (issue.state) {
    case "partial":
      return "partial implementation";
    case "flagged": {
      const flags = issue.flags?.join(", ");
      return flags ? `requires a flag: ${flags}` : "requires a flag";
    }
    case "prefixed":
      return issue.prefix ? `requires prefix ${issue.prefix}` : "requires a prefix";
    case "alternative":
      return issue.alternativeName
        ? `alternative name: ${issue.alternativeName}`
        : "only available under another name";
    case "unsupported": {
      if (issue.removed === true) {
        return "removed";
      }
      if (typeof issue.removed === "string") {
        return `removed in ${issue.removed}`;
      }
      if (typeof issue.added === "string") {
        return `requires ${issue.added}`;
      }
      return "not supported";
    }
    case "unknown":
      return issue.reason ?? "unknown compatibility";
    default:
      return issue.state;
  }
}

type IssueCategory =
  | "unsupported"
  | "warnings"
  | "unknown"
  | "dependencies"
  | "ignored";

type IssueKind = "html" | "css" | "js";

type IssueGroups = Record<IssueKind, Record<IssueCategory, CheckIssue[]>>;

const ISSUE_CATEGORIES: IssueCategory[] = [
  "unsupported",
  "warnings",
  "unknown",
  "dependencies",
  "ignored"
];

const ISSUE_CATEGORY_TITLES: Record<IssueCategory, string> = {
  unsupported: "Unsupported",
  warnings: "Warnings",
  unknown: "Unknown",
  dependencies: "Dependencies",
  ignored: "Ignored"
};

const ISSUE_KINDS: IssueKind[] = ["html", "css", "js"];

function emptyCategoryGroups(): Record<IssueCategory, CheckIssue[]> {
  return {
    unsupported: [],
    warnings: [],
    unknown: [],
    dependencies: [],
    ignored: []
  };
}

function issueLine(
  issue: CheckIssue,
  category: IssueCategory,
  colors: Colors,
  indent: string
): string {
  let marker: string;
  switch (category) {
    case "unsupported":
      marker = colors.red("x");
      break;
    case "warnings":
      marker = colors.yellow("!");
      break;
    case "unknown":
      marker = colors.yellow("?");
      break;
    case "dependencies":
      marker = issueMarker(issue, colors);
      break;
    default:
      marker = colors.dim("-");
      break;
  }

  return `${indent}${marker} ${describeKey(issue.key)} ${colors.dim(
    `(${issueDetail(issue)})`
  )}${issueSources(issue, colors)}`;
}

function categoryTitle(
  category: IssueCategory,
  count: number,
  colors: Colors
): string {
  const title = `${ISSUE_CATEGORY_TITLES[category]} (${count})`;
  switch (category) {
    case "unsupported":
      return colors.red(title);
    case "ignored":
      return colors.dim(title);
    default:
      return colors.yellow(title);
  }
}

function sectionLines(
  category: IssueCategory,
  issues: CheckIssue[],
  colors: Colors,
  indent: string
): string[] {
  return [
    `${indent}${categoryTitle(category, issues.length, colors)}`,
    ...issues.map((issue) => issueLine(issue, category, colors, `${indent}  `))
  ];
}

function groupIssues(target: CheckResult["targets"][number]): IssueGroups {
  const groups: IssueGroups = {
    html: emptyCategoryGroups(),
    css: emptyCategoryGroups(),
    js: emptyCategoryGroups()
  };

  for (const category of ISSUE_CATEGORIES) {
    for (const issue of target[category]) {
      groups[kindForKey(issue.key)][category].push(issue);
    }
  }

  return groups;
}

function allSupportedMessage(
  target: CheckResult["targets"][number],
  colors: Colors
): string {
  return colors.green(
    target.dependencies.length > 0
      ? "  All first-party features supported."
      : target.ignored.length > 0
        ? "  All non-ignored features supported."
        : "  All features supported."
  );
}

export function printCheckReport(
  result: CheckResult,
  options: CheckReportOptions = {}
): void {
  const stream = options.stream ?? process.stdout;
  const colors = createColors(stream);
  const lines: string[] = [];

  for (const target of result.targets) {
    const dependencyText =
      target.dependencies.length > 0
        ? `, ${target.dependencies.length} dependencies`
        : "";
    const ignoredText =
      target.ignored.length > 0 ? `, ${target.ignored.length} ignored` : "";
    lines.push(
      colors.bold(`${target.browserName} ${target.version}`) +
        colors.dim(
          `  ${target.supported} supported, ${target.unsupported.length} unsupported, ${target.warnings.length} warnings${dependencyText}${ignoredText}`
        )
    );

    if (options.groupByKind) {
      const groups = groupIssues(target);
      for (const kind of ISSUE_KINDS) {
        const kindGroups = groups[kind];
        const hasIssues = ISSUE_CATEGORIES.some(
          (category) => kindGroups[category].length > 0
        );
        if (!hasIssues) {
          continue;
        }

        lines.push(colors.bold(`  ${GROUP_TITLES[kind]}`));
        for (const category of ISSUE_CATEGORIES) {
          const issues = kindGroups[category];
          if (issues.length > 0) {
            lines.push(...sectionLines(category, issues, colors, "    "));
          }
        }
      }
    } else {
      for (const category of ISSUE_CATEGORIES) {
        const issues = target[category];
        if (issues.length > 0) {
          lines.push(...sectionLines(category, issues, colors, "  "));
        }
      }
    }

    if (
      target.unsupported.length === 0 &&
      target.warnings.length === 0 &&
      target.unknown.length === 0
    ) {
      lines.push(allSupportedMessage(target, colors));
    }

    lines.push("");
  }

  if (result.unknownKeys.length > 0) {
    lines.push(
      colors.yellow(`Unknown feature keys (${result.unknownKeys.length}):`)
    );
    for (const key of result.unknownKeys) {
      lines.push(`  ${key}`);
    }
    lines.push("");
  }

  stream.write(`${lines.join("\n").trimEnd()}\n`);
}

export function formatCheckJson(result: CheckResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}
